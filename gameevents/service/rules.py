"""The sport definition, loaded from JSON: the rules of a game as data.

Why a file and not code: the rulebook has to be reviewable by people who do
not read Python, and a new variant (beach 4v4, flag 7v7) must be a new file
rather than a new branch of ``if`` statements. ``flag_football_5v5.json`` is
the IFAF 2023 edition; every value the app uses for scoring, series, timing or
penalties comes from here, so a rule change is a data change.

The module is deliberately Django-free (``json`` + ``importlib.resources`` +
``functools.cache``): the projector's tests can compare their local scoring
table against the definition without a database, which is the only reason the
projector still keeps that table at all.

Everything returned from :func:`load_rules` is a fresh copy - a caller cannot
corrupt the cached definition by mutating it.
"""

from __future__ import annotations

import copy
import json
from functools import cache
from importlib.resources import files
from typing import Any

SPORT = "flag_football"
VARIANT = "5v5"

#: How a penalty changes the down count.
DOWN_VALUES = ("repeat", "first", "loss")

#: Where the distance is enforced. ``None`` = the officials decide.
ENFORCEMENT_VALUES = ("BS", "SF", "DB", "SL")

SIDES = ("offense", "defense")

#: The penalty row fields every entry must carry.
PENALTY_FIELDS = (
    "code",
    "name",
    "subtext",
    "yards",
    "down",
    "enforcement",
    "side",
    "rule",
)


class RulesDefinitionError(ValueError):
    """The definition file is unreadable or does not match the schema."""


@cache
def _load(sport: str, variant: str) -> dict[str, Any]:
    name = f"{sport}_{variant}.json"
    try:
        raw = files(f"gameevents.sport").joinpath(name).read_text(encoding="utf-8")
    except (
        FileNotFoundError,
        ModuleNotFoundError,
    ) as exc:  # pragma: no cover - packaging
        raise RulesDefinitionError(f"sport definition {name!r} is missing") from exc
    try:
        definition = json.loads(raw)
    except json.JSONDecodeError as exc:  # pragma: no cover - data error
        raise RulesDefinitionError(f"{name} is not valid JSON: {exc}") from exc
    _validate(definition, name)
    return definition


def load_rules(sport: str = SPORT, variant: str = VARIANT) -> dict[str, Any]:
    """The whole definition as a fresh dict."""
    return copy.deepcopy(_load(sport, variant))


def penalty_rows(rules: dict[str, Any] | None = None) -> list[dict[str, Any]]:
    """The penalty catalogue, structured (the shape the field app consumes)."""
    definition = rules if rules is not None else _load(SPORT, VARIANT)
    return copy.deepcopy(definition["penalties"])


def penalty_catalogue(rules: dict[str, Any] | None = None) -> list[dict[str, Any]]:
    """The legacy ``/api/config/scorecard/penalties`` shape.

    The old scorecard sends a penalty's name as the event's ``input`` and reads
    ``isPenaltyAgainstOpponent`` to default the charged team, so this projection
    must stay byte-for-byte compatible - only new rows may appear.
    """
    return [
        {
            "name": row["name"],
            "subtext": row["subtext"],
            "isPenaltyAgainstOpponent": row["side"] == "defense",
        }
        for row in penalty_rows(rules)
    ]


def scoring_values(rules: dict[str, Any] | None = None) -> dict[str, int]:
    """How many points a ``TeamLog`` row is worth, keyed by the row's name.

    The keys are the legacy wire names the projector and ``GameLogCreator``
    share; the values come from the definition (IFAF 2023 R 8-1-1).
    """
    definition = rules if rules is not None else _load(SPORT, VARIANT)
    scoring = definition["scoring"]
    return {
        "Touchdown": scoring["touchdown"],
        "1-Extra-Punkt": scoring["try"]["5"],
        "2-Extra-Punkte": scoring["try"]["10"],
        "Overtime": definition["overtime"]["tiebreak_try"]["points"],
        "Safety (+1)": scoring["try_safety"],
        "Safety (+2)": scoring["safety"],
    }


def _validate(definition: dict[str, Any], name: str) -> None:
    def fail(message: str) -> None:
        raise RulesDefinitionError(f"{name}: {message}")

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
        if section not in definition:
            fail(f"missing section {section!r}")

    field = definition["field"]
    for key in ("length", "middle", "no_run_zone", "spot_precision"):
        if not isinstance(field.get(key), (int, float)):
            fail(f"field.{key} must be a number")
    if field["middle"] * 2 != field["length"]:
        fail("field.middle must be half the field length")

    series = definition["series"]
    if series.get("downs") != 4:
        fail("series.downs must be 4 for flag football")
    if series.get("start") != field["no_run_zone"]:
        fail("series.start and field.no_run_zone disagree")

    if not isinstance(definition["periods"].get("intermission_minutes"), (int, float)):
        fail("periods.intermission_minutes must be a number")
    if definition["timeouts"].get("per_half", 0) < 1:
        fail("timeouts.per_half must be at least 1")

    rows = definition["penalties"]
    if not isinstance(rows, list) or not rows:
        fail("penalties must be a non-empty list")
    seen: set[tuple[str, str]] = set()
    codes: set[str] = set()
    for index, row in enumerate(rows):
        for key in PENALTY_FIELDS:
            if key not in row:
                fail(f"penalties[{index}] misses {key!r}")
        if row["down"] not in DOWN_VALUES:
            fail(f"penalties[{index}].down {row['down']!r} is not one of {DOWN_VALUES}")
        if (
            row["enforcement"] is not None
            and row["enforcement"] not in ENFORCEMENT_VALUES
        ):
            fail(f"penalties[{index}].enforcement {row['enforcement']!r} is invalid")
        if row["side"] not in SIDES:
            fail(f"penalties[{index}].side {row['side']!r} is invalid")
        if not isinstance(row["yards"], int) or row["yards"] < 0:
            fail(f"penalties[{index}].yards must be a whole number >= 0")
        if row["yards"] > field["length"]:
            fail(f"penalties[{index}].yards exceeds the field length")
        key = (row["name"], row["side"])
        if key in seen:
            fail(f"duplicate penalty {key!r}")
        seen.add(key)
        if row["code"] in codes:
            fail(f"duplicate penalty code {row['code']!r}")
        codes.add(row["code"])
