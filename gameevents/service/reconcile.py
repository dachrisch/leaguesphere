"""Verify and rebuild a game's projection from its event log (T6).

The projectors are the only writers of ``GameState`` and of the ``TeamLog``
rows a submission owns, so a replay of the log is the reference those two must
equal. This module is the one place that does the comparison and the one that
can put them back:

- :func:`check_games` replays one or many games and reports the **first**
  offending ``seq`` per game. Bulk use (``--all``) loads events, states, rows
  and results once, so the cost is five queries for a gameday, not five per
  event or per game (the command adds one more to count the skipped legacy
  games).
- :func:`rebuild_game` drops what the log owns and replays it.

Ownership
---------
A row belongs to the projection when its ``TeamLog.sequence`` is one the log
actually produced (``> 0`` -- see ``gameevents/service/replay.py``). Sequence
``0`` is the shared bucket of penalties, clocks, timeouts and period markers
that the scorecard wrote *before* the log existed too, so it is never dropped,
never re-inserted and not compared row-by-row; its content does not affect the
score or the period. The same rule makes a mixed game (legacy rows from before
the deploy, then events) safe: ``rebuild`` repairs the groups the log names and
leaves the pre-log rows untouched -- it does not pretend the log can reconstruct
them. ``check`` therefore also ignores extra sequence-0 rows.

A state-only difference has no row to point at, so it is reported at the log's
last ``seq``: that is where the projection ends and where a wrong score is
visible. Row differences report their own (lower) sequence and win the
"first offending" ordering.

``Gameresult`` is deliberately not rebuilt: it is maintained by the write path
(``GameService.write_projected_gamelog``), not a projection of the log, and
rewriting it from a replay would double-apply the half-score diff a rebuild
does not own.
"""

from collections import defaultdict
from dataclasses import dataclass
from typing import Iterable, Optional

from django.db import transaction

from gameevents.models import GameEvent, GameState
from gameevents.service.append import (
    AuthorResolver,
    MissingAuthor,
    author_id_of,
    values_from_rows,
)
from gameevents.service.projector import InvalidEnvelope
from gameevents.service.replay import Replay, replay_events
from gamedays.models import Gameresult, Gameinfo, TeamLog

STATE_FIELDS = ("score_home", "score_away", "period", "in_possession", "last_seq")
_ROW_FIELDS = (
    "event",
    "side",
    "player",
    "input",
    "value",
    "half",
    "cop",
    "isDeleted",
)


class LegacyGameError(Exception):
    """The game has no events: its rows are the source of truth, not a replay."""

    def __init__(self, game_id: int):
        self.game_id = game_id
        super().__init__(
            f"game {game_id} has no events (legacy game): there is no log to "
            "replay, so there is nothing to rebuild -- its TeamLog rows are "
            "the record"
        )


class RebuildError(Exception):
    """The log cannot be written back (a broken game setup, not a client error)."""


@dataclass(frozen=True)
class Drift:
    """One difference between the stored projection and the replay."""

    seq: Optional[int]
    kind: str  # "state" | "rows" | "flag" | "log"
    detail: str


@dataclass(frozen=True)
class GameCheck:
    game_id: int
    event_count: int
    last_seq: int
    drift: Optional[Drift] = None
    legacy: bool = False

    @property
    def ok(self) -> bool:
        return self.legacy or self.drift is None

    def summary(self) -> str:
        if self.legacy:
            return f"game {self.game_id}: skipped (no events, legacy game)"
        if self.drift is None:
            return (
                f"game {self.game_id}: ok "
                f"({self.event_count} events, seq {self.last_seq})"
            )
        where = "?" if self.drift.seq is None else self.drift.seq
        return (
            f"game {self.game_id}: DRIFT at seq {where} "
            f"({self.drift.kind}): {self.drift.detail}"
        )


@dataclass(frozen=True)
class RebuildResult:
    game_id: int
    event_count: int
    last_seq: int
    sequences: int
    rows_written: int


def owned_sequences(replay: Replay) -> set[int]:
    """The ``TeamLog.sequence`` groups the log produced (never sequence 0)."""

    return {seq for seq, rows in replay.rows_by_sequence.items() if seq > 0 and rows}


def _teams_for(game_ids: Iterable[int]):
    """``({game: {team_id: 'home'|'away'}}, {game: {'home': id, 'away': id}})``."""

    sides: dict[int, dict[int, str]] = defaultdict(dict)
    team_ids: dict[int, dict[str, int]] = defaultdict(dict)
    for game_id, is_home, team_id in Gameresult.objects.filter(
        gameinfo_id__in=list(game_ids)
    ).values_list("gameinfo_id", "isHome", "team_id"):
        if team_id is None:
            continue
        side = "home" if is_home else "away"
        sides[game_id][team_id] = side
        team_ids[game_id][side] = team_id
    return sides, team_ids


def _signature(row, sides: dict[int, str]):
    """Comparable tuple for a projected row or a stored ``TeamLog`` row."""

    if isinstance(row, TeamLog):
        return (
            row.event,
            sides.get(row.team_id),
            row.player,
            row.input,
            row.value,
            row.half,
            row.cop,
            row.isDeleted,
        )
    return tuple(getattr(row, field) for field in _ROW_FIELDS)


def _describe(expected, stored) -> str:
    return ", ".join(
        f"{field} {got!r} != {want!r} (log)"
        for field, want, got in zip(_ROW_FIELDS, expected, stored)
        if want != got
    )


def _compare_sequence(seq: int, expected, actual, sides) -> Optional[Drift]:
    if len(actual) != len(expected):
        return Drift(
            seq,
            "rows",
            f"{len(actual)} row(s) stored, {len(expected)} in the log",
        )
    for index, (want, got) in enumerate(zip(expected, actual)):
        want_signature = _signature(want, sides)
        got_signature = _signature(got, sides)
        if want_signature != got_signature:
            return Drift(
                seq,
                "rows",
                f"row {index}: {_describe(want_signature, got_signature)}",
            )
    return None


def compare(replay: Replay, state, rows, sides) -> Optional[Drift]:
    """The first drift of one game, or ``None`` when the projection is exact."""

    drifts: list[Drift] = []
    last_seq = replay.state.last_seq
    if state is None:
        drifts.append(
            Drift(
                last_seq,
                "state",
                "no GameState row (run rebuild_game_projection --game <id>)",
            )
        )
    else:
        if state.needs_reconciliation:
            drifts.append(
                Drift(
                    last_seq,
                    "flag",
                    state.reconciliation_note or "needs_reconciliation is set",
                )
            )
        differences = []
        for field in STATE_FIELDS:
            stored = getattr(state, field)
            if field == "in_possession":
                stored = stored or None
            expected = getattr(replay.state, field)
            if stored != expected:
                differences.append(f"{field} {stored!r} != {expected!r} (log)")
        if differences:
            drifts.append(Drift(last_seq, "state", ", ".join(differences)))

    rows_by_sequence: dict[int, list] = defaultdict(list)
    for row in rows:
        rows_by_sequence[row.sequence].append(row)
    for seq in sorted(owned_sequences(replay)):
        drift = _compare_sequence(
            seq,
            replay.rows_by_sequence[seq],
            rows_by_sequence.get(seq, []),
            sides,
        )
        if drift is not None:
            drifts.append(drift)

    if not drifts:
        return None
    return min(
        drifts,
        key=lambda drift: (
            drift.seq is None,
            drift.seq if drift.seq is not None else 0,
        ),
    )


def _replay(game_events) -> Replay:
    return replay_events(values_from_rows(game_events))


def check_games(game_ids: Optional[Iterable[int]] = None) -> list[GameCheck]:
    """Check every game with events (``None``) or the given ids.

    Five queries in total, however many games or events: the event stream is
    loaded once and grouped in Python. An id with no events is reported as a
    skipped legacy game (never a failure).
    """

    if game_ids is None:
        requested = list(
            GameEvent.objects.values_list("game_id", flat=True)
            .distinct()
            .order_by("game_id")
        )
    else:
        requested = list(dict.fromkeys(game_ids))

    events_by_game: dict[int, list] = defaultdict(list)
    for event in GameEvent.objects.filter(game_id__in=requested).order_by(
        "game_id", "seq"
    ):
        events_by_game[event.game_id].append(event)
    states = {
        state.game_id: state
        for state in GameState.objects.filter(game_id__in=requested)
    }
    rows_by_game: dict[int, list] = defaultdict(list)
    for row in TeamLog.objects.filter(gameinfo_id__in=requested).order_by(
        "gameinfo_id", "pk"
    ):
        rows_by_game[row.gameinfo_id].append(row)
    sides, _team_ids = _teams_for(requested)

    checks: list[GameCheck] = []
    for game_id in requested:
        game_events = events_by_game.get(game_id, [])
        if not game_events:
            checks.append(GameCheck(game_id, 0, 0, legacy=True))
            continue
        try:
            replay = _replay(game_events)
        except InvalidEnvelope as error:
            checks.append(
                GameCheck(
                    game_id,
                    len(game_events),
                    0,
                    drift=Drift(None, "log", str(error)),
                )
            )
            continue
        checks.append(
            GameCheck(
                game_id,
                len(game_events),
                replay.state.last_seq,
                drift=compare(
                    replay,
                    states.get(game_id),
                    rows_by_game.get(game_id, []),
                    sides.get(game_id, {}),
                ),
            )
        )
    return checks


@transaction.atomic
def rebuild_game(game, *, author=None) -> RebuildResult:
    """Drop the projection the log owns and replay it.

    Refuses a legacy game (:class:`LegacyGameError`): a game without events has
    no log, so "rebuilding" would have to invent one. Everything runs in one
    transaction -- a failure leaves the previous rows and state in place.

    Authors: a rebuilt row keeps the **actor of the event it projects**
    (``GameEvent.author``), so a rebuild repairs the log's authorship instead of
    reshuffling it. An event without an actor -- recorded before the column
    existed, or by a system write -- falls back to the author the replaced row
    had (a tick's author is evidence too), then to ``--author``, and finally to
    the game's author (the gameday's author, since ``Gameinfo`` has none of its
    own). Deriving it here is deliberate: ``TeamLog.author``'s ``default=1`` is
    a magic id that need not exist, so the last candidate is the game's author
    and never the default. If none of them names an existing user the rebuild
    refuses (``RebuildError`` -> ``CommandError``) rather than writing a row the
    database cannot accept.
    """

    Gameinfo.objects.select_for_update().get(pk=game.pk)
    events = list(GameEvent.objects.filter(game=game).order_by("seq"))
    if not events:
        raise LegacyGameError(game.pk)
    replay = _replay(events)
    owned = owned_sequences(replay)
    _sides, team_ids = _teams_for([game.pk])
    teams = team_ids.get(game.pk, {})
    authors = AuthorResolver(game)
    override = author_id_of(author)

    existing: dict[int, list] = defaultdict(list)
    for row in TeamLog.objects.filter(
        gameinfo=game, sequence__in=owned
    ).order_by("pk"):
        existing[row.sequence].append(row)

    TeamLog.objects.filter(gameinfo=game, sequence__in=owned).delete()

    new_rows = []
    for seq in sorted(owned):
        previous = existing.get(seq, [])
        for index, row in enumerate(replay.rows_by_sequence[seq]):
            if row.side is not None and row.side not in teams:
                raise RebuildError(
                    f"game {game.pk} has no {row.side} team result; the "
                    "projection cannot be re-created without it"
                )
            try:
                author_id = authors.resolve(
                    row.author_id,
                    previous[index].author_id if index < len(previous) else None,
                    override,
                    authors.game_author_id(),
                )
            except MissingAuthor as error:
                raise RebuildError(str(error)) from None
            values = {
                "gameinfo": game,
                "team_id": teams.get(row.side) if row.side else None,
                "sequence": row.sequence,
                "player": row.player,
                "event": row.event,
                "input": row.input,
                "value": row.value,
                "cop": row.cop,
                "half": row.half,
                "isDeleted": row.isDeleted,
                "author_id": author_id,
            }
            if index < len(previous):
                # Keep the tick's timestamp: a rebuild must not reshuffle the
                # liveticker's ordering of an unchanged play.
                values["created_time"] = previous[index].created_time
            new_rows.append(TeamLog(**values))
    TeamLog.objects.bulk_create(new_rows)

    GameState.objects.update_or_create(
        game=game,
        defaults={
            "score_home": replay.state.score_home,
            "score_away": replay.state.score_away,
            "period": replay.state.period,
            "in_possession": replay.state.in_possession or None,
            "last_seq": replay.state.last_seq,
            "needs_reconciliation": False,
            "reconciliation_note": "",
        },
    )
    return RebuildResult(
        game_id=game.pk,
        event_count=len(events),
        last_seq=replay.state.last_seq,
        sequences=len(owned),
        rows_written=len(new_rows),
    )
