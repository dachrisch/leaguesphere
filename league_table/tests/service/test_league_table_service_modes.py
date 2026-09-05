"""DB-backed integration tests for the "table mode" pipeline wiring in
`LeagueTableService.get_standing()` (issue #1926): default mode stays
byte-for-byte the same, and the two "Top N" modes cap the displayed
standings while tiebreakers keep considering every game."""

from django.test import TestCase

from gamedays.models import Gameday, Gameinfo, Gameresult, SeasonLeagueTeam
from gamedays.tests.setup_factories.factories import GamedayFactory, TeamFactory
from league_table.models import LeagueRulesetTieBreak, LeagueSeasonConfig
from league_table.service.league_table_service import LeagueTableService
from league_table.tests.setup_factories.factories_leaguetable import (
    LeagueSeasonConfigFactory,
    TieBreakStepFactory,
)


def _finished_game(gameday, standing, home, away, *, home_score, away_score):
    game = Gameinfo.objects.create(
        gameday=gameday,
        scheduled="10:00",
        field=1,
        officials=home,
        status=Gameinfo.STATUS_COMPLETED,
        stage="Gruppe",
        standing=standing,
    )
    Gameresult.objects.create(
        gameinfo=game, team=home, fh=home_score, sh=0, pa=away_score, isHome=True
    )
    Gameresult.objects.create(
        gameinfo=game, team=away, fh=away_score, sh=0, pa=home_score, isHome=False
    )
    return game


def _configure_win_quotient_tiebreak(ruleset):
    """Every scenario needs at least one configured tie-break step — a
    ruleset with none breaks `TieBreakerEngine`'s rank-collapsing for ANY
    two teams sharing a standing, independent of this feature."""
    step = TieBreakStepFactory(key="win_quotient")
    LeagueRulesetTieBreak.objects.create(ruleset=ruleset, step=step, order=0)


class TopNGamedaysModeCapsDisplayedStandings(TestCase):
    def setUp(self):
        self.config = LeagueSeasonConfigFactory(
            table_mode=LeagueSeasonConfig.TABLE_MODE_TOP_N_GAMEDAYS,
            table_mode_top_n=2,
        )
        _configure_win_quotient_tiebreak(self.config.ruleset)
        self.league, self.season = self.config.league, self.config.season
        self.config.leagues_for_league_points.add(self.league)

        self.team_a = TeamFactory(name="Team A", description="Team A")
        self.team_b = TeamFactory(name="Team B", description="Team B")
        membership = SeasonLeagueTeam.objects.create(
            season=self.season, league=self.league
        )
        membership.teams.add(self.team_a, self.team_b)

        gameday1 = GamedayFactory(
            season=self.season, league=self.league, date="2026-01-01"
        )
        gameday2 = GamedayFactory(
            season=self.season, league=self.league, date="2026-01-08"
        )
        gameday3 = GamedayFactory(
            season=self.season, league=self.league, date="2026-01-15"
        )
        # Team A: two wins (best) + one blowout loss (worst) -> N=2 drops gameday3.
        _finished_game(
            gameday1, "Gruppe 1", self.team_a, self.team_b, home_score=20, away_score=0
        )
        _finished_game(
            gameday2, "Gruppe 1", self.team_a, self.team_b, home_score=10, away_score=5
        )
        _finished_game(
            gameday3, "Gruppe 1", self.team_b, self.team_a, home_score=30, away_score=0
        )

    def test_displayed_standings_reflect_only_the_best_n_gamedays(self):
        table = LeagueTableService(self.config).get_standing()

        team_a = table[table["team_id"] == self.team_a.pk].iloc[0]
        assert team_a["wins"] == 2
        assert team_a["pf"] == 30
        assert team_a["pa"] == 5
        assert team_a["games_played"] == 2
        assert team_a["units_counted"] == 2
        assert team_a["units_total"] == 3

    def test_query_count_does_not_grow_with_table_mode(self):
        default_config = LeagueSeasonConfigFactory(
            league=self.league,
            season=self.season,
            ruleset=self.config.ruleset,
            table_mode=LeagueSeasonConfig.TABLE_MODE_DEFAULT,
        )
        default_config.leagues_for_league_points.add(self.league)

        with self.assertNumQueries(7):
            LeagueTableService(default_config).get_standing()

        with self.assertNumQueries(7):
            LeagueTableService(self.config).get_standing()


class TopNGamesModeCapsDisplayedStandings(TestCase):
    def setUp(self):
        self.config = LeagueSeasonConfigFactory(
            table_mode=LeagueSeasonConfig.TABLE_MODE_TOP_N_GAMES,
            table_mode_top_n=1,
        )
        _configure_win_quotient_tiebreak(self.config.ruleset)
        self.league, self.season = self.config.league, self.config.season
        self.config.leagues_for_league_points.add(self.league)

        self.team_a = TeamFactory(name="Team A", description="Team A")
        self.team_b = TeamFactory(name="Team B", description="Team B")
        membership = SeasonLeagueTeam.objects.create(
            season=self.season, league=self.league
        )
        membership.teams.add(self.team_a, self.team_b)

        gameday1 = GamedayFactory(
            season=self.season, league=self.league, date="2026-01-01"
        )
        # Two games on the same gameday for team A; only the better one counts.
        _finished_game(
            gameday1, "Gruppe 1", self.team_a, self.team_b, home_score=20, away_score=0
        )
        _finished_game(
            gameday1, "Gruppe 1", self.team_b, self.team_a, home_score=15, away_score=5
        )

    def test_displayed_standings_reflect_only_the_best_n_games(self):
        table = LeagueTableService(self.config).get_standing()

        team_a = table[table["team_id"] == self.team_a.pk].iloc[0]
        assert team_a["wins"] == 1
        assert team_a["pf"] == 20
        assert team_a["pa"] == 0
        assert team_a["games_played"] == 1
        assert team_a["units_counted"] == 1
        assert team_a["units_total"] == 2


class TieBreakUsesUncappedGamesEvenInTopNMode(TestCase):
    """A head-to-head game that falls outside a team's capped "best N" must
    still decide a tiebreak (issue #1926's explicit head-to-head caveat)."""

    def setUp(self):
        self.config = LeagueSeasonConfigFactory(
            table_mode=LeagueSeasonConfig.TABLE_MODE_TOP_N_GAMEDAYS,
            table_mode_top_n=1,
        )
        self.league, self.season = self.config.league, self.config.season
        self.config.leagues_for_league_points.add(self.league)

        win_quotient_step = TieBreakStepFactory(key="win_quotient")
        direct_wins_step = TieBreakStepFactory(key="direct_wins")
        LeagueRulesetTieBreak.objects.create(
            ruleset=self.config.ruleset, step=win_quotient_step, order=0
        )
        LeagueRulesetTieBreak.objects.create(
            ruleset=self.config.ruleset, step=direct_wins_step, order=1
        )

        self.team_a = TeamFactory(name="Team A", description="Team A")
        self.team_b = TeamFactory(name="Team B", description="Team B")
        self.team_c = TeamFactory(name="Team C", description="Team C")
        self.team_d = TeamFactory(name="Team D", description="Team D")
        membership = SeasonLeagueTeam.objects.create(
            season=self.season, league=self.league
        )
        membership.teams.add(self.team_a, self.team_b, self.team_c, self.team_d)

        gameday1 = GamedayFactory(
            season=self.season, league=self.league, date="2026-01-01"
        )
        gameday2 = GamedayFactory(
            season=self.season, league=self.league, date="2026-01-08"
        )
        gameday3 = GamedayFactory(
            season=self.season, league=self.league, date="2026-01-15"
        )
        # Each team's biggest win (their "best" gameday, N=1) is against a
        # third team, so both end up tied 1-0/pf20/pa0 in the capped table.
        _finished_game(
            gameday1, "Gruppe 1", self.team_a, self.team_c, home_score=20, away_score=0
        )
        _finished_game(
            gameday2, "Gruppe 1", self.team_b, self.team_d, home_score=20, away_score=0
        )
        # Their direct meeting is a narrower win, so it's capped out of both
        # teams' "best 1" gameday, but must still decide the tiebreak.
        _finished_game(
            gameday3, "Gruppe 1", self.team_a, self.team_b, home_score=5, away_score=0
        )

    def test_head_to_head_outside_the_cap_still_resolves_the_tie(self):
        table = LeagueTableService(self.config).get_standing()

        team_a = table[table["team_id"] == self.team_a.pk].iloc[0]
        team_b = table[table["team_id"] == self.team_b.pk].iloc[0]

        # Both show identical capped win_quotient/pf/pa...
        assert team_a["win_quotient"] == team_b["win_quotient"]
        assert team_a["pf"] == team_b["pf"] == 20
        # ...but team A won the (capped-out) head-to-head game, so it ranks first.
        assert team_a["rank"] < team_b["rank"]
