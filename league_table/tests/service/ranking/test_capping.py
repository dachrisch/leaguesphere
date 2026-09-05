import pandas as pd
import pytest

from gamedays.service.gameday_settings import (
    GAMEDAY_DATE,
    GAMEDAY_ID,
    PA,
    PF,
    SCHEDULED,
    TEAM_ID,
)
from league_table.models import LeagueSeasonConfig
from league_table.service.ranking.capping import (
    UNITS_COUNTED,
    UNITS_TOTAL,
    GameCappingEngine,
)


def _game_row(team_id, gameday_id, gameinfo, *, pf, pa, date, scheduled="10:00"):
    return {
        "gameinfo": gameinfo,
        TEAM_ID: team_id,
        GAMEDAY_ID: gameday_id,
        GAMEDAY_DATE: date,
        SCHEDULED: scheduled,
        PF: pf,
        PA: pa,
        "gameinfo__status": "beendet",
    }


def _no_game_row(team_id):
    """The synthetic placeholder row `_init_df_with_default_values` produces
    for a team with zero games: no gameinfo/gameday linkage at all."""
    return {
        "gameinfo": pd.NA,
        TEAM_ID: team_id,
        GAMEDAY_ID: pd.NA,
        GAMEDAY_DATE: pd.NA,
        SCHEDULED: pd.NA,
        PF: 0,
        PA: 0,
        "gameinfo__status": "Initial",
    }


class TestGameCappingEngineDefaultMode:
    def test_default_mode_returns_input_unchanged_with_no_summary(self):
        games_df = pd.DataFrame([_game_row(1, 1, 1, pf=20, pa=10, date="2026-01-01")])

        capped, summary = GameCappingEngine(
            LeagueSeasonConfig.TABLE_MODE_DEFAULT, None
        ).cap(games_df)

        pd.testing.assert_frame_equal(capped, games_df)
        assert summary is None


class TestGameCappingEngineTopNGamedays:
    def _engine(self, top_n):
        return GameCappingEngine(LeagueSeasonConfig.TABLE_MODE_TOP_N_GAMEDAYS, top_n)

    def test_team_with_fewer_gamedays_than_n_is_unchanged(self):
        games_df = pd.DataFrame(
            [
                _game_row(1, 1, 1, pf=20, pa=10, date="2026-01-01"),
                _game_row(1, 2, 2, pf=5, pa=15, date="2026-01-08"),
            ]
        )

        capped, summary = self._engine(top_n=3).cap(games_df)

        assert set(capped[GAMEDAY_ID]) == {1, 2}
        row = summary[summary[TEAM_ID] == 1].iloc[0]
        assert row[UNITS_COUNTED] == 2
        assert row[UNITS_TOTAL] == 2

    def test_keeps_best_n_gamedays_by_wins_then_pf_then_pa(self):
        # Team 1 plays 3 gamedays: a win, a narrow loss, and a blowout loss.
        # With N=2, the blowout loss (worst PF/PA) must be dropped.
        games_df = pd.DataFrame(
            [
                _game_row(1, 1, 1, pf=20, pa=10, date="2026-01-01"),  # win
                _game_row(1, 2, 2, pf=10, pa=12, date="2026-01-08"),  # narrow loss
                _game_row(1, 3, 3, pf=0, pa=40, date="2026-01-15"),  # blowout loss
            ]
        )

        capped, summary = self._engine(top_n=2).cap(games_df)

        assert set(capped[GAMEDAY_ID]) == {1, 2}
        row = summary[summary[TEAM_ID] == 1].iloc[0]
        assert row[UNITS_COUNTED] == 2
        assert row[UNITS_TOTAL] == 3

    def test_keeps_whole_gameday_even_with_multiple_games_in_it(self):
        # Gameday 1 has two games for team 1; capping must keep or drop the
        # whole gameday, not split individual games out of a kept gameday.
        games_df = pd.DataFrame(
            [
                _game_row(1, 1, 1, pf=20, pa=10, date="2026-01-01"),
                _game_row(1, 1, 2, pf=15, pa=5, date="2026-01-01"),
                _game_row(1, 2, 3, pf=0, pa=40, date="2026-01-08"),
            ]
        )

        capped, _ = self._engine(top_n=1).cap(games_df)

        assert len(capped) == 2
        assert set(capped["gameinfo"]) == {1, 2}

    def test_ties_on_wins_pf_pa_break_toward_earliest_date(self):
        games_df = pd.DataFrame(
            [
                _game_row(1, 1, 1, pf=20, pa=10, date="2026-02-01"),
                _game_row(1, 2, 2, pf=20, pa=10, date="2026-01-01"),
            ]
        )

        capped, _ = self._engine(top_n=1).cap(games_df)

        assert list(capped[GAMEDAY_ID]) == [2]

    def test_teams_with_zero_games_keep_their_placeholder_row(self):
        games_df = pd.DataFrame(
            [
                _game_row(1, 1, 1, pf=20, pa=10, date="2026-01-01"),
                _no_game_row(2),
            ]
        )

        capped, summary = self._engine(top_n=1).cap(games_df)

        assert (capped[TEAM_ID] == 2).any()
        row = summary[summary[TEAM_ID] == 2].iloc[0]
        assert row[UNITS_COUNTED] == 0
        assert row[UNITS_TOTAL] == 0


class TestGameCappingEngineTopNGames:
    def _engine(self, top_n):
        return GameCappingEngine(LeagueSeasonConfig.TABLE_MODE_TOP_N_GAMES, top_n)

    def test_team_with_fewer_games_than_n_is_unchanged(self):
        games_df = pd.DataFrame([_game_row(1, 1, 1, pf=20, pa=10, date="2026-01-01")])

        capped, summary = self._engine(top_n=5).cap(games_df)

        assert len(capped) == 1
        row = summary[summary[TEAM_ID] == 1].iloc[0]
        assert row[UNITS_COUNTED] == 1
        assert row[UNITS_TOTAL] == 1

    def test_keeps_best_n_individual_games_by_pf_then_pa(self):
        games_df = pd.DataFrame(
            [
                _game_row(1, 1, 1, pf=20, pa=10, date="2026-01-01"),
                _game_row(1, 1, 2, pf=15, pa=5, date="2026-01-01"),
                _game_row(1, 2, 3, pf=0, pa=40, date="2026-01-08"),
            ]
        )

        capped, summary = self._engine(top_n=2).cap(games_df)

        assert set(capped["gameinfo"]) == {1, 2}
        row = summary[summary[TEAM_ID] == 1].iloc[0]
        assert row[UNITS_COUNTED] == 2
        assert row[UNITS_TOTAL] == 3

    def test_ties_on_pf_pa_break_toward_earliest_date_then_scheduled_time(self):
        games_df = pd.DataFrame(
            [
                _game_row(1, 1, 1, pf=20, pa=10, date="2026-01-01", scheduled="12:00"),
                _game_row(1, 1, 2, pf=20, pa=10, date="2026-01-01", scheduled="09:00"),
            ]
        )

        capped, _ = self._engine(top_n=1).cap(games_df)

        assert list(capped["gameinfo"]) == [2]


class TestGameCappingEngineEdgeCases:
    def test_empty_games_df_returns_empty_with_no_summary(self):
        games_df = pd.DataFrame(
            columns=["gameinfo", TEAM_ID, GAMEDAY_ID, GAMEDAY_DATE, SCHEDULED, PF, PA]
        )

        capped, summary = GameCappingEngine(
            LeagueSeasonConfig.TABLE_MODE_TOP_N_GAMEDAYS, 2
        ).cap(games_df)

        assert capped.empty
        assert summary is None

    def test_unknown_table_mode_raises(self):
        games_df = pd.DataFrame([_game_row(1, 1, 1, pf=20, pa=10, date="2026-01-01")])

        with pytest.raises(ValueError):
            GameCappingEngine("not-a-real-mode", 2).cap(games_df)
