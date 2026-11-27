"""Characterization of pandas wrappers before the hook inversion (#2537).

The original functions are exercised here to 100% branch coverage; the
diff-scoped gate verifies that before the move commit.
"""

from __future__ import annotations

from unittest.mock import MagicMock, patch

import pandas as pd
import pytest
from django.test import TestCase

from gamedays.service import gameday_settings as gs
from gamedays.service.model_wrapper import GamedayModelWrapper
from gamedays.service.model_statistics_wrapper import LeagueStatisticsModelWrapper
from gamedays.tests.setup_factories.db_setup import DBSetup


def _wrapper(**attributes):
    wrapper = GamedayModelWrapper.__new__(GamedayModelWrapper)
    for name, value in attributes.items():
        setattr(wrapper, name, value)
    return wrapper


class ModelWrapperCharacterization(TestCase):
    def setUp(self):
        DBSetup().g62_qualify_finished()
        self.gameday = __import__(
            "gamedays.models", fromlist=["Gameday"]
        ).Gameday.objects.first()

    def test_no_gameinfo_raises(self):
        with patch("gamedays.service.model_wrapper.Gameinfo.objects") as objects:
            objects.select_related.return_value.filter.return_value.exists.return_value = (
                False
            )
            with pytest.raises(
                __import__(
                    "gamedays.models", fromlist=["Gameinfo"]
                ).Gameinfo.DoesNotExist
            ):
                GamedayModelWrapper(self.gameday.pk)

    def test_construction_uses_the_registered_season_settings_hook(self):
        config, ruleset = object(), object()
        with patch(
            "gamedays.service.model_wrapper.league_table_hooks.season_settings",
            return_value=(config, ruleset),
        ) as settings:
            wrapper = GamedayModelWrapper(self.gameday.pk)
        settings.assert_called_once()
        assert wrapper.league_season_config is config
        assert wrapper.league_season_ruleset is ruleset

    def test_empty_values_dataframe_raises(self):
        with patch("gamedays.service.model_wrapper.Gameinfo.objects") as objects:
            objects.select_related.return_value.filter.return_value.exists.return_value = (
                True
            )
            objects.select_related.return_value.filter.return_value.first.return_value.gameday = (
                self.gameday
            )
            objects.select_related.return_value.filter.return_value.values.return_value = (
                []
            )
            with pytest.raises(
                __import__(
                    "gamedays.models", fromlist=["Gameinfo"]
                ).Gameinfo.DoesNotExist
            ):
                GamedayModelWrapper(self.gameday.pk)

    def test_no_gameresults_leaves_an_empty_result_table(self):
        with patch("gamedays.service.model_wrapper.Gameinfo.objects") as objects:
            objects.select_related.return_value.filter.return_value.exists.return_value = (
                True
            )
            objects.select_related.return_value.filter.return_value.first.return_value.gameday = (
                self.gameday
            )
            objects.select_related.return_value.filter.return_value.values.return_value = [
                {"id": 1, gs.STAGE_CATEGORY: "Preliminary", gs.STATUS: "beendet"}
            ]
            with patch("gamedays.service.model_wrapper.Gameresult.objects") as results:
                results.filter.return_value.order_by.return_value.values.return_value = (
                    []
                )
                wrapper = GamedayModelWrapper(self.gameday.pk)
        assert wrapper._games_with_result.empty

    def test_staff_passcheck_details_empty_and_populated(self):
        """Pin the queryset shape at the hook boundary, not a mock's return."""
        wrapper = _wrapper()
        with patch(
            "passcheck.service.gamedays_hooks.PasscheckVerification.objects"
        ) as objects:
            objects.filter.return_value.values.return_value = []
            empty = wrapper.get_staff_passcheck_details(1)
            assert list(empty.columns) == [
                "Zeitpunkt",
                "Schiedsrichter",
                "Account",
                "Team",
                "Notiz",
            ]
            objects.filter.return_value.values.return_value = [
                {
                    "created_at": pd.Timestamp("2026-01-01"),
                    "official_name": "A",
                    "user__username": "u",
                    "team__description": "T",
                    "note": "a\nb",
                }
            ]
            populated = wrapper.get_staff_passcheck_details(1)
        assert populated["Notiz"].iloc[0] == "a</br>b"
        assert populated["Schiedsrichter"].iloc[0] == "A"
        assert populated["Zeitpunkt"].iloc[0] == "2026-01-01 00:00:00"

    def test_construction_without_season_settings_hook_keeps_the_fallback(self):
        with patch(
            "gamedays.service.model_wrapper.registry.is_registered",
            return_value=False,
        ):
            wrapper = GamedayModelWrapper(self.gameday.pk)
        assert wrapper.league_season_ruleset is None
        assert wrapper.league_season_config is None
        table = wrapper._get_table()
        with patch.object(GamedayModelWrapper, "_get_table", return_value=table):
            assert wrapper.get_qualify_table() is table

    def test_qualify_table_fallbacks(self):
        table = pd.DataFrame([{gs.STANDING: "Gruppe 1"}])
        wrapper = _wrapper(
            league_season_ruleset=None,
            _games_with_result=pd.DataFrame(
                [{gs.STAGE_CATEGORY: "Preliminary", gs.STATUS: "beendet"}]
            ),
        )
        with patch.object(GamedayModelWrapper, "_get_table", return_value=table):
            with patch(
                "gamedays.service.model_wrapper.registry.is_registered",
                return_value=False,
            ):
                assert wrapper.get_qualify_table() is table
            with patch(
                "gamedays.service.model_wrapper.registry.is_registered",
                return_value=True,
            ):
                assert wrapper.get_qualify_table() is table
                wrapper._games_with_result = pd.DataFrame(
                    [{gs.STAGE_CATEGORY: "Final", gs.STATUS: "beendet"}]
                )
                assert wrapper.get_qualify_table() is table

    def test_qualify_table_with_no_preliminary_games(self):
        table = pd.DataFrame([{gs.STANDING: "Gruppe 1"}])
        wrapper = _wrapper(
            league_season_ruleset=object(),
            _games_with_result=pd.DataFrame(
                [{gs.STAGE_CATEGORY: "Final", gs.STATUS: "beendet"}]
            ),
        )
        with (
            patch.object(GamedayModelWrapper, "_get_table", return_value=table),
            patch(
                "gamedays.service.league_table_hooks.rank_by_games",
                return_value=table,
            ),
        ):
            assert wrapper.get_qualify_table() is table

    def test_final_table_without_ruleset(self):
        wrapper = _wrapper(
            _gameinfo=pd.DataFrame([{gs.STATUS: "beendet"}]),
            league_season_ruleset=None,
        )
        with patch.object(GamedayModelWrapper, "has_finalround", return_value=True):
            assert wrapper.get_final_table() is None

    def test_offense_table_config_branches(self):
        events = pd.DataFrame(
            [
                {
                    "team__description": "A",
                    "team__name": "A",
                    "team_id": 1,
                    "event": "Touchdown",
                    "player": 7,
                    "value": 6,
                }
            ]
        )
        wrapper = _wrapper(
            league_season_config=None, _gameinfo=pd.DataFrame([{"id": 1}])
        )
        with patch("gamedays.service.model_wrapper.TeamLog.objects") as objects:
            objects.filter.return_value.exclude.return_value.exclude.return_value.values.return_value = events.to_dict(
                "records"
            )
            assert wrapper.get_offense_player_statistics_table().empty is False

        class Config:
            def get_gameday_statistic_settings(self):
                return {"show_player_names": False, "top_n_players": 10}

        wrapper.league_season_config = Config()
        with patch("gamedays.service.model_wrapper.TeamLog.objects") as objects:
            objects.filter.return_value.exclude.return_value.exclude.return_value.values.return_value = events.to_dict(
                "records"
            )
            wrapper.get_offense_player_statistics_table()

    def test_player_names_are_used_when_configured(self):
        names = pd.DataFrame(
            [
                {
                    "gameday_id": 1,
                    "gameday_jersey": 7,
                    "team_id": 1,
                    "first_name": "First",
                    "last_name": "Last",
                }
            ]
        )

        class Config:
            def get_gameday_statistic_settings(self):
                return {"show_player_names": True, "top_n_players": 10}

        wrapper = _wrapper(
            league_season_config=Config(), _gameinfo=pd.DataFrame([{"id": 1}])
        )
        events = [
            {
                "team__description": "A",
                "team__name": "A",
                "team_id": 1,
                "event": "Touchdown",
                "player": 7,
                "value": 6,
            }
        ]
        with (
            patch("gamedays.service.model_wrapper.TeamLog.objects") as objects,
            patch.object(
                GamedayModelWrapper,
                "_get_passcheck_player_jersey_number",
                return_value=names,
            ),
        ):
            objects.filter.return_value.exclude.return_value.exclude.return_value.values.return_value = (
                events
            )
            wrapper.get_offense_player_statistics_table()
        with (
            patch("gamedays.service.model_wrapper.TeamLog.objects") as objects,
            patch.object(
                GamedayModelWrapper,
                "_get_passcheck_player_jersey_number",
                return_value=names,
            ),
        ):
            objects.filter.return_value.exclude.return_value.exclude.return_value.values.return_value = (
                events
            )
            wrapper._get_all_defense_events()

    def test_defense_events_config_branches(self):
        wrapper = _wrapper(
            league_season_config=None, _gameinfo=pd.DataFrame([{"id": 1}])
        )
        with patch("gamedays.service.model_wrapper.TeamLog.objects") as objects:
            objects.filter.return_value.exclude.return_value.exclude.return_value.values.return_value = [
                {
                    "team__description": "A",
                    "team_id": 1,
                    "team__name": "A",
                    "event": "Interception",
                    "player": 7,
                }
            ]
            result = wrapper._get_all_defense_events()
            assert list(result) == ["Interception"]

        class Config:
            def get_gameday_statistic_settings(self):
                return {"show_player_names": False}

        wrapper.league_season_config = Config()
        with patch("gamedays.service.model_wrapper.TeamLog.objects") as objects:
            objects.filter.return_value.exclude.return_value.exclude.return_value.values.return_value = [
                {
                    "team__description": "A",
                    "team_id": 1,
                    "team__name": "A",
                    "event": "Interception",
                    "player": 7,
                }
            ]
            wrapper._get_all_defense_events()

    def test_player_events_table_branches(self):
        wrapper = _wrapper(
            league_season_config=None, _gameinfo=pd.DataFrame([{"id": 1}])
        )
        with patch("gamedays.service.model_wrapper.TeamLog.objects") as objects:
            objects.filter.return_value.exclude.return_value.exclude.return_value.values.return_value = (
                []
            )
            assert wrapper._get_player_events_table("X", "xs").empty

        event = {
            "team__description": "A",
            "team__name": "A",
            "team_id": 1,
            "event": "X",
            "player": 7,
        }
        with patch("gamedays.service.model_wrapper.TeamLog.objects") as objects:
            objects.filter.return_value.exclude.return_value.exclude.return_value.values.return_value = [
                event
            ]
            jersey_only = wrapper._get_player_events_table("X", "xs")
        assert list(jersey_only["Spieler"]) == ["A #7"]

        class Config:
            def get_gameday_statistic_settings(self):
                return {"show_player_names": True}

        names = pd.DataFrame(
            [
                {
                    "gameday_id": 1,
                    "gameday_jersey": 7,
                    "team_id": 1,
                    "first_name": "First",
                    "last_name": "Last",
                }
            ]
        )
        wrapper.league_season_config = Config()
        with (
            patch("gamedays.service.model_wrapper.TeamLog.objects") as objects,
            patch.object(
                GamedayModelWrapper,
                "_get_passcheck_player_jersey_number",
                return_value=names,
            ),
        ):
            objects.filter.return_value.exclude.return_value.exclude.return_value.values.return_value = [
                event
            ]
            named = wrapper._get_player_events_table("X", "xs")
        assert list(named["Spieler"]) == ["A #7 - First Last"]
        with (
            patch("gamedays.service.model_wrapper.TeamLog.objects") as objects,
            patch.object(
                GamedayModelWrapper,
                "_get_passcheck_player_jersey_number",
                return_value=names,
            ),
        ):
            objects.filter.return_value.exclude.return_value.exclude.return_value.values.return_value = [
                event
            ]
            names.loc[0, "first_name"] = None
            unknown = wrapper._get_player_events_table("X", "xs")
        assert list(unknown["Spieler"]) == ["A #7 Unbekannt"]


class StatisticsWrapperCharacterization(TestCase):
    def setUp(self):
        DBSetup().g62_qualify_finished()

    def test_no_config_and_no_player_names(self):
        with patch(
            "gamedays.service.league_table_hooks.season_config", return_value=None
        ):
            with (
                patch.object(LeagueStatisticsModelWrapper, "_get_gameday_ids"),
                patch.object(LeagueStatisticsModelWrapper, "_aggregate_player_events"),
                patch.object(LeagueStatisticsModelWrapper, "_aggregate_team_events"),
                patch(
                    "gamedays.service.model_statistics_wrapper.TeamLog.objects"
                ) as logs,
            ):
                logs.filter.return_value.exclude.return_value.exclude.return_value.exclude.return_value.values.return_value = [
                    {
                        "team__name": "A",
                        "player": 7,
                        "team_id": 1,
                        "gameinfo__gameday_id": 1,
                    }
                ]
                wrapper = LeagueStatisticsModelWrapper("S", "L")
                assert wrapper.league_season_config is None

    def test_statistics_config_and_name_branches(self):
        for show_names in (False, True):
            self._statistics_branch(show_names)

    def _statistics_branch(self, show_names):
        class Config:
            def get_season_statistic_settings(self):
                return {"show_player_names": show_names}

        log = {
            "team__name": "A",
            "player": 7,
            "team_id": 1,
            "gameinfo__gameday_id": 1,
        }
        names = pd.DataFrame(
            [
                {
                    "gameday_id": 1,
                    "gameday_jersey": 7,
                    "team_id": 1,
                    "first_name": "First",
                    "last_name": "Last",
                }
            ]
        )
        with (
            patch(
                "gamedays.service.league_table_hooks.season_config",
                return_value=Config(),
            ),
            patch.object(LeagueStatisticsModelWrapper, "_get_gameday_ids"),
            patch.object(LeagueStatisticsModelWrapper, "_aggregate_player_events"),
            patch.object(LeagueStatisticsModelWrapper, "_aggregate_team_events"),
            patch.object(
                LeagueStatisticsModelWrapper,
                "_get_season_passcheck_player_jersey_number",
                return_value=names,
            ),
            patch("gamedays.service.model_statistics_wrapper.TeamLog.objects") as logs,
        ):
            logs.filter.return_value.exclude.return_value.exclude.return_value.exclude.return_value.values.return_value = [
                log
            ]
            wrapper = LeagueStatisticsModelWrapper("S", "L")
            assert wrapper.league_season_config is not None
