"""API-context characterization before the hook inversion (Phase 1, #2537)."""

from __future__ import annotations

from datetime import date, timedelta

from django.urls import reverse
from django_webtest import WebTest

from gamedays.constants import API_GAME_OFFICIALS
from gamedays.models import Gameinfo
from gamedays.tests.setup_factories.db_setup import DBSetup
from officials.tests.setup_factories.factories_officials import (
    OfficialFactory,
    OfficialLicenseFactory,
    OfficialLicenseHistoryFactory,
)


class ApiContextCharacterization(WebTest):
    def test_license_merge_is_one_bulk_query(self):
        DBSetup().g62_status_empty()
        game = Gameinfo.objects.last()
        from gamedays.tests.setup_factories.factories import TeamFactory

        official = OfficialFactory(team=TeamFactory())
        created_at = date.today() - timedelta(days=30)
        OfficialLicenseHistoryFactory(
            official=official,
            license=OfficialLicenseFactory(name="F1"),
            created_at=created_at,
        )
        DBSetup().create_game_officials(game, official=official)
        second = OfficialFactory(team=TeamFactory())
        OfficialLicenseHistoryFactory(
            official=second,
            license=OfficialLicenseFactory(name="F2"),
            created_at=created_at,
        )
        DBSetup().create_game_officials(game, official=second)

        # The connection check and SiteConfiguration lookup are cached in the
        # process after the first request. Warm them so the measured count does
        # not depend on which test ran first.
        url = reverse(API_GAME_OFFICIALS, kwargs={"pk": game.pk})
        self.app.get(url)
        # Two officials must cost one crew query and one bulk licence join,
        # never one licence query per official.
        with self.assertNumQueries(2) as queries:
            response = self.app.get(url)
        assert response.status_code == 200
        assert {row["license"] for row in response.json} == {"F1", "F2"}
        licence_queries = [
            query
            for query in queries.captured_queries
            if "officials_officiallicensehistory" in query["sql"]
        ]
        assert len(licence_queries) == 1
