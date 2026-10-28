"""Pure unit tests for the projector -- no database, no Django models.

Every assertion here runs against plain dataclasses. The database-backed
counterpart (``test_projector_golden.py``) replays the same fixtures through
the real ``GameLogCreator`` so the golden table cannot drift.
"""

import pytest

from gameevents.service.projector import (
    EXCLUDED_EVENTS,
    SCORING_EVENT_VALUES,
    GameEventValue,
    GameStateValue,
    TeamLogRow,
    apply,
)
from gameevents.tests.golden_cases import GOLDEN_CASES, expected_signature, row_signature


def state(**overrides):
    return GameStateValue(**overrides)


def score(code, side="home", player=7, period=1, seq=1, **payload):
    return GameEventValue(
        type="score",
        code=code,
        side=side,
        player=player,
        period=period,
        seq=seq,
        payload=payload,
    )


def ev(type_, code, side="", player=None, period=1, seq=1, **payload):
    return GameEventValue(
        type=type_,
        code=code,
        side=side,
        player=player,
        period=period,
        seq=seq,
        payload=payload,
    )


def test_score_updates_the_side_and_advances_the_cursor():
    new_state, rows = apply(state(), score("touchdown", player=7))

    assert new_state.score_home == 6
    assert new_state.score_away == 0
    assert new_state.last_seq == 1
    assert new_state.period == 1
    assert rows == [
        TeamLogRow(
            event="Touchdown",
            side="home",
            player=7,
            input=None,
            value=6,
            half=1,
            cop=False,
            isDeleted=False,
            sequence=1,
        )
    ]


def test_score_for_the_away_side_in_the_second_half():
    new_state, rows = apply(
        state(), score("touchdown", side="away", player=19, period=2, seq=4)
    )

    assert (new_state.score_home, new_state.score_away) == (0, 6)
    assert new_state.period == 2
    assert rows[0].side == "away"
    assert rows[0].half == 2


def test_score_without_a_jersey_stores_zero_but_keeps_the_row():
    # GameLogCreator quirk: value is only applied when a player is present.
    new_state, rows = apply(state(), score("touchdown", player=None))

    assert new_state.score_home == 0
    assert rows[0].event == "Touchdown"
    assert rows[0].player is None
    assert rows[0].value == 0


@pytest.mark.parametrize(
    ("points", "event_name", "value"),
    [(1, "Safety (+1)", 1), (2, "Safety (+2)", 2)],
)
def test_safety_carries_its_points(points, event_name, value):
    new_state, rows = apply(
        state(), score("safety", side="away", player=22, points=points)
    )

    assert rows[0].event == event_name
    assert rows[0].value == value
    assert new_state.score_away == value


def test_safety_rejects_unknown_points():
    with pytest.raises(ValueError):
        apply(state(), score("safety", player=22, points=3))


@pytest.mark.parametrize(
    ("code", "event_name"),
    [
        ("touchdown", "Touchdown"),
        ("pat1", "1-Extra-Punkt"),
        ("pat2", "2-Extra-Punkte"),
        ("overtime", "Overtime"),
    ],
)
def test_score_codes_map_to_the_existing_event_names(code, event_name):
    _, rows = apply(state(), score(code, player=7))

    assert rows[0].event == event_name
    assert rows[0].value == SCORING_EVENT_VALUES[event_name]


def test_penalty_travels_as_input_and_never_scores():
    new_state, rows = apply(
        state(), ev("penalty", "Holding", side="home", player=5, seq=3)
    )

    assert rows == [
        TeamLogRow(
            event="Strafe",
            side="home",
            player=5,
            input="Holding",
            value=0,
            half=1,
            cop=False,
            isDeleted=False,
            sequence=0,
        )
    ]
    assert new_state.score_home == 0
    assert new_state.last_seq == 3


def test_first_down_is_a_series_row_without_a_sequence():
    _, rows = apply(state(), ev("series", "first_down", side="away", player=8))

    assert rows[0].event == "First Down"
    assert rows[0].side == "away"
    assert rows[0].player == 8
    assert rows[0].sequence == 0
    assert rows[0].cop is False


@pytest.mark.parametrize(
    ("code", "event_name"),
    [("turnover", "Turnover"), ("interception", "Interception")],
)
def test_turnover_and_interception_are_change_of_possession_rows(code, event_name):
    new_state, rows = apply(
        state(), ev("possession", code, side="away", player=23, seq=5)
    )

    assert rows[0].event == event_name
    assert rows[0].cop is True
    assert rows[0].value == 0
    assert rows[0].sequence == 5
    assert new_state.in_possession is None


def test_plain_possession_change_updates_state_and_writes_a_cop_row():
    # Judgement call: today's write path only sets Gameinfo.in_possession, but
    # the plan asks the projection for a change-of-possession row. TeamLog has
    # exactly one vocabulary for that (cop=True, rendered as "Ballabgabe"), so
    # the row reuses "Turnover" rather than inventing a new event name.
    new_state, rows = apply(state(), ev("possession", "home", seq=6))

    assert new_state.in_possession == "home"
    assert rows[0].event == "Turnover"
    assert rows[0].cop is True
    assert rows[0].side == "home"
    assert rows[0].value == 0


def test_possession_rejects_an_unknown_code():
    with pytest.raises(ValueError):
        apply(state(), ev("possession", "sideways"))


def test_timeout_is_an_auszeit_row_with_its_duration():
    _, rows = apply(
        state(),
        ev("timeout", "away", side="away", seq=7, input="m:ss"),
    )

    assert rows[0].event == "Auszeit"
    assert rows[0].side == "away"
    assert rows[0].input == "m:ss"
    assert rows[0].sequence == 0


def test_time_uses_the_input_the_app_sent():
    _, rows = apply(state(), ev("time", "clock", side="home", input="12:10"))

    assert rows[0].event == "Spielzeit"
    assert rows[0].input == "12:10"
    assert rows[0].sequence == 0


def test_time_formats_minutes_when_no_input_is_present():
    _, rows = apply(state(), ev("time", "clock", side="home", minutes=12, seconds=10))

    assert rows[0].input == "12:10"


def test_half_time_writes_the_existing_marker_and_opens_the_second_half():
    new_state, rows = apply(
        state(period=1, score_home=7), ev("period", "half_time", seq=8)
    )

    assert rows == [
        TeamLogRow(
            event="2. Halbzeit gestartet",
            side=None,
            player=None,
            input=None,
            value=0,
            half=0,
            cop=False,
            isDeleted=False,
            sequence=0,
        )
    ]
    assert new_state.period == 2
    assert new_state.score_home == 7


@pytest.mark.parametrize(
    ("code", "event_name"),
    [("start", "Spiel gestartet"), ("end", "Spiel beendet")],
)
def test_start_and_end_write_the_existing_markers(code, event_name):
    new_state, rows = apply(state(period=2, score_away=3), ev("period", code, seq=9))

    assert rows[0].event == event_name
    assert rows[0].half == 0
    assert rows[0].side is None
    assert new_state.score_away == 3


def test_correction_reverses_the_score_and_marks_the_target_rows_deleted():
    target = score("touchdown", player=7, seq=1)
    after_target, target_rows = apply(state(), target)

    correction = GameEventValue(
        type="correction",
        code="undo",
        period=1,
        seq=2,
        payload={},
        undo_of=target,
    )
    after_correction, rows = apply(after_target, correction)

    assert after_correction.score_home == 0
    assert after_correction.last_seq == 2
    # The compensation is a deleted copy; the target rows are untouched.
    assert target_rows[0].isDeleted is False
    assert rows == [TeamLogRow(**{**target_rows[0].__dict__, "isDeleted": True})]


def test_correction_of_a_touchdown_and_its_conversion_reverses_both():
    touchdown = score("touchdown", player=7, seq=1)
    pat = score("pat1", player=7, seq=2)
    new_state, _ = apply(state(), touchdown)
    new_state, _ = apply(new_state, pat)
    assert new_state.score_home == 7

    correction = GameEventValue(
        type="correction",
        code="undo",
        period=1,
        seq=3,
        undo_of=pat,
    )
    new_state, rows = apply(new_state, correction)

    assert new_state.score_home == 6
    assert len(rows) == 1
    assert rows[0].event == "1-Extra-Punkt"
    assert rows[0].isDeleted is True


def test_correction_of_a_possession_change_restores_the_given_side():
    change = ev("possession", "home", seq=1)
    new_state, _ = apply(state(), change)

    correction = GameEventValue(
        type="correction",
        code="undo",
        seq=2,
        payload={"restore_in_possession": "away"},
        undo_of=change,
    )
    new_state, rows = apply(new_state, correction)

    assert new_state.in_possession == "away"
    assert rows[0].cop is True
    assert rows[0].isDeleted is True


def test_correction_without_a_target_is_rejected():
    with pytest.raises(ValueError):
        apply(state(), ev("correction", "undo"))


def test_unknown_event_type_is_rejected():
    with pytest.raises(ValueError):
        apply(state(), ev("teleport", "away"))


def test_projected_vocabulary_matches_the_current_write_path():
    # Imported lazily so the pure tests above never import Django models.
    from gamedays.service.gamelog import EXCLUDED_EVENTS as CURRENT_EXCLUDED
    from gamedays.service.gamelog import (
        SCORING_EVENT_VALUES as CURRENT_SCORING_VALUES,
    )

    assert SCORING_EVENT_VALUES == CURRENT_SCORING_VALUES
    assert set(EXCLUDED_EVENTS) == set(CURRENT_EXCLUDED)


@pytest.mark.parametrize("case", GOLDEN_CASES, ids=lambda case: case.name)
def test_golden_table_matches_what_today_s_writer_produces(case):
    new_state = GameStateValue()
    rows = []
    for golden_event in case.events:
        new_state, projected = apply(new_state, golden_event)
        rows.extend(projected)

    assert [row_signature(row) for row in rows] == expected_signature(case)
    for side, score_field in (("home", "score_home"), ("away", "score_away")):
        expected_score = sum(
            row.value for row in rows if row.side == side and not row.isDeleted
        )
        assert getattr(new_state, score_field) == expected_score
