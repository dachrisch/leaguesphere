"""Pure projector: events -> game state plus the ``TeamLog`` rows to write.

This module deliberately imports no Django code. ``GameStateValue``,
``TeamLogRow``, ``GameEventValue`` and ``Projection`` are plain dataclasses, so
the meaning of an event can be unit-tested without a database (and the same
code can later run in a worker).

The projected rows reproduce ``gamedays.service.gamelog.GameLogCreator``
exactly -- event names, player, input, value, half, cop, isDeleted, sequence
**and author** -- including its quirks, because every existing consumer
(liveticker, statistics, match report, league table) reads ``TeamLog`` and must
not notice the switch. The author a row is written with is an input (the
event's actor), not a constant: the legacy writer stores the request user, so a
projection that used ``TeamLog``'s ``default=1`` would silently reassign plays
and break on a database whose user table has no id 1. See
``gameevents/tests/golden_cases.py`` for the fixture table and
``test_projector_golden.py`` for the comparison against the real writers.

Grouping / sequence
-------------------
``Projection.rows`` are to be inserted; ``Projection.deleted_sequences`` and
``Projection.restored_sequences`` name existing ``TeamLog.sequence`` groups the
caller must mark ``isDeleted=True`` / ``False`` in place. Rows are never
deleted physically.

The unit of grouping is the **submission**, not the event: one legacy POST
carries a touchdown and its conversion and the legacy writer stores both with
one ``TeamLog.sequence``. A submission is identified by its events sharing one
``client_id``; ``project_submission`` assigns every row it produces one
sequence, the smallest event ``seq`` in that submission (event ``seq`` values
are per-game, strictly increasing, and the first event of a submission is
therefore unique). Excluded rows (``Strafe``, ``Spielzeit``, ``Auszeit``,
``First Down``) and the period markers keep sequence 0, exactly as today.
``apply`` is the per-event entry point: it projects state/score and rows, but
leaves ``TeamLogRow.sequence`` at 0 until ``project_submission`` assigns it.

Corrections
-----------
A ``correction`` inserts no row. It resolves its target event to the target's
legacy sequence and returns that sequence in ``deleted_sequences`` (or, when
the target is itself a correction, in ``restored_sequences``); it also reverses
the target's score effect. The target row is never removed.

A target whose rows live in the *shared* sequence 0 (a penalty, a clock, a
timeout, a marker) is named **by its event**, not by the sequence: every one of
them shares that bucket, so a sequence delete would wipe them all. The effect
then carries the target's ``seq`` in ``deleted_rows``/``restored_rows``, and the
service marks the one row the target wrote (``GameEvent.team_log``).

The service that loads a stored correction must resolve two things for the
projector:

- ``GameEventValue.legacy_sequence`` on the target (the sequence of the
  target's submission), and
- ``GameEventValue.undo_rows`` with the rows the target's legacy sequence
  currently projects, so undoing a touchdown+conversion group reverses the
  whole group's score. Empty ``undo_rows`` means "project the target alone";
  rows already marked ``isDeleted`` are not subtracted.

Undoing a correction restores the sequences the first correction deleted and
adds back the score it removed, so an undo of an undo is symmetric.

Envelope -> projected row (slice 1)::

    score / touchdown              -> Touchdown (6)
    score / pat1, pat2, overtime   -> 1-Extra-Punkt, 2-Extra-Punkte, Overtime
    score / safety + payload.points-> Safety (+1) / Safety (+2)
    penalty / <penalty name>       -> Strafe, input=<penalty name>
    series / first_down            -> First Down
    possession / turnover          -> Turnover (cop)
    possession / interception      -> Interception (cop)
    possession / home, away        -> state only (no TeamLog row)
    timeout / home, away           -> Auszeit, input from payload
    time / clock                   -> Spielzeit, input from payload
    period / start, half_time, end -> Spiel gestartet / 2. Halbzeit gestartet /
                                      Spiel beendet (half=0, no team)
    correction / undo              -> deleted/restored sequences, no row

``series`` is not in the plan's short type list, but scorecard v2 sends First
Down today and the golden test must reproduce its row; it is the smallest
addition that keeps the vocabulary honest. ``pat1``/``pat2`` use distinct codes
while safety carries ``payload.points``: that asymmetry is deliberate until
slice 2's sport definitions replace both.

Only user-data problems raise the typed ``InvalidEnvelope`` /
``UnsupportedEventCode``; the append endpoint maps those to 400. Bugs surface
as ordinary exceptions (500).
"""

from dataclasses import dataclass, field, replace
from typing import Any, Optional


class InvalidEnvelope(Exception):
    """The event envelope cannot be projected (client error -> HTTP 400)."""


class UnsupportedEventCode(InvalidEnvelope):
    """The envelope's ``code`` is unknown for its type (client error -> 400)."""


# Mirrors gamedays.service.gamelog.SCORING_EVENT_VALUES / EXCLUDED_EVENTS.
# Kept local so this module stays Django-free; the golden tests assert the two
# copies agree.
SCORING_EVENT_VALUES = {
    "Touchdown": 6,
    "Overtime": 1,
    "1-Extra-Punkt": 1,
    "Safety (+1)": 1,
    "2-Extra-Punkte": 2,
    "Safety (+2)": 2,
}
EXCLUDED_EVENTS = ("Strafe", "Spielzeit", "Auszeit", "First Down")

# Rows the current writer stores with sequence 0: the excluded events and the
# half/game markers (GameService._create_log_entry). Duplicated literals are
# guarded against drift by test_projector.py.
_MARKER_EVENTS = {
    "start": "Spiel gestartet",
    "half_time": "2. Halbzeit gestartet",
    "end": "Spiel beendet",
}
_ZERO_SEQUENCE_EVENTS = frozenset(EXCLUDED_EVENTS) | frozenset(_MARKER_EVENTS.values())

_SIDES = ("home", "away")


@dataclass(frozen=True)
class GameStateValue:
    score_home: int = 0
    score_away: int = 0
    period: int = 1
    in_possession: Optional[str] = None
    last_seq: int = 0


@dataclass(frozen=True)
class TeamLogRow:
    """One projected ``TeamLog`` row, in the shape today's writer produces.

    ``side`` names the team the row belongs to (``None`` for the period
    markers, whose ``TeamLog.team`` is null). ``sequence`` is assigned by
    ``project_submission`` (one sequence per submission); it stays 0 for
    excluded rows and markers, matching the legacy writer.

    ``author_id`` is the id of the event's **actor** (``GameEvent.author``),
    copied so the projected ``TeamLog.author`` is the user who caused the play
    -- like the legacy writer, which stores the request user -- instead of
    ``TeamLog``'s ``default=1``. It is an id, not a user object, so this module
    stays Django-free and a replay never has to fetch a user per row. ``None``
    means the event has no actor; the writer then falls back to the game's
    author (see ``gameevents/service/append.py``), never to the default.
    """

    event: str
    side: Optional[str] = None
    player: Optional[int] = None
    input: Optional[str] = None
    value: int = 0
    half: int = 1
    cop: bool = False
    isDeleted: bool = False
    sequence: int = 0
    author_id: Optional[int] = None
    # The event ``seq`` that produced this row. The writer stores it on the
    # ``GameEvent`` (``team_log``), which is what lets a *sequence-0* row be
    # named at all: penalties, clocks, timeouts and markers all share sequence
    # 0, so a sequence cannot identify one of them.
    source_seq: Optional[int] = None


@dataclass(frozen=True)
class GameEventValue:
    """The projector's view of one ``GameEvent`` row.

    ``undo_of`` holds the *target event itself* rather than its database id, so
    ``apply`` stays pure. ``legacy_sequence`` is the sequence of the event's
    submission (set by the service for stored events); ``undo_rows`` is the
    current projection of that sequence, supplied only when this event is a
    correction's target.
    """

    type: str
    code: str = ""
    side: Optional[str] = None
    player: Optional[int] = None
    period: int = 1
    payload: dict = field(default_factory=dict)
    seq: Optional[int] = None
    # The submission (the client outbox id) this event belongs to. The
    # projector does not use it for meaning, but a submission is the unit that
    # shares one legacy ``TeamLog.sequence``, so replay and correction
    # resolution group by it. ``None`` for values that were never stored.
    client_id: Optional[str] = None
    legacy_sequence: Optional[int] = None
    # The id of the user who caused the event (``GameEvent.author_id``); it
    # travels to every ``TeamLogRow`` this event projects. ``None`` when the
    # event has no actor (system-generated or stored before the column
    # existed) -- the writer then falls back to the game's author.
    author_id: Optional[int] = None
    undo_of: Optional["GameEventValue"] = None
    undo_rows: tuple[TeamLogRow, ...] = ()


@dataclass(frozen=True)
class Projection:
    """Everything one event/submission changes in the projection.

    ``rows`` are inserted; ``deleted_sequences`` are ``TeamLog.sequence``
    groups to mark deleted; ``restored_sequences`` are groups to mark alive
    again (undo of an undo). No row is ever removed physically.
    """

    state: GameStateValue
    rows: list[TeamLogRow] = field(default_factory=list)
    deleted_sequences: list[int] = field(default_factory=list)
    restored_sequences: list[int] = field(default_factory=list)
    # Corrections that name a *row* instead of a group: the target event seqs
    # whose row is to be marked deleted/restored. Used for the shared sequence
    # 0, where deleting a group would wipe every penalty of the game.
    deleted_rows: list[int] = field(default_factory=list)
    restored_rows: list[int] = field(default_factory=list)


def _side(value: Optional[str]) -> Optional[str]:
    if value in (None, ""):
        return None
    if value not in _SIDES:
        raise InvalidEnvelope(f"unknown side {value!r}")
    return value


def _require_side(event: GameEventValue) -> str:
    side = _side(event.side)
    if side is None:
        raise InvalidEnvelope(f"{event.type} event needs side home|away")
    return side


def _advance(state: GameStateValue, event: GameEventValue, **changes) -> GameStateValue:
    """Apply the bookkeeping every event shares (cursor, period)."""

    changes.setdefault("period", event.period)
    if event.seq is not None:
        changes["last_seq"] = event.seq
    return replace(state, **changes)


def _row(
    event: GameEventValue,
    name: str,
    *,
    side: Optional[str] = None,
    player: Optional[int] = None,
    input: Optional[str] = None,
    value: int = 0,
    half: Optional[int] = None,
    cop: bool = False,
    isDeleted: bool = False,
) -> TeamLogRow:
    # Sequence is assigned once per submission by project_submission.
    return TeamLogRow(
        event=name,
        side=_side(side),
        player=player,
        input=input,
        value=value,
        half=event.period if half is None else half,
        cop=cop,
        isDeleted=isDeleted,
        sequence=0,
        author_id=event.author_id,
        source_seq=event.seq,
    )


def _projection(
    state: GameStateValue,
    rows: Optional[list[TeamLogRow]] = None,
    deleted: Optional[list[int]] = None,
    restored: Optional[list[int]] = None,
    deleted_rows: Optional[list[int]] = None,
    restored_rows: Optional[list[int]] = None,
) -> Projection:
    return Projection(
        state=state,
        rows=list(rows or []),
        deleted_sequences=list(deleted or []),
        restored_sequences=list(restored or []),
        deleted_rows=list(deleted_rows or []),
        restored_rows=list(restored_rows or []),
    )


def _duration(payload: dict, *, pad_minutes: bool) -> Optional[str]:
    """Format a clock payload when the client did not send ``input``."""

    if "minutes" not in payload:
        return None
    minutes = int(payload["minutes"])
    seconds = int(payload.get("seconds", 0))
    if pad_minutes:
        return f"{minutes:02d}:{seconds:02d}"
    return f"{minutes}:{seconds:02d}"


def _apply_score(state: GameStateValue, event: GameEventValue) -> Projection:
    if event.code == "safety":
        points = event.payload.get("points")
        if points not in (1, 2):
            raise UnsupportedEventCode(
                f"safety needs payload.points 1 or 2, got {points!r}"
            )
        name = f"Safety (+{points})"
        value = points
    else:
        try:
            name = {
                "touchdown": "Touchdown",
                "pat1": "1-Extra-Punkt",
                "pat2": "2-Extra-Punkte",
                "overtime": "Overtime",
            }[event.code]
        except KeyError:
            raise UnsupportedEventCode(f"unknown score code {event.code!r}") from None
        value = SCORING_EVENT_VALUES[name]

    side = _require_side(event)
    # Quirk kept from GameLogCreator: a scoring row without a jersey is stored
    # with value 0, so it must not move the score either.
    row_value = value if event.player is not None else 0
    row = _row(event, name, side=side, player=event.player, value=row_value)

    changes: dict[str, Any] = {}
    if side == "home":
        changes["score_home"] = state.score_home + row_value
    else:
        changes["score_away"] = state.score_away + row_value
    return _projection(_advance(state, event, **changes), [row])


def _apply_penalty(state: GameStateValue, event: GameEventValue) -> Projection:
    # The configured penalty name travels as TeamLog.input, exactly as the
    # legacy payload's ``input`` did.
    row = _row(
        event,
        "Strafe",
        side=_require_side(event),
        player=event.player,
        input=event.code,
    )
    return _projection(_advance(state, event), [row])


def _apply_series(state: GameStateValue, event: GameEventValue) -> Projection:
    if event.code != "first_down":
        raise UnsupportedEventCode(f"unknown series code {event.code!r}")
    row = _row(event, "First Down", side=_require_side(event), player=event.player)
    return _projection(_advance(state, event), [row])


def _apply_possession(state: GameStateValue, event: GameEventValue) -> Projection:
    if event.code in _SIDES:
        # Today's write path only sets Gameinfo.in_possession for a plain
        # possession change; there is no TeamLog row and therefore no tick to
        # invent here.
        return _projection(_advance(state, event, in_possession=event.code))
    if event.code in ("turnover", "interception"):
        name = "Turnover" if event.code == "turnover" else "Interception"
        row = _row(
            event,
            name,
            side=_require_side(event),
            player=event.player,
            cop=True,
        )
        return _projection(_advance(state, event), [row])
    raise UnsupportedEventCode(f"unknown possession code {event.code!r}")


def _apply_timeout(state: GameStateValue, event: GameEventValue) -> Projection:
    side = event.code if event.code in _SIDES else _require_side(event)
    input_value = event.payload.get("input") or _duration(
        event.payload, pad_minutes=False
    )
    row = _row(event, "Auszeit", side=side, input=input_value)
    return _projection(_advance(state, event), [row])


def _apply_time(state: GameStateValue, event: GameEventValue) -> Projection:
    input_value = event.payload.get("input") or _duration(
        event.payload, pad_minutes=True
    )
    row = _row(event, "Spielzeit", side=_require_side(event), input=input_value)
    return _projection(_advance(state, event), [row])


def _apply_period(state: GameStateValue, event: GameEventValue) -> Projection:
    if event.code == "start":
        name, period = _MARKER_EVENTS["start"], 1
    elif event.code == "half_time":
        name, period = _MARKER_EVENTS["half_time"], 2
    elif event.code == "end":
        name, period = _MARKER_EVENTS["end"], event.period
    else:
        raise UnsupportedEventCode(f"unknown period code {event.code!r}")
    # Markers are written with half=0, sequence=0 and no team, matching
    # GameService._create_log_entry. That path relies on TeamLog.input's ""
    # default, unlike GameLogCreator, which passes None through.
    row = _row(event, name, half=0, input="")
    return _projection(_advance(state, event, period=period), [row])


@dataclass(frozen=True)
class _CorrectionEffect:
    """What a correction does to the projection (signed score deltas).

    ``deleted``/``restored`` name ``TeamLog`` sequence *groups*; ``deleted_row``
    /``restored_row`` name the event whose single row is affected. The row form
    is what sequence 0 needs: every penalty, clock, timeout and marker shares
    it, so "delete sequence 0" would erase the whole bucket.
    """

    deleted: tuple[int, ...] = ()
    restored: tuple[int, ...] = ()
    deleted_row: tuple[int, ...] = ()
    restored_row: tuple[int, ...] = ()
    score_home: int = 0
    score_away: int = 0
    possession_change: bool = False


def _target_rows(target: GameEventValue) -> list[TeamLogRow]:
    if target.undo_rows:
        return list(target.undo_rows)
    return list(apply(GameStateValue(), target).rows)


def _correction_effect(correction: GameEventValue) -> _CorrectionEffect:
    target = correction.undo_of
    if target is None:
        raise InvalidEnvelope("correction event has no undo_of target")

    if target.type == "correction":
        # Undoing a correction reverses that correction's own effect: restore
        # what it deleted, re-delete what it restored and add its subtraction
        # back. This is what keeps an undo of an undo symmetric.
        inner = _correction_effect(target)
        return _CorrectionEffect(
            deleted=inner.restored,
            restored=inner.deleted,
            deleted_row=inner.restored_row,
            restored_row=inner.deleted_row,
            score_home=-inner.score_home,
            score_away=-inner.score_away,
            possession_change=inner.possession_change,
        )

    rows = _target_rows(target)
    # Never subtract a row that is already deleted (an earlier correction owns
    # it); only live rows are part of the score that must be reversed.
    live_rows = [row for row in rows if not row.isDeleted]
    deleted: tuple[int, ...] = ()
    deleted_row: tuple[int, ...] = ()
    if rows:
        if target.legacy_sequence is not None:
            deleted = (target.legacy_sequence,)
        elif all(row.event in _ZERO_SEQUENCE_EVENTS for row in rows):
            # The shared sequence 0: name the row's own event instead of the
            # bucket, so a penalty undo takes that penalty and nothing else.
            if target.seq is None:
                raise ValueError(
                    "correction target has no seq; the service must resolve "
                    "the target's event"
                )
            deleted_row = (target.seq,)
        else:
            raise ValueError(
                "correction target has no legacy_sequence; "
                "the service must resolve the target's submission"
            )
    return _CorrectionEffect(
        deleted=deleted,
        deleted_row=deleted_row,
        score_home=-sum(row.value for row in live_rows if row.side == "home"),
        score_away=-sum(row.value for row in live_rows if row.side == "away"),
        possession_change=target.type == "possession" and target.code in _SIDES,
    )


def _apply_correction(state: GameStateValue, event: GameEventValue) -> Projection:
    effect = _correction_effect(event)
    changes: dict[str, Any] = {
        "score_home": state.score_home + effect.score_home,
        "score_away": state.score_away + effect.score_away,
    }
    if effect.possession_change:
        changes["in_possession"] = event.payload.get("restore_in_possession")
    # A corrected period marker cannot un-happen the period in the projection;
    # the deleted marker row is the record. Keep the current period.
    return _projection(
        _advance(state, event, period=state.period, **changes),
        deleted=list(effect.deleted),
        restored=list(effect.restored),
        deleted_rows=list(effect.deleted_row),
        restored_rows=list(effect.restored_row),
    )


_HANDLERS = {
    "score": _apply_score,
    "penalty": _apply_penalty,
    "series": _apply_series,
    "possession": _apply_possession,
    "timeout": _apply_timeout,
    "time": _apply_time,
    "period": _apply_period,
    "correction": _apply_correction,
}


def apply(state: GameStateValue, event: GameEventValue) -> Projection:
    """Project one event; rows carry sequence 0 until a submission assigns it."""

    try:
        handler = _HANDLERS[event.type]
    except KeyError:
        raise InvalidEnvelope(f"unknown event type {event.type!r}") from None
    return handler(state, event)


def project_submission(
    state: GameStateValue, events: list[GameEventValue]
) -> Projection:
    """Project one submission (one ``client_id``) and assign its sequence.

    Every row the submission produces shares one legacy sequence -- the
    smallest event ``seq`` in the submission, which is unique per game because
    event ``seq`` values are allocated as ``max+1``. A submission with only
    excluded rows/markers keeps sequence 0, and a correction submission
    inserts no rows at all (it only names sequences to delete/restore).
    """

    events = list(events)
    sequence = min(
        (event.seq for event in events if event.seq is not None),
        default=0,
    )
    state_out = state
    rows: list[TeamLogRow] = []
    deleted: list[int] = []
    restored: list[int] = []
    deleted_rows: list[int] = []
    restored_rows: list[int] = []
    for event in events:
        projection = apply(state_out, event)
        state_out = projection.state
        rows.extend(
            replace(
                row,
                sequence=0 if row.event in _ZERO_SEQUENCE_EVENTS else sequence,
            )
            for row in projection.rows
        )
        deleted.extend(projection.deleted_sequences)
        restored.extend(projection.restored_sequences)
        deleted_rows.extend(projection.deleted_rows)
        restored_rows.extend(projection.restored_rows)
    return Projection(
        state=state_out,
        rows=rows,
        deleted_sequences=sorted(set(deleted)),
        restored_sequences=sorted(set(restored)),
        deleted_rows=sorted(set(deleted_rows)),
        restored_rows=sorted(set(restored_rows)),
    )
