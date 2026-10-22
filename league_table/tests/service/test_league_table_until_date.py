"""``get_standing(until_date=...)`` feeds the home page's table-movement card.

The ranking engine itself is unchanged; this pins that the date bound really
narrows the results the engine sees.
"""

from datetime import date

import pytest

from gamedays.models import Gameresult, Gameinfo, SeasonLeagueTeam
from gamedays.tests.setup_factories.factories import (
    GamedayFactory,
    GameinfoFactory,
    TeamFactory,
)
from league_table.service.league_table_service import LeagueTableService
from league_table.tests.setup_factories.factories_leaguetable import (
    LeagueSeasonConfigFactory,
)


class _StopAfterCapturing(Exception):
    """Stops get_standing() once the results queryset has been captured."""


def _result(gameday, home, away, fh, sh, pa):
    gameinfo = GameinfoFactory(gameday=gameday, status=Gameinfo.STATUS_COMPLETED)
    return Gameresult.objects.create(
        gameinfo=gameinfo, team=home, fh=fh, sh=sh, pa=pa, isHome=True
    )


@pytest.mark.django_db
def test_until_date_excludes_results_after_the_cutoff(monkeypatch):
    config = LeagueSeasonConfigFactory()
    config.leagues_for_league_points.add(config.league)
    home = TeamFactory(name="home-team", description="Home Team")
    away = TeamFactory(name="away-team", description="Away Team")
    SeasonLeagueTeam.objects.create(
        season=config.season, league=config.league
    ).teams.add(home, away)

    earlier = GamedayFactory(
        season=config.season, league=config.league, date=date(2026, 5, 11)
    )
    later = GamedayFactory(
        season=config.season, league=config.league, date=date(2026, 5, 25)
    )
    old_result = _result(earlier, home, away, fh=10, sh=10, pa=0)
    _result(later, home, away, fh=0, sh=0, pa=20)

    captured = {}

    def spy(self, results, team_and_league_ids):
        captured["ids"] = set(results.values_list("pk", flat=True))
        raise _StopAfterCapturing

    monkeypatch.setattr(LeagueTableService, "_get_games_with_results_as_dataframe", spy)

    with pytest.raises(_StopAfterCapturing):
        LeagueTableService(config).get_standing(until_date=date(2026, 5, 20))

    assert captured["ids"] == {old_result.pk}


@pytest.mark.django_db
def test_without_until_date_all_results_are_seen(monkeypatch):
    config = LeagueSeasonConfigFactory()
    config.leagues_for_league_points.add(config.league)
    home = TeamFactory(name="home-team", description="Home Team")
    away = TeamFactory(name="away-team", description="Away Team")
    SeasonLeagueTeam.objects.create(
        season=config.season, league=config.league
    ).teams.add(home, away)

    earlier = GamedayFactory(
        season=config.season, league=config.league, date=date(2026, 5, 11)
    )
    later = GamedayFactory(
        season=config.season, league=config.league, date=date(2026, 5, 25)
    )
    old_result = _result(earlier, home, away, fh=10, sh=10, pa=0)
    new_result = _result(later, home, away, fh=0, sh=0, pa=20)

    captured = {}

    def spy(self, results, team_and_league_ids):
        captured["ids"] = set(results.values_list("pk", flat=True))
        raise _StopAfterCapturing

    monkeypatch.setattr(LeagueTableService, "_get_games_with_results_as_dataframe", spy)

    with pytest.raises(_StopAfterCapturing):
        LeagueTableService(config).get_standing()

    assert captured["ids"] == {old_result.pk, new_result.pk}
