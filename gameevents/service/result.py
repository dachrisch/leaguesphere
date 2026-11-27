"""Record a manual result edit on a v2-owned game as a correction event.

``PATCH /api/gameinfo/<id>/result/`` (``GameResultUpdateAPIView``) writes
``Gameresult`` directly: it is how the gameday's staff enter or fix a result
after the fact. For a game the old app or nobody scored that is the whole
story -- the result is the record, and the liveticker reads it.

A **v2-owned** game (one with a ``source=v2`` event, ADR-0026) is different:
the liveticker and the feed serve its ``GameState``, which is a replay of the
event log. An edit that only touched ``Gameresult`` would leave the public
score on the old projection (a v2 touchdown 6:0, a manual 21:3, a ticker still
at 6:0), and ``check_game_projection`` could not see it, because the state
still equals the replay of the same log. The architecture plan therefore
requires manual result edits on a v2 game to emit a correction.

:func:`record_result_correction` runs in the PATCH's transaction, after the
``Gameresult`` rows were written. It reads the result back (``fh + sh`` per
side, the same total every ``Gameresult`` reader uses) and, when it differs
from the log's projected score, appends one ``correction/result`` event with
the new score and the score it replaced (``payload.before``). The projector
sets ``GameState`` to that score; later events add to it.

- **Source** is ``staff``: ADR-0026 reserves ``v2`` for the canonical endpoint,
  and a manual result is neither the old scorecard (``legacy``) nor a device.
  A ``staff`` event never makes a game v2-owned; only games that already are
  get one.
- **Idempotent**: a PATCH whose result equals the projected score (a repeated
  PATCH, or a halftime edit that leaves the total alone) records nothing.
- **No rows**: ``TeamLog`` stays what the scorecard recorded. The rows are the
  play-by-play; the corrected score is the result's. ``check_game_projection``
  compares the state with a replay that includes the correction, so it agrees.

After a manual result
---------------------
Later writes keep moving ``Gameresult`` by the existing half-score delta rule
(#1988), which stores a half that would drop below 0 as 0. The projection has
no halves, so on its own it would subtract past that floor: a v2 touchdown
(6:0), a halftime edit to 0:0, then an undo of the touchdown would show -6
while ``Gameresult`` says 0. :func:`follow_manual_result` closes that gap: on a
game whose log holds a result correction, ``append_submission`` compares the
new projection with ``Gameresult`` and, when they differ, records one more
``correction/result`` (``payload.reason = "follows_result"``) in the same
transaction. The table stays the one scoring rule; the log records where it
overrode the plain sum.
"""

import logging
import uuid

from gameevents.models import GameEvent
from gameevents.service.append import append_submission, project_game
from gameevents.service.projector import (
    RESULT_CORRECTION_CODE,
    GameEventValue,
    InvalidEnvelope,
)
from gamedays.models import Gameresult

logger = logging.getLogger(__name__)

# ``payload.reason`` of a correction that follows the table after a later
# write, as opposed to one recorded by the result edit itself.
FOLLOWS_RESULT = "follows_result"


class NegativeResult(InvalidEnvelope):
    """The edited result has a negative total (client error -> HTTP 400)."""


def is_v2_owned(game) -> bool:
    """The ADR-0026 discriminator: the game has a canonical (``v2``) event."""

    return GameEvent.objects.filter(game=game, source=GameEvent.Source.V2).exists()


def _result_totals(game):
    """``(home, away)`` as ``Gameresult`` now says, or ``None`` if incomplete."""

    totals = {}
    for is_home, fh, sh in Gameresult.objects.filter(gameinfo=game).values_list(
        "isHome", "fh", "sh"
    ):
        totals["home" if is_home else "away"] = (fh or 0) + (sh or 0)
    if set(totals) != {"home", "away"}:
        logger.warning(
            "Game %s has no complete home/away result; its projection cannot "
            "follow the result",
            game.pk,
        )
        return None
    return totals["home"], totals["away"]


def _append_result(game, state, totals, *, author, reason=None):
    """Append one ``correction/result`` moving ``state`` to ``totals``."""

    home, away = totals
    payload = {
        "home": home,
        "away": away,
        "before": {"home": state.score_home, "away": state.score_away},
    }
    if reason is not None:
        payload["reason"] = reason
    client_id = str(uuid.uuid4())
    outcome = append_submission(
        game,
        [
            GameEventValue(
                type=GameEvent.Type.CORRECTION,
                code=RESULT_CORRECTION_CODE,
                period=state.period,
                payload=payload,
                client_id=client_id,
            )
        ],
        client_id=client_id,
        source=GameEvent.Source.STAFF,
        write_rows=False,
        author=author,
    )
    logger.info(
        "Recorded result of game %s (%s:%s -> %s:%s%s) as correction seq %s",
        game.pk,
        state.score_home,
        state.score_away,
        home,
        away,
        f", {reason}" if reason else "",
        outcome.last_seq,
    )
    return outcome


def record_result_correction(game, *, author=None):
    """Append the correction that makes the projection match the result.

    Returns the appended ``GameEvent``, or ``None`` when nothing was recorded
    (not a v2-owned game, no complete result, or the projection already shows
    the result). Raises :class:`NegativeResult` for a negative total.
    """

    if not is_v2_owned(game):
        return None
    totals = _result_totals(game)
    if totals is None:
        return None
    if min(totals) < 0:
        raise NegativeResult(f"result {totals[0]}:{totals[1]} is negative")
    state = project_game(game).state
    if (state.score_home, state.score_away) == totals:
        return None
    outcome = _append_result(game, state, totals, author=author)
    return GameEvent.objects.get(game=game, seq=outcome.last_seq)


def follow_manual_result(game, state, *, author=None):
    """Re-align the projection with ``Gameresult`` after a later write.

    Called by ``append_submission`` for a game whose log already holds a
    result correction. Returns the new state, or ``None`` when the
    projection already equals the result.
    """

    totals = _result_totals(game)
    if totals is None or (state.score_home, state.score_away) == totals:
        return None
    return _append_result(
        game, state, totals, author=author, reason=FOLLOWS_RESULT
    ).state
