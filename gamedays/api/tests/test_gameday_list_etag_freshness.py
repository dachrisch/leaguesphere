from django.contrib.auth.models import User
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
