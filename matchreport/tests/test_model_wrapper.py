from datetime import date

from django.test import TestCase

from gamedays.tests.setup_factories.factories import (
    GamedayFactory,
    GameinfoFactory,
    GameOfficialFactory,
    TeamFactory,
)
from matchreport.service.model_wrapper import MachtreportModelWrapper
from officials.tests.setup_factories.factories_officials import (
    OfficialFactory,
    OfficialLicenseFactory,
    OfficialLicenseHistoryFactory,
)


class TestMatchreportOfficialsLicense(TestCase):
    def test_official_license_reflects_gameday_year_not_latest_ever(self):
        gameday = GamedayFactory(date=date(2022, 5, 1))
        gameinfo = GameinfoFactory(
            gameday=gameday, stage="Hauptrunde", standing="Gruppe 1"
        )

        official = OfficialFactory(team=TeamFactory())
        license_from_gameday_year = OfficialLicenseFactory(name="F2 2022")
        license_from_later_year = OfficialLicenseFactory(name="F4 2024")

        OfficialLicenseHistoryFactory(
            official=official,
            license=license_from_gameday_year,
            created_at=date(2022, 3, 1),
        )
        OfficialLicenseHistoryFactory(
            official=official,
            license=license_from_later_year,
            created_at=date(2024, 3, 1),
        )

        GameOfficialFactory(gameinfo=gameinfo, official=official, position="Referee")

        wrapper = MachtreportModelWrapper(gameday.pk)
        officials_table = wrapper._get_game_officials_table(gameinfo.id)

        self.assertEqual(officials_table["Lizenz"].iloc[0], "F2 2022")
