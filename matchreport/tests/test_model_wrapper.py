from datetime import date

from django.test import TestCase
from django.urls import reverse

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
from officials.urls import OFFICIALS_PROFILE_LICENSE


def _license_number_link(official_id, external_id):
    profile_url = reverse(OFFICIALS_PROFILE_LICENSE, kwargs={"pk": official_id})
    return (
        f'<a href="{profile_url}" target="_blank" title="Zum Profil des Offiziellen">'
        f"#{external_id}</a>"
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

        # "Lizenz" is plain text, unlinked - the F1-F4 level never gets a
        # hyperlink; only the separate "Lizenznummer" column does.
        self.assertEqual(officials_table["Lizenz"].iloc[0], "F2 2022")

    def test_official_license_hidden_when_not_renewed_in_gameday_year(self):
        gameday = GamedayFactory(date=date(2022, 5, 1))
        gameinfo = GameinfoFactory(
            gameday=gameday, stage="Hauptrunde", standing="Gruppe 1"
        )

        official = OfficialFactory(team=TeamFactory())
        older_license = OfficialLicenseFactory(name="F2 2019")

        OfficialLicenseHistoryFactory(
            official=official,
            license=older_license,
            created_at=date(2019, 3, 1),
        )

        GameOfficialFactory(gameinfo=gameinfo, official=official, position="Referee")

        wrapper = MachtreportModelWrapper(gameday.pk)
        officials_table = wrapper._get_game_officials_table(gameinfo.id)

        self.assertIsNone(officials_table["Lizenz"].iloc[0])

    def test_official_license_picks_highest_ranked_when_multiple_in_same_year(self):
        gameday = GamedayFactory(date=date(2027, 5, 1))
        gameinfo = GameinfoFactory(
            gameday=gameday, stage="Hauptrunde", standing="Gruppe 1"
        )

        official = OfficialFactory(team=TeamFactory())
        lower_license = OfficialLicenseFactory(name="F2 2027")
        higher_license = OfficialLicenseFactory(name="F1 2027")

        # The higher-ranked license (F1) was obtained first, the lower-ranked
        # one (F2) later in the same year - the higher rank must still win.
        OfficialLicenseHistoryFactory(
            official=official,
            license=higher_license,
            created_at=date(2027, 2, 1),
        )
        OfficialLicenseHistoryFactory(
            official=official,
            license=lower_license,
            created_at=date(2027, 6, 1),
        )

        GameOfficialFactory(gameinfo=gameinfo, official=official, position="Referee")

        wrapper = MachtreportModelWrapper(gameday.pk)
        officials_table = wrapper._get_game_officials_table(gameinfo.id)

        self.assertEqual(officials_table["Lizenz"].iloc[0], "F1 2027")

    def test_official_license_picks_highest_ranked_among_two_both_valid_now(self):
        # Both entries fall inside the one-year validity window as of the
        # gameday - unlike the previous test, the *older* entry is now the
        # higher-ranked one and the *newer* entry is lower-ranked. Sorting
        # by created_at (even as a tie-breaker priority) would wrongly pick
        # the newer, lower-ranked entry; only rank must decide.
        gameday = GamedayFactory(date=date(2027, 5, 1))
        gameinfo = GameinfoFactory(
            gameday=gameday, stage="Hauptrunde", standing="Gruppe 1"
        )

        official = OfficialFactory(team=TeamFactory())
        higher_license = OfficialLicenseFactory(name="F1 2027")
        lower_license = OfficialLicenseFactory(name="F2 2027")

        OfficialLicenseHistoryFactory(
            official=official,
            license=higher_license,
            created_at=date(2026, 7, 1),  # older, still valid, higher rank
        )
        OfficialLicenseHistoryFactory(
            official=official,
            license=lower_license,
            created_at=date(2027, 2, 1),  # newer, valid, lower rank
        )

        GameOfficialFactory(gameinfo=gameinfo, official=official, position="Referee")

        wrapper = MachtreportModelWrapper(gameday.pk)
        officials_table = wrapper._get_game_officials_table(gameinfo.id)

        self.assertEqual(officials_table["Lizenz"].iloc[0], "F1 2027")

    def test_official_license_link_uses_integer_pk_when_mixed_with_free_text_official(
        self,
    ):
        # Regression test: GameOfficial.official is nullable, so a game with
        # both a linked official and a free-text-only entry (official=None)
        # makes pandas upcast the whole official_id column to float64
        # (e.g. 121 -> 121.0). reverse()'s int converter rejects the
        # resulting "121.0" string, so the link must be built from a plain
        # int, not the raw (possibly float) pandas value.
        gameday = GamedayFactory(date=date(2027, 5, 1))
        gameinfo = GameinfoFactory(
            gameday=gameday, stage="Hauptrunde", standing="Gruppe 1"
        )

        official = OfficialFactory(team=TeamFactory(), external_id="9001")
        OfficialLicenseHistoryFactory(
            official=official,
            license=OfficialLicenseFactory(name="F1"),
            created_at=date(2027, 3, 1),
        )
        GameOfficialFactory(gameinfo=gameinfo, official=official, position="Referee")
        GameOfficialFactory(gameinfo=gameinfo, official=None, position="Down Judge")

        wrapper = MachtreportModelWrapper(gameday.pk)
        officials_table = wrapper._get_game_officials_table(gameinfo.id)

        licensed_row = officials_table[officials_table["Position"] == "Referee"].iloc[0]
        self.assertEqual(licensed_row["Lizenz"], "F1")
        self.assertEqual(
            licensed_row["Lizenznummer"],
            _license_number_link(official.pk, "9001"),
        )


class TestMatchreportOfficialsLicenseNumber(TestCase):
    def test_license_number_is_a_separate_column_hyperlinked_to_the_profile(self):
        gameday = GamedayFactory(date=date(2027, 5, 1))
        gameinfo = GameinfoFactory(
            gameday=gameday, stage="Hauptrunde", standing="Gruppe 1"
        )

        official = OfficialFactory(team=TeamFactory(), external_id="1234")
        OfficialLicenseHistoryFactory(
            official=official,
            license=OfficialLicenseFactory(name="F1"),
            created_at=date(2027, 3, 1),
        )
        GameOfficialFactory(gameinfo=gameinfo, official=official, position="Referee")

        wrapper = MachtreportModelWrapper(gameday.pk)
        officials_table = wrapper._get_game_officials_table(gameinfo.id)

        self.assertIn("Lizenznummer", officials_table.columns)
        self.assertEqual(officials_table["Lizenz"].iloc[0], "F1")
        self.assertEqual(
            officials_table["Lizenznummer"].iloc[0],
            _license_number_link(official.pk, "1234"),
        )
        # The F1-F4 level itself never carries a hyperlink.
        self.assertNotIn("<a ", officials_table["Lizenz"].iloc[0])

    def test_license_number_is_blank_when_official_has_none(self):
        gameday = GamedayFactory(date=date(2027, 5, 1))
        gameinfo = GameinfoFactory(
            gameday=gameday, stage="Hauptrunde", standing="Gruppe 1"
        )

        official = OfficialFactory(team=TeamFactory(), external_id=None)
        OfficialLicenseHistoryFactory(
            official=official,
            license=OfficialLicenseFactory(name="F1"),
            created_at=date(2027, 3, 1),
        )
        GameOfficialFactory(gameinfo=gameinfo, official=official, position="Referee")

        wrapper = MachtreportModelWrapper(gameday.pk)
        officials_table = wrapper._get_game_officials_table(gameinfo.id)

        self.assertEqual(officials_table["Lizenz"].iloc[0], "F1")
        self.assertIsNone(officials_table["Lizenznummer"].iloc[0])

    def test_license_number_still_shown_when_no_valid_current_license(self):
        # The license number column reflects the official's own record
        # (Official.external_id), independently of whether they currently
        # hold a valid F1-F4 license - an official with a license number but
        # an expired/absent license still shows a "Lizenznummer" link so
        # staff can click through to check/update their profile.
        gameday = GamedayFactory(date=date(2022, 5, 1))
        gameinfo = GameinfoFactory(
            gameday=gameday, stage="Hauptrunde", standing="Gruppe 1"
        )

        official = OfficialFactory(team=TeamFactory(), external_id="4242")
        OfficialLicenseHistoryFactory(
            official=official,
            license=OfficialLicenseFactory(name="F2 2019"),
            created_at=date(2019, 3, 1),  # long expired as of the gameday
        )
        GameOfficialFactory(gameinfo=gameinfo, official=official, position="Referee")

        wrapper = MachtreportModelWrapper(gameday.pk)
        officials_table = wrapper._get_game_officials_table(gameinfo.id)

        self.assertIsNone(officials_table["Lizenz"].iloc[0])
        self.assertEqual(
            officials_table["Lizenznummer"].iloc[0],
            _license_number_link(official.pk, "4242"),
        )

    def test_license_number_column_uses_integer_pk_when_mixed_with_free_text_official(
        self,
    ):
        # Same float-upcast hazard as the Lizenz column previously had:
        # GameOfficial.official is nullable, so a game mixing a linked
        # official with a free-text-only entry upcasts official_id to
        # float64 - the license number link must still resolve to an int pk.
        gameday = GamedayFactory(date=date(2027, 5, 1))
        gameinfo = GameinfoFactory(
            gameday=gameday, stage="Hauptrunde", standing="Gruppe 1"
        )

        official = OfficialFactory(team=TeamFactory(), external_id="777")
        GameOfficialFactory(gameinfo=gameinfo, official=official, position="Referee")
        GameOfficialFactory(gameinfo=gameinfo, official=None, position="Down Judge")

        wrapper = MachtreportModelWrapper(gameday.pk)
        officials_table = wrapper._get_game_officials_table(gameinfo.id)

        licensed_row = officials_table[officials_table["Position"] == "Referee"].iloc[0]
        self.assertEqual(
            licensed_row["Lizenznummer"],
            _license_number_link(official.pk, "777"),
        )
