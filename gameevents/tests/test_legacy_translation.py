"""The legacy payload -> envelope translation table (T3).

``gameevents/tests/golden_cases.py`` holds every payload scorecard v2 sends
today twice: as the legacy ``event`` list and as the envelopes it stands for.
The table in ``gameevents/service/legacy.py`` must turn the first into the
second exactly -- that is what makes the shadow append a faithful recording of
the rows the legacy writer already writes.

Unknown names are a client error, never a silent drop.
"""

import pytest

from gameevents.service.legacy import (
    LEGACY_EVENTS,
    from_legacy_entries,
    from_legacy_entry,
)
from gameevents.service.projector import (
    GameEventValue,
    InvalidEnvelope,
    UnsupportedEventCode,
)
from gameevents.tests.golden_cases import GOLDEN_CASES


@pytest.mark.parametrize("case", GOLDEN_CASES, ids=lambda case: case.name)
def test_every_golden_payload_translates_to_the_golden_envelopes(case):
    events = from_legacy_entries(
        case.entries, side=case.side, half=case.half, first_seq=1
    )

    assert events == case.events


def test_the_table_covers_the_scorecard_vocabulary():
    assert set(LEGACY_EVENTS) == {
        "Touchdown",
        "1-Extra-Punkt",
        "2-Extra-Punkte",
        "Overtime",
        "Safety (+1)",
        "Safety (+2)",
        "Turnover",
        "Interception",
        "First Down",
        "Strafe",
        "Spielzeit",
        "Auszeit",
        "Spiel gestartet",
        "2. Halbzeit gestartet",
        "Spiel beendet",
    }


def test_an_unknown_name_is_an_unsupported_code():
    with pytest.raises(UnsupportedEventCode):
        from_legacy_entries([{"name": "Tor"}], side="home", half=1)


def test_a_penalty_without_a_name_is_rejected():
    # The penalty name travels as the envelope's code; without it the event
    # cannot be stored at all (dropping it would lose the row).
    with pytest.raises(InvalidEnvelope):
        from_legacy_entries(
            [{"name": "Strafe", "player": "5", "input": ""}], side="home", half=1
        )


def test_a_penalty_carries_its_name_as_code():
    (event,) = from_legacy_entries(
        [{"name": "Strafe", "player": "5", "input": "Holding"}], side="home", half=1
    )

    assert event.type == "penalty"
    assert event.code == "Holding"
    assert event.payload == {}


def test_a_timeout_carries_its_side_as_code():
    (event,) = from_legacy_entries(
        [{"name": "Auszeit", "input": "00:01"}], side="away", half=2
    )

    assert event.type == "timeout"
    assert event.code == "away"
    assert event.side == "away"
    assert event.payload == {"input": "00:01"}
    assert event.period == 2


@pytest.mark.parametrize(
    "name,code,period",
    [
        ("Spiel gestartet", "start", 1),
        ("2. Halbzeit gestartet", "half_time", 2),
        ("Spiel beendet", "end", 2),
    ],
)
def test_half_time_markers_become_period_events(name, code, period):
    (event,) = from_legacy_entries(
        [{"name": name}], side="home", half=period, first_seq=1
    )

    assert event == GameEventValue(
        type="period",
        code=code,
        side=None,
        player=None,
        period=period,
        payload={},
        seq=1,
    )


@pytest.mark.parametrize(
    "raw,expected",
    [
        ("19", 19),
        (19, 19),
        ("51.85", 51),
        ("", None),
        (None, None),
        ("kein", None),
        (99999, None),
    ],
)
def test_the_jersey_is_coerced_like_the_legacy_writer(raw, expected):
    # GameLogCreator silently truncates a decimal string and drops anything
    # that is not a storable jersey number; the envelope must not store a
    # different player than the TeamLog row did.
    (event,) = from_legacy_entries(
        [{"name": "Touchdown", "player": raw}], side="home", half=1
    )

    assert event.player == expected


def test_the_sequence_is_allocated_from_first_seq():
    events = from_legacy_entries(
        [{"name": "Touchdown", "player": 7}, {"name": "1-Extra-Punkt", "player": 7}],
        side="home",
        half=1,
        first_seq=7,
    )

    assert [event.seq for event in events] == [7, 8]


def test_the_client_id_is_shared_by_the_submission():
    events = from_legacy_entries(
        [{"name": "Touchdown", "player": 7}, {"name": "1-Extra-Punkt", "player": 7}],
        side="home",
        half=1,
        client_id="submission-1",
    )

    assert {event.client_id for event in events} == {"submission-1"}


def test_an_empty_submission_is_rejected():
    with pytest.raises(InvalidEnvelope):
        from_legacy_entries([], side="home", half=1)


def test_a_single_entry_needs_no_submission_context():
    event = from_legacy_entry({"name": "Touchdown", "player": 7}, side="home", half=1)

    assert event.type == "score"
    assert event.code == "touchdown"
    assert event.side == "home"
