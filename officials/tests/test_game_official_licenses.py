from datetime import date, timedelta

from django.test import TestCase

from gamedays.tests.setup_factories.factories import (
    GamedayFactory,
    GameinfoFactory,
    GameOfficialFactory,
    TeamFactory,
)
from officials.service.game_official_licenses import (
    POSITION_DOWN_JUDGE,
    POSITION_FIELD_JUDGE,
    POSITION_REFEREE,
    POSITION_SIDE_JUDGE,
    resolve_current_licenses,
    resolve_game_official_licenses,
)
from officials.tests.setup_factories.factories_officials import (
    OfficialFactory,
    OfficialLicenseFactory,
    OfficialLicenseHistoryFactory,
)

GAMEDAY_DATE = date(2027, 5, 1)


def _official_with_license(level, on_date=GAMEDAY_DATE):
    official = OfficialFactory(team=TeamFactory())
    OfficialLicenseHistoryFactory(
        official=official,
        license=OfficialLicenseFactory(name=level),
        created_at=on_date - timedelta(days=30),
    )
    return official


class TestResolveGameOfficialLicenses(TestCase):
    def test_resolves_the_license_for_each_tracked_position(self):
        gameday = GamedayFactory(date=GAMEDAY_DATE)
        gameinfo = GameinfoFactory(gameday=gameday)

        referee = _official_with_license("F1")
        down_judge = _official_with_license("F2")
        field_judge = _official_with_license("F3")
        side_judge = _official_with_license("F4")

        GameOfficialFactory(
            gameinfo=gameinfo, official=referee, position=POSITION_REFEREE
        )
        GameOfficialFactory(
            gameinfo=gameinfo, official=down_judge, position=POSITION_DOWN_JUDGE
        )
        GameOfficialFactory(
            gameinfo=gameinfo, official=field_judge, position=POSITION_FIELD_JUDGE
        )
        GameOfficialFactory(
            gameinfo=gameinfo, official=side_judge, position=POSITION_SIDE_JUDGE
        )

        result = resolve_game_official_licenses([gameinfo.id])

        assert result[gameinfo.id] == {
            POSITION_REFEREE: "F1",
            POSITION_DOWN_JUDGE: "F2",
            POSITION_FIELD_JUDGE: "F3",
            POSITION_SIDE_JUDGE: "F4",
        }

    def test_scorecard_judge_position_is_not_tracked(self):
        gameday = GamedayFactory(date=GAMEDAY_DATE)
        gameinfo = GameinfoFactory(gameday=gameday)
        official = _official_with_license("F1")
        GameOfficialFactory(
            gameinfo=gameinfo, official=official, position="Scorecard Judge"
        )

        result = resolve_game_official_licenses([gameinfo.id])

        assert result[gameinfo.id] == {}

    def test_position_with_no_valid_license_maps_to_none(self):
        gameday = GamedayFactory(date=GAMEDAY_DATE)
        gameinfo = GameinfoFactory(gameday=gameday)
        official = OfficialFactory(team=TeamFactory())
        GameOfficialFactory(
            gameinfo=gameinfo, official=official, position=POSITION_REFEREE
        )

        result = resolve_game_official_licenses([gameinfo.id])

        assert result[gameinfo.id][POSITION_REFEREE] is None

    def test_position_with_no_official_at_all_is_absent(self):
        gameday = GamedayFactory(date=GAMEDAY_DATE)
        gameinfo = GameinfoFactory(gameday=gameday)
        GameOfficialFactory(gameinfo=gameinfo, official=None, position=POSITION_REFEREE)

        result = resolve_game_official_licenses([gameinfo.id])

        assert POSITION_REFEREE not in result[gameinfo.id]

    def test_respects_the_games_own_gameday_date(self):
        gameday = GamedayFactory(date=GAMEDAY_DATE)
        gameinfo = GameinfoFactory(gameday=gameday)
        official = _official_with_license(
            "F1", on_date=GAMEDAY_DATE - timedelta(days=400)
        )
        GameOfficialFactory(
            gameinfo=gameinfo, official=official, position=POSITION_REFEREE
        )

        result = resolve_game_official_licenses([gameinfo.id])

        assert result[gameinfo.id][POSITION_REFEREE] is None

    def test_query_count_is_constant_regardless_of_number_of_games(self):
        gameday = GamedayFactory(date=GAMEDAY_DATE)
        gameinfo_one = GameinfoFactory(gameday=gameday)
        official = _official_with_license("F1")
        GameOfficialFactory(
            gameinfo=gameinfo_one, official=official, position=POSITION_REFEREE
        )

        with self.assertNumQueries(3):
            resolve_game_official_licenses([gameinfo_one.id])

        gameinfo_two = GameinfoFactory(gameday=gameday)
        other_official = _official_with_license("F2")
        GameOfficialFactory(
            gameinfo=gameinfo_two, official=other_official, position=POSITION_REFEREE
        )

        with self.assertNumQueries(3):
            resolve_game_official_licenses([gameinfo_one.id, gameinfo_two.id])


class TestResolveCurrentLicenses(TestCase):
    TODAY = date(2027, 5, 1)

    def _official(self, *history):
        official = OfficialFactory(team=TeamFactory())
        for name, created_at in history:
            OfficialLicenseHistoryFactory(
                official=official,
                license=OfficialLicenseFactory(name=name),
                created_at=created_at,
            )
        return official

    def test_valid_license_with_valid_until(self):
        created_at = self.TODAY - timedelta(days=30)
        official = self._official(("F2", created_at))
        result = resolve_current_licenses([official.id], on_date=self.TODAY)
        assert result[official.id] == {
            "license": "F2",
            "valid_until": created_at + timedelta(days=365),
            "is_valid": True,
        }

    def test_best_valid_rank_wins_and_year_suffix_is_normalized(self):
        official = self._official(
            ("F3", self.TODAY - timedelta(days=10)),
            ("F1 2027", self.TODAY - timedelta(days=20)),
        )
        result = resolve_current_licenses([official.id], on_date=self.TODAY)
        assert result[official.id]["license"] == "F1"
        assert result[official.id]["is_valid"] is True

    def test_expired_license_reports_level_and_expiry_date(self):
        created_at = self.TODAY - timedelta(days=400)
        official = self._official(("F1", created_at))
        result = resolve_current_licenses([official.id], on_date=self.TODAY)
        assert result[official.id] == {
            "license": "F1",
            "valid_until": created_at + timedelta(days=365),
            "is_valid": False,
        }

    def test_valid_license_beats_newer_expired_lookalike(self):
        official = self._official(
            ("F1", self.TODAY - timedelta(days=500)),
            ("F3", self.TODAY - timedelta(days=100)),
        )
        result = resolve_current_licenses([official.id], on_date=self.TODAY)
        assert result[official.id]["license"] == "F3"
        assert result[official.id]["is_valid"] is True

    def test_most_recent_expired_license_is_reported(self):
        newest = self.TODAY - timedelta(days=400)
        official = self._official(
            ("F1", self.TODAY - timedelta(days=900)), ("F4", newest)
        )
        result = resolve_current_licenses([official.id], on_date=self.TODAY)
        assert result[official.id]["license"] == "F4"
        assert result[official.id]["valid_until"] == newest + timedelta(days=365)

    def test_official_without_recognized_license(self):
        official = self._official(("-", self.TODAY - timedelta(days=10)))
        result = resolve_current_licenses([official.id], on_date=self.TODAY)
        assert result[official.id] == {
            "license": None,
            "valid_until": None,
            "is_valid": False,
        }

    def test_query_count_is_constant(self):
        officials = [
            self._official(("F2", self.TODAY - timedelta(days=i))) for i in range(5)
        ]
        with self.assertNumQueries(1):
            resolve_current_licenses([o.id for o in officials], on_date=self.TODAY)
