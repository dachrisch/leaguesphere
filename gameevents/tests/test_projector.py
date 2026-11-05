"""Pure unit tests for the projector -- no database, no Django models.

Every assertion here runs against the plain dataclasses. The database-backed
counterpart (``test_projector_golden.py``) replays the same fixtures through
the real writers so the golden table cannot drift.
"""

from dataclasses import replace

import pytest

import gameevents.service.projector as projector
from gameevents.service.projector import (
    SCORING_EVENT_VALUES,
    GameEventValue,
    GameStateValue,
    InvalidEnvelope,
    Projection,
    TeamLogRow,
    UnsupportedEventCode,
    apply,
    project_submission,
)
from gameevents.tests.golden_cases import (
    GOLDEN_CASES,
    MARKER_CASES,
    expected_signature,
    row_signature,
)


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
    projection = apply(state(), score("touchdown", player=7))

    assert isinstance(projection, Projection)
    assert projection.state.score_home == 6
    assert projection.state.score_away == 0
    assert projection.state.last_seq == 1
    assert projection.state.period == 1
    assert projection.deleted_sequences == []
    assert projection.restored_sequences == []
    assert projection.rows == [
        TeamLogRow(
            event="Touchdown",
            side="home",
            player=7,
            input=None,
            value=6,
            half=1,
            cop=False,
            isDeleted=False,
            sequence=0,
            source_seq=1,
        )
    ]


def test_project_submission_assigns_the_submission_sequence():
    touchdown = score("touchdown", player=7, seq=1)
    conversion = score("pat1", player=7, seq=2)

    projection = project_submission(state(), [touchdown, conversion])

    assert projection.state.score_home == 7
    assert [row.sequence for row in projection.rows] == [1, 1]


def test_a_row_carries_the_events_actor():
    projection = apply(state(), replace(score("touchdown", player=7), author_id=42))

    assert [row.author_id for row in projection.rows] == [42]


def test_every_row_of_a_submission_carries_the_actor():
    touchdown = replace(score("touchdown", player=7, seq=1), author_id=42)
    conversion = replace(score("pat1", player=7, seq=2), author_id=42)

    projection = project_submission(state(), [touchdown, conversion])

    assert {row.author_id for row in projection.rows} == {42}


def test_a_row_of_an_event_without_an_actor_stays_unattributed():
    # The projector never invents an author; the writer's fallback (the game's
    # author) is a service concern, and TeamLog's default user is never used.
    assert apply(state(), score("touchdown", player=7)).rows[0].author_id is None


def test_submission_sequence_is_the_smallest_event_seq():
    touchdown = score("touchdown", player=7, seq=7)
    conversion = score("pat2", player=7, seq=8)

    projection = project_submission(state(), [touchdown, conversion])

    assert [row.sequence for row in projection.rows] == [7, 7]


def test_excluded_rows_keep_sequence_zero_within_a_scored_submission():
    touchdown = score("touchdown", player=7, seq=1)
    penalty = ev("penalty", "Holding", side="home", seq=2)

    projection = project_submission(state(), [touchdown, penalty])

    assert [(row.event, row.sequence) for row in projection.rows] == [
        ("Touchdown", 1),
        ("Strafe", 0),
    ]


def test_score_for_the_away_side_in_the_second_half():
    projection = apply(
        state(), score("touchdown", side="away", player=19, period=2, seq=4)
    )

    assert (projection.state.score_home, projection.state.score_away) == (0, 6)
    assert projection.state.period == 2
    assert projection.rows[0].side == "away"
    assert projection.rows[0].half == 2


def test_score_without_a_jersey_scores_for_the_team():
    # A score belongs to the team (IFAF R 8-1-1): the jersey is optional
    # detail, so a defensive score or a team safety can be recorded.
    projection = apply(state(), score("touchdown", player=None))

    assert projection.state.score_home == 6
    assert projection.rows[0].event == "Touchdown"
    assert projection.rows[0].player is None
    assert projection.rows[0].value == 6


@pytest.mark.parametrize(
    ("points", "event_name", "value"),
    [(1, "Safety (+1)", 1), (2, "Safety (+2)", 2)],
)
def test_safety_carries_its_points(points, event_name, value):
    projection = apply(state(), score("safety", side="away", player=22, points=points))

    assert projection.rows[0].event == event_name
    assert projection.rows[0].value == value
    assert projection.state.score_away == value


def test_safety_rejects_unknown_points():
    with pytest.raises(UnsupportedEventCode):
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
    projection = apply(state(), score(code, player=7))

    assert projection.rows[0].event == event_name
    assert projection.rows[0].value == SCORING_EVENT_VALUES[event_name]


def test_a_scoring_event_without_a_side_is_an_invalid_envelope():
    with pytest.raises(InvalidEnvelope):
        apply(state(), score("touchdown", side=""))


def test_penalty_travels_as_input_and_never_scores():
    projection = apply(state(), ev("penalty", "Holding", side="home", player=5, seq=3))

    assert projection.rows == [
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
            source_seq=3,
        )
    ]
    assert projection.state.score_home == 0
    assert projection.state.last_seq == 3


def test_first_down_is_a_series_row_without_a_sequence():
    projection = apply(state(), ev("series", "first_down", side="away", player=8))

    assert projection.rows[0].event == "First Down"
    assert projection.rows[0].side == "away"
    assert projection.rows[0].player == 8
    assert projection.rows[0].sequence == 0
    assert projection.rows[0].cop is False


@pytest.mark.parametrize(
    ("code", "event_name"),
    [("turnover", "Turnover"), ("interception", "Interception")],
)
def test_turnover_and_interception_are_change_of_possession_rows(code, event_name):
    projection = apply(state(), ev("possession", code, side="away", player=23, seq=5))

    assert projection.rows[0].event == event_name
    assert projection.rows[0].cop is True
    assert projection.rows[0].value == 0
    assert projection.state.in_possession is None


def test_plain_possession_change_is_state_only():
    # Today's POST path only sets Gameinfo.in_possession; it emits no TeamLog
    # row, so the projection must not invent one.
    projection = apply(state(), ev("possession", "home", seq=6))

    assert projection.state.in_possession == "home"
    assert projection.rows == []


def test_possession_rejects_an_unknown_code():
    with pytest.raises(UnsupportedEventCode):
        apply(state(), ev("possession", "sideways"))


def test_timeout_is_an_auszeit_row_with_its_duration():
    projection = apply(
        state(),
        ev("timeout", "away", side="away", seq=7, input="m:ss"),
    )

    assert projection.rows[0].event == "Auszeit"
    assert projection.rows[0].side == "away"
    assert projection.rows[0].input == "m:ss"
    assert projection.rows[0].sequence == 0


def test_time_uses_the_input_the_app_sent():
    projection = apply(state(), ev("time", "clock", side="home", input="12:10"))

    assert projection.rows[0].event == "Spielzeit"
    assert projection.rows[0].input == "12:10"
    assert projection.rows[0].sequence == 0


def test_time_formats_minutes_when_no_input_is_present():
    projection = apply(
        state(), ev("time", "clock", side="home", minutes=12, seconds=10)
    )

    assert projection.rows[0].input == "12:10"


def test_half_time_writes_the_existing_marker_and_opens_the_second_half():
    projection = apply(state(period=1, score_home=7), ev("period", "half_time", seq=8))

    assert projection.rows == [
        TeamLogRow(
            event="2. Halbzeit gestartet",
            side=None,
            player=None,
            input="",
            value=0,
            half=0,
            cop=False,
            isDeleted=False,
            sequence=0,
            source_seq=8,
        )
    ]
    assert projection.state.period == 2
    assert projection.state.score_home == 7


@pytest.mark.parametrize("case", MARKER_CASES, ids=lambda case: case.name)
def test_marker_rows_match_game_service_constants(case):
    # Probe the literals the projector keeps in sync with GameService.
    from gamedays.service.gameday_settings import (
        GAME_END,
        GAME_START,
        SECOND_HALF_START,
    )

    expected = {
        "start": GAME_START,
        "half_time": SECOND_HALF_START,
        "end": GAME_END,
    }[case.code]
    projection = project_submission(state(), [ev("period", case.code, seq=1)])

    assert projection.rows[0].event == expected
    assert projection.rows[0].event == case.event_name
    assert projection.rows[0].half == 0
    assert projection.rows[0].side is None
    assert projection.rows[0].sequence == 0


def test_start_and_end_keep_the_score_and_advance_the_state():
    start = apply(state(period=1, score_away=3), ev("period", "start", seq=9))
    end = apply(start.state, ev("period", "end", period=2, seq=10))

    assert start.state.period == 1
    assert end.state.period == 2
    assert end.state.score_away == 3
    assert end.rows[0].event == "Spiel beendet"


def test_undoing_a_touchdown_with_its_conversion_marks_the_sequence_deleted():
    touchdown = score("touchdown", player=7, seq=1)
    conversion = score("pat1", player=7, seq=2)
    projected = project_submission(state(), [touchdown, conversion])
    assert projected.state.score_home == 7
    assert [row.sequence for row in projected.rows] == [1, 1]

    # The service resolves the target's submission: its legacy sequence and
    # the rows that sequence currently projects.
    target = replace(
        touchdown,
        legacy_sequence=1,
        undo_rows=tuple(projected.rows),
    )
    correction = GameEventValue(
        type="correction", code="undo", period=1, seq=3, undo_of=target
    )
    undone = project_submission(projected.state, [correction])

    assert undone.state.score_home == 0
    assert undone.rows == []
    assert undone.deleted_sequences == [1]
    assert undone.restored_sequences == []


def test_undoing_that_undo_restores_the_sequence_and_the_score():
    touchdown = score("touchdown", player=7, seq=1)
    conversion = score("pat1", player=7, seq=2)
    projected = project_submission(state(), [touchdown, conversion])
    target = replace(
        touchdown,
        legacy_sequence=1,
        undo_rows=tuple(projected.rows),
    )
    correction = GameEventValue(
        type="correction", code="undo", period=1, seq=3, undo_of=target
    )
    undone = project_submission(projected.state, [correction])

    undo_again = GameEventValue(
        type="correction", code="undo", period=1, seq=4, undo_of=correction
    )
    restored = project_submission(undone.state, [undo_again])

    assert restored.state.score_home == 7
    assert restored.rows == []
    assert restored.deleted_sequences == []
    assert restored.restored_sequences == [1]


def test_correction_does_not_subtract_rows_that_are_already_deleted():
    touchdown = score("touchdown", player=7, seq=1)
    deleted_row = TeamLogRow(
        event="Touchdown",
        side="home",
        player=7,
        value=6,
        half=1,
        isDeleted=True,
        sequence=1,
    )
    target = replace(
        touchdown,
        legacy_sequence=1,
        undo_rows=(deleted_row,),
    )
    correction = GameEventValue(
        type="correction", code="undo", period=1, seq=2, undo_of=target
    )

    projection = apply(state(score_home=0), correction)

    assert projection.state.score_home == 0
    assert projection.deleted_sequences == [1]


def test_correction_of_an_excluded_row_targets_the_row_not_sequence_zero():
    # Every penalty, clock, timeout and marker shares sequence 0, so a group
    # delete would erase the whole bucket. The correction names the row's own
    # event instead.
    penalty = ev("penalty", "Holding", side="home", seq=1)
    correction = GameEventValue(type="correction", code="undo", seq=2, undo_of=penalty)

    projection = apply(state(), correction)

    assert projection.rows == []
    assert projection.deleted_sequences == []
    assert projection.deleted_rows == [1]
    assert projection.state.score_home == 0


def test_a_sequence_zero_correction_without_a_target_seq_is_a_bug_not_a_noop():
    # The service must resolve the target's event before projecting; without
    # its seq the projector cannot name the row, and deleting the shared bucket
    # instead would be a silent disaster.
    penalty = ev("penalty", "Holding", side="home", seq=None)
    correction = GameEventValue(type="correction", code="undo", seq=2, undo_of=penalty)

    with pytest.raises(ValueError, match="no seq"):
        apply(state(), correction)


def test_undoing_a_row_correction_restores_that_row():
    penalty = ev("penalty", "Holding", side="home", seq=1)
    undone = GameEventValue(type="correction", code="undo", seq=2, undo_of=penalty)
    restore = GameEventValue(type="correction", code="undo", seq=3, undo_of=undone)

    projection = apply(state(), restore)

    assert projection.deleted_rows == []
    assert projection.restored_rows == [1]


def test_correction_of_a_plain_possession_change_restores_the_side():
    change = ev("possession", "home", seq=1)
    after_change = apply(state(), change)
    assert after_change.state.in_possession == "home"

    correction = GameEventValue(
        type="correction",
        code="undo",
        seq=2,
        payload={"restore_in_possession": "away"},
        undo_of=change,
    )
    projection = apply(after_change.state, correction)

    assert projection.state.in_possession == "away"
    assert projection.rows == []
    assert projection.deleted_sequences == []


def test_correction_without_a_target_is_an_invalid_envelope():
    with pytest.raises(InvalidEnvelope):
        apply(state(), ev("correction", "undo"))


def test_unknown_event_type_is_an_invalid_envelope():
    with pytest.raises(InvalidEnvelope):
        apply(state(), ev("teleport", "away"))


def test_real_bugs_are_not_masked_as_envelope_errors(monkeypatch):
    def broken(state, event):
        raise RuntimeError("projector bug")

    monkeypatch.setitem(projector._HANDLERS, "score", broken)

    with pytest.raises(RuntimeError):
        apply(state(), score("touchdown"))


@pytest.mark.parametrize("case", GOLDEN_CASES, ids=lambda case: case.name)
def test_golden_table_matches_what_today_s_writer_produces(case):
    projection = project_submission(GameStateValue(), case.events)

    assert [row_signature(row) for row in projection.rows] == expected_signature(case)
    assert projection.deleted_sequences == []
    assert projection.restored_sequences == []
    for side, score_field in (("home", "score_home"), ("away", "score_away")):
        expected_score = sum(
            row.value
            for row in projection.rows
            if row.side == side and not row.isDeleted
        )
        assert getattr(projection.state, score_field) == expected_score


def test_a_complete_pass_is_a_play_row_with_yards_and_quarterback():
    projection = apply(
        state(),
        ev(
            "play",
            "pass",
            side="home",
            player=7,
            seq=3,
            complete=True,
            yards=8,
            qb=12,
        ),
    )

    row = projection.rows[0]
    assert row.event == "Pass"
    assert row.side == "home"
    assert row.player == 7
    assert row.input == "8 Yards · QB #12"
    assert row.value == 0
    # A play is neither a score nor a possession change.
    assert projection.state.score_home == 0
    assert projection.state.in_possession is None


def test_an_incomplete_pass_says_so():
    projection = apply(
        state(),
        ev("play", "pass", side="away", player=11, complete=False, yards=0, qb=4),
    )

    assert projection.rows[0].event == "Pass unvollständig"
    assert projection.rows[0].input == "0 Yards · QB #4"


def test_a_run_is_a_play_with_yards_only():
    projection = apply(state(), ev("play", "run", side="home", player=23, yards=14))

    assert projection.rows[0].event == "Run"
    assert projection.rows[0].input == "14 Yards"


def test_a_sack_counts_the_loss_in_words():
    projection = apply(state(), ev("play", "sack", side="home", player=12, yards=-5))

    assert projection.rows[0].event == "Sack"
    assert projection.rows[0].input == "5 Yards Verlust"


def test_the_text_the_app_sent_wins_over_the_payload():
    projection = apply(
        state(),
        ev(
            "play",
            "run",
            side="home",
            player=23,
            yards=14,
            input="14 Yards · starke Linie",
        ),
    )

    assert projection.rows[0].input == "14 Yards · starke Linie"


def test_a_play_rejects_an_unknown_code():
    with pytest.raises(UnsupportedEventCode):
        apply(state(), ev("play", "kick", side="home"))


def test_a_touchdown_carries_its_yards():
    projection = apply(state(), score("touchdown", player=7, yards=8))

    assert projection.rows[0].event == "Touchdown"
    assert projection.rows[0].input == "8 Yards"
    assert projection.state.score_home == 6


def test_a_first_down_carries_its_yards():
    projection = apply(
        state(), ev("series", "first_down", side="home", player=23, yards=6)
    )

    assert projection.rows[0].event == "First Down"
    assert projection.rows[0].input == "6 Yards"


def test_a_challenge_is_a_row_with_the_optional_text():
    projection = apply(
        state(),
        ev(
            "challenge",
            "",
            side="home",
            seq=4,
            text="  Zuschauer zu viele  ",
        ),
    )

    row = projection.rows[0]
    assert row.event == "Challenge"
    assert row.input == "Zuschauer zu viele"
    assert row.value == 0
    assert projection.state.score_home == 0
    assert projection.state.in_possession is None


def test_a_challenge_without_text_is_still_a_row():
    projection = apply(state(), ev("challenge", "", side="away"))

    assert projection.rows[0].event == "Challenge"
    assert projection.rows[0].input is None


def test_overtime_start_is_a_marker_without_a_new_period():
    projection = apply(state(period=2, score_home=14), ev("period", "overtime", seq=9))

    assert projection.rows[0].event == "Overtime startet"
    assert projection.rows[0].half == 0
    assert projection.rows[0].sequence == 0
    assert projection.state.period == 2
    assert projection.state.score_home == 14


def test_a_field_position_is_a_row_with_its_text():
    projection = apply(
        state(period=2),
        ev("fieldpos", "", side="home", seq=5, input="eigene 35", ballOn=35),
    )

    row = projection.rows[0]
    assert row.event == "Feldposition"
    assert row.input == "eigene 35"
    assert row.value == 0
    assert projection.state.score_home == 0
    assert projection.state.in_possession is None


def test_a_field_position_without_text_is_still_a_row():
    projection = apply(state(), ev("fieldpos", "", side="away", ballOn=60))

    assert projection.rows[0].event == "Feldposition"
    assert projection.rows[0].input is None
