"""Contract tests for the eligibility chain (LSP, architecture scan N1).

A rule (`BaseValidator` subclass) either passes (`True`) or raises
`ValidationError` with the message shown in the roster; it never answers
`False`. An exemption is a separate kind of object: it answers whether a
player is exempt and never raises.
"""

from datetime import datetime

import pytest

from gamedays.models import Person
from passcheck.api.serializers import RosterSerializer
from passcheck.service.eligibility_validation import (
    BaseValidator,
    FinalsValidator,
    MaxGameDaysValidator,
    PlayerExemption,
    RelegationValidator,
    ValidationError,
    WomanPlayerExemption,
    YouthPlayerExemption,
)

LEAGUE = 7


def _rules_and_failing_players():
    return [
        (MaxGameDaysValidator(LEAGUE, 2), {f"{LEAGUE}": 2}),
        (RelegationValidator("Relegation", False), {}),
        (FinalsValidator("Final4", 3, LEAGUE), {f"{LEAGUE}": 1}),
    ]


@pytest.mark.parametrize("rule, player", _rules_and_failing_players())
def test_rule_signals_failure_by_raising_never_by_false(rule, player):
    with pytest.raises(ValidationError):
        rule.check(player)


@pytest.mark.parametrize(
    "rule, player",
    [
        (MaxGameDaysValidator(LEAGUE, 2), {f"{LEAGUE}": 1}),
        (RelegationValidator("Spieltag", False), {}),
        (FinalsValidator("Spieltag", 3, LEAGUE), {f"{LEAGUE}": 0}),
    ],
)
def test_rule_passes_with_true(rule, player):
    assert rule.check(player) is True


def test_check_runs_the_next_rule_after_a_pass():
    first = MaxGameDaysValidator(LEAGUE, 5)
    first.set_next_validator(FinalsValidator("Final8", 3, LEAGUE))
    with pytest.raises(ValidationError):
        first.check({f"{LEAGUE}": 1})


def test_base_rule_is_abstract():
    with pytest.raises(NotImplementedError):
        BaseValidator().is_valid({})


def test_exemptions_are_not_rules():
    assert not issubclass(YouthPlayerExemption, BaseValidator)
    assert not issubclass(WomanPlayerExemption, BaseValidator)
    assert issubclass(YouthPlayerExemption, PlayerExemption)
    assert issubclass(WomanPlayerExemption, PlayerExemption)


def test_base_exemption_is_abstract():
    with pytest.raises(NotImplementedError):
        PlayerExemption().applies({})


def test_youth_exemption_answers_bool():
    year = datetime.today().year
    exemption = YouthPlayerExemption(19)
    assert exemption.applies({RosterSerializer.YEAR_OF_BIRTH_C: year - 18}) is True
    assert exemption.applies({RosterSerializer.YEAR_OF_BIRTH_C: year - 19}) is False


@pytest.mark.parametrize(
    "except_for_women, sex, expected",
    [
        (True, Person.FEMALE, True),
        (True, Person.MALE, False),
        (False, Person.FEMALE, False),
    ],
)
def test_woman_exemption_answers_bool(except_for_women, sex, expected):
    exemption = WomanPlayerExemption(except_for_women)
    assert exemption.applies({RosterSerializer.SEX_C: sex}) is expected
