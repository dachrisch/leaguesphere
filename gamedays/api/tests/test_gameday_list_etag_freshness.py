from datetime import timedelta

from django.contrib.auth.models import User
from rest_framework import status
from rest_framework.test import APITestCase

from gamedays.models import Gameday, GamedayDesignerState
from gamedays.service.utils import get_effective_today
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
        renamed = next(g for g in revalidated.data["results"] if g["id"] == gameday.id)
        assert renamed["name"] == "Renamed via Designer"

    def test_scorecard_list_etag_changes_when_multi_day_gameday_is_published(self):
        """Publishing a multi-day designer gameday writes Gameinfo.day_offset
        rows that newly make the gameday visible on '/api/gameday/list/' (the
        scorecard endpoint) for a day after its own `date`. The list ETag
        (shared with '/api/gamedays/', hashing only Gameday.updated_at) must
        still reflect that -- it does, because `publish()` always saves the
        Gameday itself right before creating those Gameinfo rows.
        """
        today = get_effective_today()
        gameday = GamedayFactory(date=today - timedelta(days=1))
        GamedayDesignerState.objects.create(
            gameday=gameday,
            state_data={
                "nodes": [
                    {
                        "id": "field-1",
                        "type": "field",
                        "data": {"type": "field", "name": "Feld 1", "order": 0},
                    },
                    {
                        "id": "stage-1",
                        "type": "stage",
                        "parentId": "field-1",
                        "data": {
                            "type": "stage",
                            "name": "Liga",
                            "category": "preliminary",
                            "stageType": "STANDARD",
                        },
                    },
                    {
                        "id": "game-1",
                        "type": "game",
                        "parentId": "stage-1",
                        "data": {
                            "type": "game",
                            "standing": "Tabelle",
                            "startTime": "10:00",
                            "dayOffset": 1,
                            "homeTeamId": None,
                            "awayTeamId": None,
                            "official": None,
                        },
                    },
                ],
                "globalTeams": [],
            },
        )

        before = self.client.get("/api/gameday/list/")
        etag_before = before["ETag"]
        assert gameday.id not in [g["id"] for g in before.data]

        publish_response = self.client.post(f"/api/gamedays/{gameday.id}/publish/")
        assert publish_response.status_code == status.HTTP_200_OK

        after = self.client.get("/api/gameday/list/", HTTP_IF_NONE_MATCH=etag_before)
        assert after.status_code == status.HTTP_200_OK, (
            "server returned 304 Not Modified for a gameday that just became "
            "visible today via a published day_offset game"
        )
        assert gameday.id in [g["id"] for g in after.data]
