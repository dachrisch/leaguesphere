"""Pure projector: event -> (game state, ``TeamLog`` rows).

This module deliberately imports no Django code. ``GameStateValue``,
``TeamLogRow`` and ``GameEventValue`` are plain dataclasses, so the whole
meaning of an event can be unit-tested without a database (and the same code
can later run in a worker).

The projected rows reproduce ``gamedays.service.gamelog.GameLogCreator``
exactly -- event names, player, input, value, half, cop, isDeleted -- including
its quirks, because every existing consumer (liveticker, statistics, match
report, league table) reads ``TeamLog`` and must not notice the switch. See
``gameevents/tests/golden_cases.py`` for the fixture table and
``test_projector_golden.py`` for the comparison against the real writer.

``correction`` reverses an earlier event without touching it: the projector
emits deleted copies of the target's rows and subtracts the target's points.
The target row itself is never mutated or removed.

Envelope -> projected row (slice 1)::

    score / touchdown              -> Touchdown (6)
    score / pat1, pat2, overtime   -> 1-Extra-Punkt, 2-Extra-Punkte, Overtime
    score / safety + payload.points-> Safety (+1) / Safety (+2)
    penalty / <penalty name>       -> Strafe, input=<penalty name>
    series / first_down            -> First Down
    possession / turnover          -> Turnover (cop)
    possession / interception      -> Interception (cop)
    possession / home, away        -> Turnover (cop) + state.in_possession
    timeout / home, away           -> Auszeit, input from payload
    time / clock                   -> Spielzeit, input from payload
    period / start, half_time, end -> Spiel gestartet / 2. Halbzeit gestartet /
                                      Spiel beendet (half=0, no team)
    correction / undo              -> deleted copies of ``undo_of``'s rows

``series`` is not in the plan's short type list, but scorecard v2 sends First
Down today and the golden test must reproduce its row; it is the smallest
addition that keeps the vocabulary honest.
"""

from dataclasses import dataclass, field, replace
from typing import Any, Optional

# Mirrors gamedays.service.gamelog.SCORING_EVENT_VALUES / EXCLUDED_EVENTS.
# Kept local so this module stays Django-free; test_projector.py asserts the
# two copies agree.
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
# half/game markers (GameService._create_log_entry).
_ZERO_SEQUENCE_EVENTS = frozenset(EXCLUDED_EVENTS) | {
    "Spiel gestartet",
    "2. Halbzeit gestartet",
    "Spiel beendet",
}

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
    markers, whose ``TeamLog.team`` is null). ``sequence`` is carried for the
    persistence layer; the frozen golden contract does not compare it.
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


@dataclass(frozen=True)
class GameEventValue:
    """The projector's view of one ``GameEvent`` row.

    ``undo_of`` holds the *target event itself* rather than its database id, so
    ``apply`` stays pure. The append service resolves the FK and passes the
    target here.
    """

    type: str
    code: str = ""
    side: Optional[str] = None
    player: Optional[int] = None
    period: int = 1
    payload: dict = field(default_factory=dict)
    seq: Optional[int] = None
    undo_of: Optional["GameEventValue"] = None


def _side(value: Optional[str]) -> Optional[str]:
    if value in (None, ""):
        return None
    if value not in _SIDES:
        raise ValueError(f"unknown side {value!r}")
    return value


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
    sequence = 0 if name in _ZERO_SEQUENCE_EVENTS else (event.seq or 0)
    return TeamLogRow(
        event=name,
        side=_side(side),
        player=player,
        input=input,
        value=value,
        half=event.period if half is None else half,
        cop=cop,
        isDeleted=isDeleted,
        sequence=sequence,
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


def _apply_score(state: GameStateValue, event: GameEventValue):
    if event.code == "safety":
        points = event.payload.get("points")
        if points not in (1, 2):
            raise ValueError(f"safety needs points 1 or 2, got {points!r}")
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
            raise ValueError(f"unknown score code {event.code!r}") from None
        value = SCORING_EVENT_VALUES[name]

    side = _side(event.side)
    # Quirk kept from GameLogCreator: a scoring row without a jersey is stored
    # with value 0, so it must not move the score either.
    row_value = value if event.player is not None else 0
    row = _row(event, name, side=side, player=event.player, value=row_value)

    changes: dict[str, Any] = {}
    if side == "home":
        changes["score_home"] = state.score_home + row_value
    elif side == "away":
        changes["score_away"] = state.score_away + row_value
    return _advance(state, event, **changes), [row]


def _apply_penalty(state: GameStateValue, event: GameEventValue):
    # The configured penalty name travels as TeamLog.input, exactly as the
    # legacy payload's ``input`` did.
    row = _row(
        event,
        "Strafe",
        side=event.side,
        player=event.player,
        input=event.code,
    )
    return _advance(state, event), [row]


def _apply_series(state: GameStateValue, event: GameEventValue):
    if event.code != "first_down":
        raise ValueError(f"unknown series code {event.code!r}")
    row = _row(event, "First Down", side=event.side, player=event.player)
    return _advance(state, event), [row]


def _apply_possession(state: GameStateValue, event: GameEventValue):
    if event.code in _SIDES:
        # A plain possession change. TeamLog has one change-of-possession
        # vocabulary (cop=True, "Ballabgabe" in the liveticker), so the row
        # reuses "Turnover"; no new event name is introduced.
        row = _row(event, "Turnover", side=event.code, cop=True)
        return _advance(state, event, in_possession=event.code), [row]
    if event.code in ("turnover", "interception"):
        name = "Turnover" if event.code == "turnover" else "Interception"
        row = _row(
            event,
            name,
            side=event.side,
            player=event.player,
            cop=True,
        )
        return _advance(state, event), [row]
    raise ValueError(f"unknown possession code {event.code!r}")


def _apply_timeout(state: GameStateValue, event: GameEventValue):
    side = event.code if event.code in _SIDES else event.side
    input_value = event.payload.get("input") or _duration(
        event.payload, pad_minutes=False
    )
    row = _row(event, "Auszeit", side=side, input=input_value)
    return _advance(state, event), [row]


def _apply_time(state: GameStateValue, event: GameEventValue):
    input_value = event.payload.get("input") or _duration(
        event.payload, pad_minutes=True
    )
    row = _row(event, "Spielzeit", side=event.side, input=input_value)
    return _advance(state, event), [row]


def _apply_period(state: GameStateValue, event: GameEventValue):
    if event.code == "start":
        name, period = "Spiel gestartet", 1
    elif event.code == "half_time":
        name, period = "2. Halbzeit gestartet", 2
    elif event.code == "end":
        name, period = "Spiel beendet", event.period
    else:
        raise ValueError(f"unknown period code {event.code!r}")
    # The markers are written with half=0, sequence=0 and no team, matching
    # GameService._create_log_entry.
    row = _row(event, name, half=0)
    return _advance(state, event, period=period), [row]


def _apply_correction(state: GameStateValue, event: GameEventValue):
    target = event.undo_of
    if target is None:
        raise ValueError("correction event has no undo_of target")

    # Project the target from a neutral state to recover exactly the rows it
    # would have written (and therefore its score effect).
    _, target_rows = apply(GameStateValue(), target)
    deleted_rows = [replace(row, isDeleted=True) for row in target_rows]

    changes: dict[str, Any] = {
        "score_home": state.score_home
        - sum(row.value for row in target_rows if row.side == "home"),
        "score_away": state.score_away
        - sum(row.value for row in target_rows if row.side == "away"),
    }
    if target.type == "possession" and target.code in _SIDES:
        changes["in_possession"] = event.payload.get("restore_in_possession")
    # A corrected period marker cannot un-happen the period in the projection;
    # the deleted marker row is the record. Keep the current period.
    return _advance(state, event, period=state.period, **changes), deleted_rows


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


def apply(state: GameStateValue, event: GameEventValue):
    """Project one event onto ``state``; return the new state and its rows."""

    try:
        handler = _HANDLERS[event.type]
    except KeyError:
        raise ValueError(f"unknown event type {event.type!r}") from None
    return handler(state, event)
