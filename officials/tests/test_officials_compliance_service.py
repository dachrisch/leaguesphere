from datetime import date, timedelta

from django.test import TestCase

from gamedays.tests.setup_factories.factories import (
    GamedayFactory,
    GameinfoFactory,
    GameOfficialFactory,
    TeamFactory,
)
from league_table.tests.setup_factories.factories_leaguetable import (
    LeagueSeasonConfigFactory,
)
from officials.service.officials_compliance_service import (
    REASON_DISABLED,
    REASON_EXCLUDED,
    REASON_NO_CONFIG,
    REASON_NOT_FOUND,
    compute_gameday_officials_compliance,
)
from officials.tests.setup_factories.factories_officials import (
    OfficialFactory,
    OfficialLicenseFactory,
    OfficialLicenseHistoryFactory,
)

GAMEDAY_DATE = date(2027, 5, 1)


def _license_official(gameinfo, level, on_date=GAMEDAY_DATE, position="Referee"):
    official = OfficialFactory(team=TeamFactory())
    OfficialLicenseHistoryFactory(
        official=official,
        license=OfficialLicenseFactory(name=level),
        created_at=on_date - timedelta(days=30),
    )
    GameOfficialFactory(gameinfo=gameinfo, official=official, position=position)
    return official


class TestGamedayComplianceStatusResolution(TestCase):
    def test_no_league_season_config_is_not_checked(self):
        gameday = GamedayFactory(date=GAMEDAY_DATE)

        result = compute_gameday_officials_compliance([gameday.pk])

        status = result[gameday.pk]
        assert status.is_checked is False
        assert status.reason_not_checked == REASON_NO_CONFIG
        assert status.violation_count == 0

    def test_check_disabled_is_not_checked(self):
        gameday = GamedayFactory(date=GAMEDAY_DATE)
        LeagueSeasonConfigFactory(
            league=gameday.league,
            season=gameday.season,
            check_officials_automatically=False,
        )

        status = compute_gameday_officials_compliance([gameday.pk])[gameday.pk]

        assert status.is_checked is False
        assert status.reason_not_checked == REASON_DISABLED

    def test_excluded_gameday_is_not_checked_even_when_enabled(self):
        gameday = GamedayFactory(date=GAMEDAY_DATE)
        config = LeagueSeasonConfigFactory(
            league=gameday.league,
            season=gameday.season,
            check_officials_automatically=True,
            min_officials_per_game=1,
        )
        config.exclude_gamedays.add(gameday)

        status = compute_gameday_officials_compliance([gameday.pk])[gameday.pk]

        assert status.is_checked is False
        assert status.reason_not_checked == REASON_EXCLUDED
        assert status.violation_count == 0

    def test_enabled_and_not_excluded_is_checked(self):
        gameday = GamedayFactory(date=GAMEDAY_DATE)
        LeagueSeasonConfigFactory(
            league=gameday.league,
            season=gameday.season,
            check_officials_automatically=True,
        )

        status = compute_gameday_officials_compliance([gameday.pk])[gameday.pk]

        assert status.is_checked is True
        assert status.reason_not_checked is None

    def test_gameday_id_not_found_in_db_still_gets_an_entry(self):
        # Regression: the function's own contract ("returns a dict mapping
        # every requested gameday_id to a GamedayComplianceStatus") must
        # hold even for an id that doesn't exist (e.g. deleted concurrently
        # with the call) - callers index the result dict directly with no
        # defensive .get()/try-except, so a silently-omitted key would
        # raise an unhandled KeyError.
        result = compute_gameday_officials_compliance([999999])

        assert 999999 in result
        status = result[999999]
        assert status.is_checked is False
        assert status.reason_not_checked == REASON_NOT_FOUND
        assert status.violation_count == 0


class TestGameOfficialsViolations(TestCase):
    def _config(self, gameday, **overrides):
        return LeagueSeasonConfigFactory(
            league=gameday.league,
            season=gameday.season,
            check_officials_automatically=True,
            **overrides,
        )

    def test_f1_official_satisfies_all_level_minimums_at_once(self):
        gameday = GamedayFactory(date=GAMEDAY_DATE)
        gameinfo = GameinfoFactory(gameday=gameday)
        self._config(
            gameday,
            min_officials_per_game=1,
            min_officials_f4_per_game=1,
            min_officials_f3_per_game=1,
            min_officials_f2_per_game=1,
            min_officials_f1_per_game=1,
        )
        _license_official(gameinfo, "F1")

        status = compute_gameday_officials_compliance([gameday.pk])[gameday.pk]

        assert status.game_violations[gameinfo.id] == []
        assert status.violation_count == 0

    def test_year_suffixed_license_name_is_still_recognized(self):
        # Regression: OfficialLicense.name is a free CharField and this
        # codebase's own established convention (see
        # matchreport/tests/test_model_wrapper.py) suffixes it with a year,
        # e.g. "F1 2027" - an exact-match filter against plain "F1".."F4"
        # would silently treat every such license as nonexistent.
        gameday = GamedayFactory(date=GAMEDAY_DATE)
        gameinfo = GameinfoFactory(gameday=gameday)
        self._config(gameday, min_officials_f1_per_game=1)
        _license_official(gameinfo, "F1 2027")

        status = compute_gameday_officials_compliance([gameday.pk])[gameday.pk]

        assert status.game_violations[gameinfo.id] == []

    def test_unrecognized_license_name_placeholder_never_counts(self):
        # Real data includes a "-" placeholder license (no license held) -
        # it must never resolve to a rank.
        gameday = GamedayFactory(date=GAMEDAY_DATE)
        gameinfo = GameinfoFactory(gameday=gameday)
        self._config(gameday, min_officials_per_game=1)
        _license_official(gameinfo, "-")

        status = compute_gameday_officials_compliance([gameday.pk])[gameday.pk]

        assert len(status.game_violations[gameinfo.id]) == 1

    def test_f1_official_does_not_satisfy_a_minimum_of_two(self):
        gameday = GamedayFactory(date=GAMEDAY_DATE)
        gameinfo = GameinfoFactory(gameday=gameday)
        self._config(gameday, min_officials_f2_per_game=2)
        _license_official(gameinfo, "F1")

        status = compute_gameday_officials_compliance([gameday.pk])[gameday.pk]

        violations = status.game_violations[gameinfo.id]
        assert len(violations) == 1
        assert "F2" in violations[0]
        assert "1 von 2" in violations[0]

    def test_f1_official_does_not_satisfy_an_f3_minimum_of_two(self):
        gameday = GamedayFactory(date=GAMEDAY_DATE)
        gameinfo = GameinfoFactory(gameday=gameday)
        self._config(gameday, min_officials_f3_per_game=2)
        _license_official(gameinfo, "F1")

        status = compute_gameday_officials_compliance([gameday.pk])[gameday.pk]

        violations = status.game_violations[gameinfo.id]
        assert len(violations) == 1
        assert "F3" in violations[0]
        assert "1 von 2" in violations[0]

    def test_f2_official_does_not_satisfy_an_f1_minimum(self):
        # The cascade only goes one direction: F1 satisfies F2/F3/F4
        # minimums, but F2 does not satisfy the (stricter) F1 minimum.
        gameday = GamedayFactory(date=GAMEDAY_DATE)
        gameinfo = GameinfoFactory(gameday=gameday)
        self._config(gameday, min_officials_f1_per_game=1)
        _license_official(gameinfo, "F2")

        status = compute_gameday_officials_compliance([gameday.pk])[gameday.pk]

        violations = status.game_violations[gameinfo.id]
        assert len(violations) == 1
        assert "F1" in violations[0]
        assert "0 von 1" in violations[0]

    def test_total_and_f4_minimum_are_checked_independently(self):
        gameday = GamedayFactory(date=GAMEDAY_DATE)
        gameinfo = GameinfoFactory(gameday=gameday)
        self._config(gameday, min_officials_per_game=3, min_officials_f4_per_game=2)
        _license_official(gameinfo, "F4")

        status = compute_gameday_officials_compliance([gameday.pk])[gameday.pk]

        violations = status.game_violations[gameinfo.id]
        assert len(violations) == 2
        assert any("1 von 3" in v for v in violations)
        assert any("1 von 2" in v for v in violations)

    def test_expired_license_does_not_count(self):
        gameday = GamedayFactory(date=GAMEDAY_DATE)
        gameinfo = GameinfoFactory(gameday=gameday)
        self._config(gameday, min_officials_per_game=1)
        _license_official(gameinfo, "F1", on_date=GAMEDAY_DATE - timedelta(days=400))

        status = compute_gameday_officials_compliance([gameday.pk])[gameday.pk]

        assert len(status.game_violations[gameinfo.id]) == 1

    def test_free_text_official_without_official_fk_never_counts(self):
        gameday = GamedayFactory(date=GAMEDAY_DATE)
        gameinfo = GameinfoFactory(gameday=gameday)
        self._config(gameday, min_officials_per_game=1)
        GameOfficialFactory(gameinfo=gameinfo, official=None, position="Referee")

        status = compute_gameday_officials_compliance([gameday.pk])[gameday.pk]

        assert len(status.game_violations[gameinfo.id]) == 1

    def test_game_with_no_officials_at_all_is_a_violation(self):
        gameday = GamedayFactory(date=GAMEDAY_DATE)
        gameinfo = GameinfoFactory(gameday=gameday)
        self._config(gameday, min_officials_per_game=1)

        status = compute_gameday_officials_compliance([gameday.pk])[gameday.pk]

        assert gameinfo.id in status.game_violations
        assert len(status.game_violations[gameinfo.id]) == 1

    def test_official_with_two_concurrent_licenses_counts_at_the_better_rank(self):
        # An official who holds both an F1 and an F2 license, both currently
        # valid as of the gameday, must count toward the F1 minimum too -
        # the best (lowest) rank always wins, never just the F2-or-better
        # bucket.
        gameday = GamedayFactory(date=GAMEDAY_DATE)
        gameinfo = GameinfoFactory(gameday=gameday)
        self._config(gameday, min_officials_f1_per_game=1)
        official = OfficialFactory(team=TeamFactory())
        OfficialLicenseHistoryFactory(
            official=official,
            license=OfficialLicenseFactory(name="F1"),
            created_at=GAMEDAY_DATE - timedelta(days=100),
        )
        OfficialLicenseHistoryFactory(
            official=official,
            license=OfficialLicenseFactory(name="F2"),
            created_at=GAMEDAY_DATE - timedelta(days=10),
        )
        GameOfficialFactory(gameinfo=gameinfo, official=official, position="Referee")

        status = compute_gameday_officials_compliance([gameday.pk])[gameday.pk]

        assert status.game_violations[gameinfo.id] == []

    def test_license_obtained_after_the_gameday_does_not_count(self):
        # A license earned after the gameday it is being checked against
        # must not retroactively count - only licenses valid as of that
        # gameday's own date matter.
        gameday = GamedayFactory(date=GAMEDAY_DATE)
        gameinfo = GameinfoFactory(gameday=gameday)
        self._config(gameday, min_officials_per_game=1)
        official = OfficialFactory(team=TeamFactory())
        OfficialLicenseHistoryFactory(
            official=official,
            license=OfficialLicenseFactory(name="F1"),
            created_at=GAMEDAY_DATE + timedelta(days=30),
        )
        GameOfficialFactory(gameinfo=gameinfo, official=official, position="Referee")

        status = compute_gameday_officials_compliance([gameday.pk])[gameday.pk]

        assert len(status.game_violations[gameinfo.id]) == 1


class TestComplianceQueryCount(TestCase):
    def test_query_count_is_constant_regardless_of_number_of_gamedays(self):
        gameday_one = GamedayFactory(date=GAMEDAY_DATE)
        gameinfo_one = GameinfoFactory(gameday=gameday_one)
        LeagueSeasonConfigFactory(
            league=gameday_one.league,
            season=gameday_one.season,
            check_officials_automatically=True,
            min_officials_per_game=2,
        )
        _license_official(gameinfo_one, "F1")

        with self.assertNumQueries(6):
            compute_gameday_officials_compliance([gameday_one.pk])

        gameday_two = GamedayFactory(
            date=GAMEDAY_DATE, league=gameday_one.league, season=gameday_one.season
        )
        gameinfo_two = GameinfoFactory(gameday=gameday_two)
        _license_official(gameinfo_two, "F2")
        _license_official(gameinfo_two, "F3")

        with self.assertNumQueries(6):
            compute_gameday_officials_compliance([gameday_one.pk, gameday_two.pk])
