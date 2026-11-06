"""The sport definition is the rulebook: these tests pin it to IFAF 2023.

They are the acceptance for R1. The definition, not the code, is what a rule
change edits - so the values are asserted here against the pages of the book,
and the two legacy scoring tables are asserted against the definition.
"""

from __future__ import annotations

import re

import pytest

# The directory's conftest pins the database (foreign keys, user id 1), so
# even a data-only module needs the marker.
pytestmark = pytest.mark.django_db

from gameevents.service.rules import (
    DOWN_VALUES,
    ENFORCEMENT_VALUES,
    RulesDefinitionError,
    load_rules,
    penalty_catalogue,
    penalty_rows,
    scoring_values,
)

#: The 50 names the German catalogue shipped with (order preserved) plus the
#: four rows IFAF 2023 p. 39 requires and the catalogue was missing.
LEGACY_NAMES = [
    "illegaler Kontakt Defense",
    "Flag Guarding",
    "Fehlstart",
    "Abschirmen (Blocken) Offense",
    "illegaler Kontakt Offense",
    "Abschirmen (Blocken) Defense",
    "Defense Passbehinderung",
    "Behinderung Spieldurchführung Defense",
    "Passverzögerung",
    "illegale Ballübergabe",
    "illegaler Rückwärtspass",
    "illegales Touching/Ballberührung",
    "Vorwärtsschlagen eines Rückwärtspasses durch das passende Team",
    "illegaler Vorwärtspass",
    "Offense Passbehinderung",
    "Behinderung Spieldurchführung Offense",
    "Springen",
    "Hechten",
    "illegaler Kick durch Runner",
    "illegaler Snap",
    "Spielverzögerung Offense",
    "Spielverzögerung Defense",
    "Encroachment",
    "illegaler Shift",
    "illegale Motion",
    "illegaler Lauf",
    "illegaler Laufspielzug",
    "Defense Offside",
    "Störende Signale",
    "illegales Blitzersignal",
    "illegaler Blitz",
    "illegales Flaggenziehen",
    "illegales Treten eines Pass Defense",
    "illegales Treten eines Pass Offense",
    "Behinderung an der Seitenlinie Offense",
    "Behinderung an der Seitenlinie Defense",
    "illegale Spielteilnahme Offense",
    "illegale Spielteilnahme Defense",
    "illegale Auswechslung Offense",
    "illegale Auswechslung Defense",
    "Unsportliches Verhalten Offense",
    "Unsportliches Verhalten Defense",
    "Grob unsportliches Verhalten Offense",
    "Grob unsportliches Verhalten Defense",
    "Person mit illegaler Ausrüstung verlässt nicht das Feld Offense",
    "Person mit illegaler Ausrüstung verlässt nicht das Feld Defense",
    "Person mit fehlender vorgeschriebener Ausrüstung verlässt nicht das Feld Offense",
    "Person mit fehlender vorgeschriebener Ausrüstung verlässt nicht das Feld Defense",
    "Person mit blutender Wunde verlässt nicht das Feld Offense",
    "Person mit blutender Wunde verlässt nicht das Feld Defense",
]

NEW_NAMES = [
    "Auszeit ohne verbleibende Auszeit Offense",
    "Auszeit ohne verbleibende Auszeit Defense",
    "Fehlgeschlagene Challenge Offense",
    "Fehlgeschlagene Challenge Defense",
]

CONCEPTS = LEGACY_NAMES + NEW_NAMES


def test_definition_loads_every_section():
    rules = load_rules()

    assert rules["sport"] == "flag_football"
    assert rules["variant"] == "5v5"
    assert rules["ruleset"] == "IFAF 2023"
    for section in (
        "field",
        "series",
        "scoring",
        "periods",
        "timeouts",
        "overtime",
        "officials",
        "penalties",
    ):
        assert section in rules


def test_the_50_legacy_names_are_kept_verbatim_in_order():
    """The old scorecard sends the name as the event's input: renaming breaks it."""
    names = [row["name"] for row in penalty_rows()]
    assert names[: len(LEGACY_NAMES)] == LEGACY_NAMES
    assert sorted(names[len(LEGACY_NAMES) :]) == sorted(NEW_NAMES)
    assert len(names) == 54


def test_every_row_carries_the_structured_fields():
    for row in penalty_rows():
        assert row["down"] in DOWN_VALUES
        assert row["enforcement"] in ENFORCEMENT_VALUES
        assert row["side"] in ("offense", "defense")
        assert isinstance(row["yards"], int)
        assert 0 <= row["yards"] <= 50
        assert row["rule"] != ""


def test_field_and_series_geometry_is_the_50_yard_field():
    field, series = load_rules()["field"], load_rules()["series"]

    assert field["length"] == 50
    assert field["middle"] == 25
    assert field["end_zone"] == 10
    assert field["no_run_zone"] == 5
    assert series["downs"] == 4
    assert series["start"] == 5
    assert series["interception_spot"] == "dead_ball"
    assert series["first_down_at_middle"] == "once"


def test_scoring_matches_rule_8_1_1():
    """ "Touchdown 6, try from 5 = 1, try from 10 = 2, safety 2, safety on a try 1"."""
    scoring = load_rules()["scoring"]

    assert scoring["touchdown"] == 6
    assert scoring["try"] == {"5": 1, "10": 2}
    assert scoring["try_defense"] == 2
    assert scoring["safety"] == 2
    assert scoring["try_safety"] == 1


def test_periods_timeouts_and_overtime_come_from_the_book():
    rules = load_rules()

    assert rules["periods"]["count"] == 2
    assert rules["periods"]["length_minutes"] == 20
    assert rules["periods"]["intermission_minutes"] == 2
    assert rules["periods"]["pass_clock_seconds"] == 7
    assert rules["timeouts"] == {
        "per_half": 2,
        "seconds": 60,
        "carry_over": False,
        "in_overtime": False,
    }
    assert rules["overtime"]["start_spot"] == 25
    assert rules["overtime"]["first_down_at_middle"] is False


def test_penalty_yardages_that_the_catalogue_had_wrong():
    """R 7-1-5 is 5 yards + loss of down; the old subtext said only ``SF/LoD``."""
    rows = {row["name"]: row for row in penalty_rows()}

    handoff = rows["illegale Ballübergabe"]
    assert (handoff["yards"], handoff["down"], handoff["enforcement"]) == (
        5,
        "loss",
        "SF",
    )

    # R 7-1-3g and R 7-2-5 carry loss of down and no distance.
    assert rows["Passverzögerung"]["yards"] == 0
    assert rows["Passverzögerung"]["down"] == "loss"
    assert rows["Passverzögerung"]["enforcement"] == "SL"
    assert rows["illegales Touching/Ballberührung"]["yards"] == 0
    assert rows["illegales Touching/Ballberührung"]["down"] == "loss"


def test_unsportsmanlike_is_ten_yards_from_the_dead_ball_spot():
    for side in ("Offense", "Defense"):
        row = next(
            r for r in penalty_rows() if r["name"] == f"Unsportliches Verhalten {side}"
        )
        assert (row["yards"], row["down"], row["enforcement"]) == (10, "repeat", "DB")


def test_charged_timeout_rows_and_the_failed_challenge():
    rows = {row["name"]: row for row in penalty_rows()}

    assert rows["Fehlgeschlagene Challenge Offense"]["charged_timeout"] is True
    assert rows["Fehlgeschlagene Challenge Defense"]["charged_timeout"] is True
    assert rows["Fehlgeschlagene Challenge Offense"]["yards"] == 0

    # no timeouts left is a real 5-yard foul (p. 39)
    assert rows["Auszeit ohne verbleibende Auszeit Offense"]["yards"] == 5


def test_flagrant_fouls_are_disqualifications_without_a_fixed_distance():
    for side in ("Offense", "Defense"):
        row = next(
            r
            for r in penalty_rows()
            if r["name"] == f"Grob unsportliches Verhalten {side}"
        )
        assert row["disqualification"] is True
        assert row["yards"] == 0


def test_legacy_catalogue_shape_is_unchanged():
    rows = penalty_catalogue()

    assert set(rows[0]) == {"name", "subtext", "isPenaltyAgainstOpponent"}
    assert len(rows) == 54
    defence = next(r for r in rows if r["name"] == "illegaler Kontakt Defense")
    offence = next(r for r in rows if r["name"] == "illegaler Kontakt Offense")
    assert defence["isPenaltyAgainstOpponent"] is True
    assert offence["isPenaltyAgainstOpponent"] is False


def test_scoring_values_are_derived_from_the_definition():
    assert scoring_values() == {
        "Touchdown": 6,
        "1-Extra-Punkt": 1,
        "2-Extra-Punkte": 2,
        "Overtime": 1,
        "Safety (+1)": 1,
        "Safety (+2)": 2,
    }


def test_the_two_legacy_copies_of_the_scoring_table_agree():
    """The projector stays Django-free, so it keeps a copy - pinned here."""
    from gamedays.service.gamelog import SCORING_EVENT_VALUES as GAMELOG
    from gameevents.service.projector import SCORING_EVENT_VALUES as PROJECTOR

    assert GAMELOG == scoring_values()
    assert PROJECTOR == scoring_values()


def test_load_returns_a_copy_that_cannot_corrupt_the_cache():
    first = load_rules()
    first["penalties"][0]["yards"] = 99

    assert load_rules()["penalties"][0]["yards"] != 99


def _broken(mutate):
    """A copy of the definition with one thing removed or made wrong."""
    definition = load_rules()
    mutate(definition)
    return definition


def _drop(section):
    return lambda rules: rules.pop(section)


def _set(path, value):
    def mutate(rules):
        node = rules
        for key in path[:-1]:
            node = node[key]
        node[path[-1]] = value

    return mutate


@pytest.mark.parametrize(
    ("mutate", "message"),
    [
        (_drop("field"), "missing section 'field'"),
        (_drop("penalties"), "missing section 'penalties'"),
        (_set(("field", "length"), "50"), "field.length must be a number"),
        (_set(("field", "middle"), 20), "field.middle must be half"),
        (_set(("series", "downs"), 3), "series.downs must be 4"),
        (_set(("series", "start"), 4), "series.start and field.no_run_zone"),
        (
            _set(("periods", "intermission_minutes"), None),
            "periods.intermission_minutes must be a number",
        ),
        (_set(("timeouts", "per_half"), 0), "timeouts.per_half must be at least 1"),
        (_set(("penalties",), []), "penalties must be a non-empty list"),
        (
            lambda rules: rules["penalties"][0].pop("rule"),
            "misses 'rule'",
        ),
        (_set(("penalties", 0, "down"), "sometimes"), "penalties[0].down"),
        (_set(("penalties", 0, "enforcement"), "XX"), "penalties[0].enforcement"),
        (_set(("penalties", 0, "side"), "both"), "penalties[0].side"),
        (_set(("penalties", 0, "yards"), -1), "yards must be a whole number"),
        (_set(("penalties", 0, "yards"), 60), "exceeds the field length"),
        (
            lambda rules: rules["penalties"][1].update(
                name=rules["penalties"][0]["name"],
                side=rules["penalties"][0]["side"],
            ),
            "duplicate penalty",
        ),
        (
            lambda rules: rules["penalties"][1].update(
                code=rules["penalties"][0]["code"]
            ),
            "duplicate penalty code",
        ),
    ],
)
def test_a_broken_definition_is_rejected_with_a_readable_error(mutate, message):
    from gameevents.service.rules import _validate

    with pytest.raises(RulesDefinitionError, match=re.escape(message)):
        _validate(_broken(mutate), "test.json")


def test_a_definition_file_that_is_not_json_is_rejected():
    from gameevents.service.rules import RulesDefinitionError, _load

    with pytest.raises(RulesDefinitionError):
        _load("does-not-exist", "v5")
