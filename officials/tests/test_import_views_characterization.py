"""Characterization of the officials import cluster before its extraction.

Pins helper branches, view status/payloads and exact query counts for every
function about to move into ``officials/import_views.py``.
"""

from datetime import date
from types import SimpleNamespace

from django.core.files.uploadedfile import SimpleUploadedFile
from django.db import Error as DatabaseError
from django.test import RequestFactory, TestCase
from django.urls import reverse

from gamedays.models import Gameinfo
from officials.models import Official, OfficialExternalGames
from officials.service.association_resolution import UnknownAssociationError
from gamedays.tests.setup_factories.factories import TeamFactory, UserFactory
from gamedays.tests.setup_factories.request_caches import pin_request_path_caches
from officials.tests.setup_factories.db_setup_officials import DbSetupOfficials
from officials.tests.setup_factories.factories_officials import OfficialFactory
from officials.tests.test_views import _external_import_row, _import_csv_bytes
from officials.urls import (
    OFFICIALS_GAMEOFFICIAL_IMPORT_CONFIRM,
    OFFICIALS_GAMEOFFICIAL_IMPORT_UPLOAD,
)
from officials.views import (
    _entry_error_message,
    _external_row_data,
    _external_suggestion_to_initial,
    _group_by_status,
    _internal_fix_suggestion_to_initial,
    _internal_row_data,
    _parse_iso_date,
    _selected_ids,
)


class ImportHelperCharacterization(TestCase):
    def test_entry_error_messages_cover_all_exceptions(self):
        assert (
            _entry_error_message(Gameinfo.DoesNotExist())
            == "gameinfo_id nicht gefunden!"
        )
        assert (
            _entry_error_message(Official.DoesNotExist())
            == "official_id nicht gefunden!"
        )
        assert (
            _entry_error_message(DatabaseError())
            == "Datenbankfehler - Zeile vermutlich zu lang für ein Feld"
        )
        # Checked before the generic ValueError branch it subclasses; the
        # manual AddExternalGameOfficialUpdateView reaches it via the
        # officials.views re-export.
        assert (
            _entry_error_message(UnknownAssociationError("Atlantis"))
            == "Unbekannter Verband - Zeile nicht importiert"
        )
        assert _entry_error_message(ValueError("bad row")) == "bad row"
        assert _entry_error_message(RuntimeError()) == ""

    def test_status_grouping_covers_all_buckets_and_unknown(self):
        items = [
            {"status": "ready", "row_number": 1},
            {"status": "duplicate", "row_number": 2},
            {"status": "needs_attention", "row_number": 3},
            {"status": "new", "row_number": 4},
            {},
        ]
        assert _group_by_status(items) == {
            "new": [{"row_number": 1}],
            "duplicate": [{"row_number": 2}],
            "conflict": [{"row_number": 3}, {"row_number": 4}, {}],
        }

    def test_iso_dates_and_selected_ids(self):
        assert _parse_iso_date("2026-11-26") == date(2026, 11, 26)
        assert _parse_iso_date(None) is None
        request = RequestFactory().post("/", {"external_rows": "1,2, x, ,3"})
        assert _selected_ids(request, "external_rows") == {1, 2, 3}
        assert _selected_ids(request, "missing") == set()

    def test_suggestion_converters_and_row_data(self):
        external = SimpleNamespace(
            row_number=7,
            status="ready",
            reason="",
            include_default=True,
            official_id=1,
            official_display="Ref",
            number_games=3,
            date=date(2026, 11, 26),
            position="Referee",
            association="A",
            halftime_duration=10,
            has_clockcontrol=True,
            is_international=False,
            reporter_name="R",
            notification_date=None,
            comment="",
        )
        initial = _external_suggestion_to_initial(external)
        assert initial["date"] == "2026-11-26"
        assert initial["notification_date"] is None
        assert _external_row_data(initial)["date"] == date(2026, 11, 26)
        assert _external_row_data(initial)["reporter_name"] == "R"

        internal = SimpleNamespace(
            row_number=8,
            status="needs_attention",
            reason="stale",
            action="fix",
            current_official_display="Old",
            include_default=False,
            gameinfo_id=5,
            official_id=2,
            official_display="New",
            position="Down Judge",
        )
        internal_initial = _internal_fix_suggestion_to_initial(internal)
        assert internal_initial["action"] == "fix"
        assert _internal_row_data(internal_initial) == {
            "gameinfo_id": 5,
            "official_id": 2,
            "position": "Down Judge",
        }


class ImportViewCharacterization(TestCase):
    def setUp(self):
        pin_request_path_caches()
        self.user = UserFactory(username="import_staff", is_staff=True)
        self.client.force_login(self.user)

    def test_upload_get(self):
        url = reverse(OFFICIALS_GAMEOFFICIAL_IMPORT_UPLOAD)
        with self.assertNumQueries(3):
            response = self.client.get(url)
        assert response.status_code == 200

    def test_upload_post_invalid_form_is_400(self):
        url = reverse(OFFICIALS_GAMEOFFICIAL_IMPORT_UPLOAD)
        with self.assertNumQueries(2):
            response = self.client.post(url, {})
        assert response.status_code == 400
        assert "file" in response.json()["errors"]

    def test_confirm_get_redirects_to_upload(self):
        url = reverse(OFFICIALS_GAMEOFFICIAL_IMPORT_CONFIRM)
        with self.assertNumQueries(2):
            response = self.client.get(url)
        assert response.status_code == 302
        assert response.url == reverse(OFFICIALS_GAMEOFFICIAL_IMPORT_UPLOAD)

    def test_non_staff_is_forbidden(self):
        self.client.force_login(UserFactory(username="import_plain", is_staff=False))
        for name in (
            OFFICIALS_GAMEOFFICIAL_IMPORT_UPLOAD,
            OFFICIALS_GAMEOFFICIAL_IMPORT_CONFIRM,
        ):
            response = self.client.get(reverse(name))
            assert response.status_code == 403


class ImportPostQueryCountCharacterization(TestCase):
    """Exact query counts for the successful upload POST and the confirm
    POST (redirect and AJAX), on top of the behaviour test_views.py pins."""

    def setUp(self):
        pin_request_path_caches()
        DbSetupOfficials.create_production_associations()
        self.client.force_login(
            UserFactory(username="import_count_staff", is_staff=True)
        )
        team = TeamFactory(name="Count Team")
        self.official = OfficialFactory(
            first_name="Franzi", last_name="Fedora", team=team
        )

    def _upload(self):
        rows = [
            _external_import_row(
                self.official.pk, 1, "01.05.2024", "Referee", "Hamburg", 20
            )
        ]
        upload = SimpleUploadedFile(
            "import.csv", _import_csv_bytes(rows), content_type="text/csv"
        )
        return self.client.post(
            reverse(OFFICIALS_GAMEOFFICIAL_IMPORT_UPLOAD), {"file": upload}
        )

    def _new_external_rows(self):
        data = self._upload().json()
        return ",".join(str(row["row_number"]) for row in data["external"]["new"])

    def test_upload_post_success(self):
        with self.assertNumQueries(6):
            response = self._upload()
        assert response.status_code == 200
        assert len(response.json()["external"]["new"]) == 1

    def test_confirm_post_redirects_after_commit(self):
        rows = self._new_external_rows()
        with self.assertNumQueries(8):
            response = self.client.post(
                reverse(OFFICIALS_GAMEOFFICIAL_IMPORT_CONFIRM),
                {"external_rows": rows},
            )
        assert response.status_code == 302
        assert response.url == reverse(OFFICIALS_GAMEOFFICIAL_IMPORT_UPLOAD)
        assert OfficialExternalGames.objects.filter(official=self.official).count() == 1

    def test_confirm_post_ajax_reports_created_rows(self):
        rows = self._new_external_rows()
        with self.assertNumQueries(8):
            response = self.client.post(
                reverse(OFFICIALS_GAMEOFFICIAL_IMPORT_CONFIRM),
                {"external_rows": rows},
                HTTP_X_REQUESTED_WITH="XMLHttpRequest",
            )
        assert response.status_code == 200
        assert response.json()["summary"]["external_created"] == 1
        assert response.json()["summary"]["error_count"] == 0
