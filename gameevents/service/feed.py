"""The read model the liveticker consumes: ``GET /api/game/<id>/feed``.

Two kinds of game answer the same shape ``{state, events, cursor}``:

- **event-sourced** -- the game has events. ``GameState`` is the projection and
  the events after ``after`` are returned. ``ETag`` is ``"<last_seq>"``: the
  cursor is the response identity, so a client that already has everything up
  to ``last_seq`` gets a ``304``.
- **legacy** -- rows exist (or the game has not started) but no event does.
  The state is derived from ``TeamLog`` through the existing ``GameLog``
  service (the same scoring rule every consumer uses today), ``events`` is
  empty and the cursor is ``0``. Its ETag is derived from the rows, because
  ``"0"`` would never change while a legacy game keeps being written; a
  ``304`` for a changed score is exactly the silent staleness this endpoint
  exists to prevent.

A flagged projection is not served as the game's state. ``needs_reconciliation``
means the log cannot represent what an official did (see
``gameevents/service/undo.py``); answering ``409`` with the flag in the body
makes that visible to the client instead of showing a wrong score. The flag is
*not* checked for legacy games: they have no event-derived state to be wrong
about -- their rows are the source of truth.

A game that exists but has neither rows nor events is a coherent ``200``
(0:0, period 1, cursor 0), not a ``404``: the scorecard/feed is polled for a
game id as soon as it is scheduled, and "has not started" must be
distinguishable from "wrong game id" -- the latter stays a ``404``.
"""

from dataclasses import dataclass, replace
from typing import Optional

from django.db.models import Count, Max

from gameevents.models import GameEvent, GameState
from gameevents.service.projector import GameStateValue
from gamedays.models import Gameresult, TeamLog
from gamedays.service.gamelog import GameLog
from league_manager.utils.etag import build_etag


class ProjectionUnavailable(Exception):
    """The feed must not serve the projection (HTTP 409)."""


@dataclass(frozen=True)
class Feed:
    """One response body plus the validator that identifies it."""

    state: GameStateValue
    events: list[dict]
    cursor: int
    etag: str


def event_body(event: GameEvent) -> dict:
    """One event in the wire shape (the append envelope plus its seq).

    ``undo_of`` is the *target's* seq, not its primary key: the log is ordered
    by ``seq`` and a client never sees a pk. Everything else is exactly what
    was appended, so a feed consumer can treat the event store as the record.
    """

    return {
        "seq": event.seq,
        "type": event.type,
        "code": event.code,
        "side": event.side or None,
        "player": event.player,
        "period": event.period,
        "payload": event.payload or {},
        "client_id": event.client_id,
        "undo_of": event.undo_of.seq if event.undo_of_id else None,
        "source": event.source,
    }


def state_body(state: GameStateValue) -> dict:
    return {
        "score_home": state.score_home,
        "score_away": state.score_away,
        "period": state.period,
        "in_possession": state.in_possession or None,
        "last_seq": state.last_seq,
    }


def get_feed(game, after: int = 0) -> Feed:
    """The game's state and the events after ``after``.

    Raises :class:`ProjectionUnavailable` when the game has events but its
    projection may not be served (flagged, or missing altogether).
    """

    events = GameEvent.objects.filter(game=game).select_related("undo_of")
    if not events.exists():
        return legacy_feed(game)

    state = GameState.objects.filter(game=game).first()
    if state is None:
        raise ProjectionUnavailable(
            "the event log has no projection for this game "
            "(run rebuild_game_projection)"
        )
    if state.needs_reconciliation:
        note = state.reconciliation_note or "the projection cannot represent the log"
        raise ProjectionUnavailable(note)

    new_events = list(events.filter(seq__gt=after).order_by("seq"))
    last_seq = state.last_seq
    cursor = new_events[-1].seq if new_events else last_seq
    return Feed(
        state=GameStateValue(
            score_home=state.score_home,
            score_away=state.score_away,
            period=state.period,
            in_possession=state.in_possession or None,
            last_seq=last_seq,
        ),
        events=[event_body(event) for event in new_events],
        cursor=cursor,
        etag=f'"{last_seq}"',
    )


def legacy_feed(game) -> Feed:
    """Serve a game without events from its ``TeamLog`` rows (cursor 0)."""

    state = legacy_state(game)
    return Feed(
        state=state,
        events=[],
        cursor=0,
        etag=legacy_etag(game),
    )


def legacy_state(game) -> GameStateValue:
    """Derive ``{score, period, possession}`` from the rows the app wrote.

    Scoring is ``GameLog``'s, not a second sum: it is the rule the liveticker,
    the league table and the finalisation already read. Period follows the same
    service's half rule (``gameHalftime`` set -> second half). Possession is
    stored on ``Gameinfo`` as a team name, so it is mapped back to
    home/away via the game's results; an empty or unknown value is ``None``.
    """

    results = list(
        Gameresult.objects.filter(gameinfo=game).values_list(
            "isHome", "team__name", "team__description"
        )
    )
    if not results:
        # The game exists but has not been set up: a coherent empty state.
        return GameStateValue()

    try:
        gamelog = GameLog(game)
    except Gameresult.DoesNotExist:
        # A half-configured game (one result row) is not worth a 500 on a
        # read endpoint; it simply has no rows to score yet.
        return GameStateValue()
    state = GameStateValue(
        score_home=gamelog.get_home_score(),
        score_away=gamelog.get_away_score(),
        period=1 if gamelog.is_firsthalf() else 2,
    )
    possession = (game.in_possession or "").strip()
    if possession:
        for is_home, name, description in results:
            if possession in (name, description):
                state = replace(
                    state, in_possession="home" if is_home else "away"
                )
                break
    return state


def legacy_etag(game) -> str:
    """An ETag that changes whenever the derived legacy state can.

    The rows carry the score and the ticks; ``Gameinfo.updated_at`` carries
    the half and possession changes that write no row. A legacy game has no
    cursor to identify its response, so the validator has to describe the
    inputs or a ``304`` would freeze a stale score.
    """

    rows = TeamLog.objects.filter(gameinfo=game).aggregate(
        count=Count("pk"),
        latest=Max("pk"),
        latest_updated=Max("updated_at"),
    )
    return build_etag(
        "legacy",
        game.updated_at,
        rows["count"] or 0,
        rows["latest"] or 0,
        rows["latest_updated"] or "",
    )


def etag_matches(if_none_match: Optional[str], etag: str) -> bool:
    """Whether ``If-None-Match`` names the current entity tag.

    Handles the header's list form, ``*`` and the weak prefix; the stored
    validators are strong quoted tags, so comparing the normalised candidate
    to ``etag`` is enough.
    """

    if not if_none_match:
        return False
    for candidate in if_none_match.split(","):
        candidate = candidate.strip()
        if candidate == "*":
            return True
        if candidate.startswith("W/"):
            candidate = candidate[2:].strip()
        if candidate == etag:
            return True
    return False
