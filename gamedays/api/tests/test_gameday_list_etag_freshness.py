from django.contrib.auth.models import User
from django.core.cache import cache
from django.test.utils import CaptureQueriesContext
from django.db import connection
from rest_framework import status
from rest_framework.test import APITestCase

from gamedays.models import Gameday
from gamedays.tests.setup_factories.factories import GamedayFactory


class GamedayListEtagFreshnessTest(APITestCase):
    """Publishing (or otherwise mutating) an existing gameday must change the
    list endpoint's ETag. Otherwise a client that already cached the list
    response revalidates with the stale ETag, gets a 304, and keeps showing
    outdated data (e.g. a just-published gameday still rendered as Draft).
    """

    def setUp(self):
        self.user = User.objects.create_superuser(username="admin", password="pw")
        self.client.force_authenticate(user=self.user)

    def test_list_etag_changes_when_existing_gameday_status_changes(self):
        gameday = GamedayFactory(status=Gameday.STATUS_DRAFT)

        first = self.client.get("/api/gamedays/")
        assert first.status_code == status.HTTP_200_OK
        etag_before = first["ETag"]

        gameday.status = Gameday.STATUS_PUBLISHED
        gameday.save()

        # Simulate a browser revalidating with the ETag it cached before the publish.
        revalidated = self.client.get("/api/gamedays/", HTTP_IF_NONE_MATCH=etag_before)

        assert revalidated.status_code == status.HTTP_200_OK, (
            "server returned 304 Not Modified for a gameday whose status just "
            "changed -- the client will keep rendering the stale cached body"
        )
        published = next(
            g for g in revalidated.data["results"] if g["id"] == gameday.id
        )
        assert published["status"] == Gameday.STATUS_PUBLISHED

    def test_list_etag_changes_after_designer_state_partial_save(self):
        """The designer-state PUT handler saves the Gameday with a narrow
        update_fields=[...] list (only the metadata fields that changed). That
        partial save must still bump updated_at, or edits made from the designer
        would be invisible to the list ETag just like the publish case above.
        """
        gameday = GamedayFactory(name="Original Name")

        first = self.client.get("/api/gamedays/")
        etag_before = first["ETag"]

        url = f"/api/gamedays/{gameday.id}/designer-state/"
        payload = {"state_data": {"metadata": {"name": "Renamed via Designer"}}}
        put_response = self.client.put(url, payload, format="json")
        assert put_response.status_code == status.HTTP_200_OK

        revalidated = self.client.get("/api/gamedays/", HTTP_IF_NONE_MATCH=etag_before)

        assert revalidated.status_code == status.HTTP_200_OK, (
            "server returned 304 Not Modified for a gameday renamed via the "
            "designer's partial-save path"
        )
        renamed = next(
            g for g in revalidated.data["results"] if g["id"] == gameday.id
        )
        assert renamed["name"] == "Renamed via Designer"


class GamedayListPayloadCacheTest(APITestCase):
    """The @condition decorator's 304 already skips list() for a *returning*
    client that sends a matching If-None-Match - but a request with no
    If-None-Match at all (a fresh client, or any non-browser caller) still
    recomputes from scratch. list() now caches that computed payload
    server-side (league_manager.utils.etag_cache) so concurrent/repeat
    callers with no conditional header share one computation instead of one
    each.
    """

    def setUp(self):
        self.user = User.objects.create_superuser(username="admin", password="pw")
        self.client.force_authenticate(user=self.user)
        # See league_table/api/tests/test_league_table_api.py's
        # LeagueTableApiTestBase.setUp() for why this matters under sqlite.
        cache.clear()
        self.addCleanup(cache.clear)

    def test_second_request_with_no_conditional_header_is_cheaper(self):
        GamedayFactory(status=Gameday.STATUS_DRAFT)

        with CaptureQueriesContext(connection) as first_queries:
            first = self.client.get("/api/gamedays/")
        with CaptureQueriesContext(connection) as second_queries:
            second = self.client.get("/api/gamedays/")

        assert first.status_code == status.HTTP_200_OK
        assert second.status_code == status.HTTP_200_OK
        assert second.data == first.data
        # The second request must not re-run the gameday list/count queries
        # that computing the payload from scratch requires - only the etag
        # aggregate query(ies) should run.
        assert len(second_queries) < len(first_queries)

    def test_payload_reflects_a_status_change_once_the_etag_changes(self):
        gameday = GamedayFactory(status=Gameday.STATUS_DRAFT)
        self.client.get("/api/gamedays/")

        gameday.status = Gameday.STATUS_PUBLISHED
        gameday.save()
        response = self.client.get("/api/gamedays/")

        updated = next(g for g in response.data["results"] if g["id"] == gameday.id)
        assert updated["status"] == Gameday.STATUS_PUBLISHED
