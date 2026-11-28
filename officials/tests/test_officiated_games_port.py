"""The officiated-games port: officials asks, matchreport answers (scan B3)."""

import pytest
from django.core.exceptions import ImproperlyConfigured

from officials.service import officiated_games


@pytest.fixture
def restore_provider():
    saved = officiated_games._provider
    yield
    officiated_games._provider = saved


def test_matchreport_registers_the_provider_at_startup():
    from matchreport.service.officiated_games_service import (
        officiated_games_for_team,
    )

    assert officiated_games._provider is officiated_games_for_team


def test_an_unregistered_provider_fails_loudly(restore_provider):
    officiated_games._provider = None
    with pytest.raises(ImproperlyConfigured):
        officiated_games.team_officiated_games(1, 2027)


def test_the_call_is_forwarded_with_its_options(restore_provider):
    calls = []

    def provider(team_id, season, include_official_actions, next_path):
        calls.append((team_id, season, include_official_actions, next_path))
        return ["game"]

    officiated_games.register_provider(provider)
    result = officiated_games.team_officiated_games(
        3, 2027, include_official_actions=True, next_path="/here/"
    )
    assert result == ["game"]
    assert calls == [(3, 2027, True, "/here/")]
