"""Golden fixture table: what scorecard v2 sends today and what it writes.

Each case has three views of the same submission:

- ``entries``: the ``event`` list of a legacy ``POST /api/gamelog/<id>``
  payload, exactly as scorecard v2 builds it (see ``scorecard_v2/src`` on the
  v2 branch: ``TouchdownSheet``, ``MoreSheet``, ``PenaltySheet``,
  ``SeriesSheet``);
- ``events``: the same submission as slice-1 envelopes, one per captured
  event (the T3 endpoint translates entries to these);
- ``expected``: the ``TeamLog`` rows ``gamedays.service.gamelog.GameLogCreator``
  writes for ``entries`` today, restricted to the fields the plan freezes
  (``event``, ``side``, ``player``, ``input``, ``value``, ``half``, ``cop``,
  ``isDeleted``). ``sequence`` is intentionally not compared: today a
  touchdown and its conversion share one sequence, and the envelope gives each
  event its own ``seq``; reconciling that grouping is T3's job.

``test_projector_golden.py`` also replays ``entries`` through the real
``GameLogCreator`` so this table cannot silently drift from the code it
describes.
"""

from collections import namedtuple

from gameevents.service.projector import GameEventValue

ROW_FIELDS = (
    "event",
    "side",
    "player",
    "input",
    "value",
    "half",
    "cop",
    "isDeleted",
)

GoldenCase = namedtuple("GoldenCase", "name entries half side events expected")


def score(code, side, player, period, seq, **payload):
    return GameEventValue(
        type="score",
        code=code,
        side=side,
        player=player,
        period=period,
        seq=seq,
        payload=payload,
    )


def event(type_, code, side, player, period, seq, **payload):
    return GameEventValue(
        type=type_,
        code=code,
        side=side,
        player=player,
        period=period,
        seq=seq,
        payload=payload,
    )


def row(event, side, player, value, half, input=None, cop=False, isDeleted=False):
    return {
        "event": event,
        "side": side,
        "player": player,
        "input": input,
        "value": value,
        "half": half,
        "cop": cop,
        "isDeleted": isDeleted,
    }


GOLDEN_CASES = [
    GoldenCase(
        "touchdown",
        [{"name": "Touchdown", "player": 7}],
        1,
        "home",
        [score("touchdown", "home", 7, 1, 1)],
        [row("Touchdown", "home", 7, 6, 1)],
    ),
    GoldenCase(
        "touchdown_pat1",
        [
            {"name": "Touchdown", "player": 7},
            {"name": "1-Extra-Punkt", "player": 7},
        ],
        1,
        "home",
        [
            score("touchdown", "home", 7, 1, 1),
            score("pat1", "home", 7, 1, 2),
        ],
        [
            row("Touchdown", "home", 7, 6, 1),
            row("1-Extra-Punkt", "home", 7, 1, 1),
        ],
    ),
    GoldenCase(
        "touchdown_pat2_away_second_half",
        [
            {"name": "Touchdown", "player": 19},
            {"name": "2-Extra-Punkte", "player": 19},
        ],
        2,
        "away",
        [
            score("touchdown", "away", 19, 2, 1),
            score("pat2", "away", 19, 2, 2),
        ],
        [
            row("Touchdown", "away", 19, 6, 2),
            row("2-Extra-Punkte", "away", 19, 2, 2),
        ],
    ),
    # Quirk kept from GameLogCreator: a scoring row without a jersey stores
    # value 0, even though the event itself is a touchdown.
    GoldenCase(
        "touchdown_without_player",
        [{"name": "Touchdown"}],
        1,
        "home",
        [score("touchdown", "home", None, 1, 1)],
        [row("Touchdown", "home", None, 0, 1)],
    ),
    # Quirk kept from GameLogCreator._coerce_player: "" is "no jersey", so an
    # attempted conversion without a number scores nothing.
    GoldenCase(
        "pat_without_player",
        [{"name": "1-Extra-Punkt", "player": ""}],
        1,
        "home",
        [score("pat1", "home", None, 1, 1)],
        [row("1-Extra-Punkt", "home", None, 0, 1)],
    ),
    GoldenCase(
        "safety_plus_one",
        [{"name": "Safety (+1)", "player": 22}],
        2,
        "away",
        [score("safety", "away", 22, 2, 1, points=1)],
        [row("Safety (+1)", "away", 22, 1, 2)],
    ),
    GoldenCase(
        "safety_plus_two",
        [{"name": "Safety (+2)", "player": 12}],
        1,
        "away",
        [score("safety", "away", 12, 1, 1, points=2)],
        [row("Safety (+2)", "away", 12, 2, 1)],
    ),
    GoldenCase(
        "overtime",
        [{"name": "Overtime", "player": 3}],
        2,
        "home",
        [score("overtime", "home", 3, 2, 1)],
        [row("Overtime", "home", 3, 1, 2)],
    ),
    # A penalty travels as input (the configured penalty name), may name a
    # jersey, and never scores.
    GoldenCase(
        "penalty_with_player",
        [{"name": "Strafe", "player": 5, "input": "Holding"}],
        1,
        "home",
        [event("penalty", "Holding", "home", 5, 1, 1)],
        [row("Strafe", "home", 5, 0, 1, input="Holding")],
    ),
    GoldenCase(
        "penalty_without_player",
        [{"name": "Strafe", "input": "illegaler Kontakt"}],
        1,
        "away",
        [event("penalty", "illegaler Kontakt", "away", None, 1, 1)],
        [row("Strafe", "away", None, 0, 1, input="illegaler Kontakt")],
    ),
    GoldenCase(
        "first_down_with_player",
        [{"name": "First Down", "player": 8}],
        1,
        "home",
        [event("series", "first_down", "home", 8, 1, 1)],
        [row("First Down", "home", 8, 0, 1)],
    ),
    GoldenCase(
        "first_down_without_player",
        [{"name": "First Down"}],
        2,
        "away",
        [event("series", "first_down", "away", None, 2, 1)],
        [row("First Down", "away", None, 0, 2)],
    ),
    # Turnover/Interception are the cop rows. They are recorded for the team
    # the row belongs to (the defence for an interception), never score.
    GoldenCase(
        "turnover",
        [{"name": "Turnover"}],
        2,
        "home",
        [event("possession", "turnover", "home", None, 2, 1)],
        [row("Turnover", "home", None, 0, 2, cop=True)],
    ),
    GoldenCase(
        "interception",
        [{"name": "Interception", "player": 23}],
        1,
        "away",
        [event("possession", "interception", "away", 23, 1, 1)],
        [row("Interception", "away", 23, 0, 1, cop=True)],
    ),
    GoldenCase(
        "spielzeit",
        [{"name": "Spielzeit", "input": "12:10"}],
        2,
        "home",
        [event("time", "clock", "home", None, 2, 1, input="12:10")],
        [row("Spielzeit", "home", None, 0, 2, input="12:10")],
    ),
    GoldenCase(
        "auszeit",
        [{"name": "Auszeit", "input": "00:01"}],
        1,
        "away",
        [event("timeout", "away", "away", None, 1, 1, input="00:01")],
        [row("Auszeit", "away", None, 0, 1, input="00:01")],
    ),
]


def row_signature(row_value):
    """Projector/database-agnostic row tuple used for every comparison."""

    return tuple(getattr(row_value, field) for field in ROW_FIELDS)


def expected_signature(case):
    return [tuple(entry[field] for field in ROW_FIELDS) for entry in case.expected]
