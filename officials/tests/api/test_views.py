from http import HTTPStatus

from django.db import connection
from django.test.utils import CaptureQueriesContext
from django_webtest import WebTest
from rest_framework.reverse import reverse

from gamedays.models import Team
from gamedays.tests.setup_factories.db_setup import DBSetup
from officials.api.urls import API_OFFICIALS_FOR_TEAM, API_OFFICIALS_SEARCH_BY_NAME
from officials.models import Official
from officials.tests.setup_factories.db_setup_officials import DbSetupOfficials
from officials.tests.setup_factories.factories_officials import OfficialFactory


class TestOfficialsTeamListAPIView(WebTest):
    def test_get_officials_for_team(self):
        team: Team = DbSetupOfficials().create_officials_and_team()
        official: Official = Official.objects.first()
        response = self.app.get(
            reverse(API_OFFICIALS_FOR_TEAM, kwargs={"pk": team.pk}),
            headers=DBSetup().get_token_header(),
        )
        assert response.status_code == HTTPStatus.OK
        assert len(response.json) == 2
        actual_result = response.json[0]
        assert actual_result == {
            "team": official.team.description,
            "id": official.pk,
            "first_name": "Franzi",
            "last_name": "Fedora",
        }

    def test_get_empty_officials_for_non_existent_team(self):
        DbSetupOfficials().create_officials_and_team()
        Official.objects.first()
        response = self.app.get(
            reverse(API_OFFICIALS_FOR_TEAM, kwargs={"pk": 1999}),
            headers=DBSetup().get_token_header(),
        )
        assert response.status_code == HTTPStatus.OK
        assert len(response.json) == 0


class TestOfficialsSearchName(WebTest):
    def test_search_for_empty_name(self):
        DBSetup().create_new_user()
        response = self.app.get(
            reverse(API_OFFICIALS_SEARCH_BY_NAME, kwargs={"pk": 0}),
            expect_errors=True,
            headers=DBSetup().get_token_header(),
        )
        assert response.status_code == HTTPStatus.BAD_REQUEST

    def test_search_for_only_one_name_part(self):
        DBSetup().create_new_user()
        response = self.app.get(
            reverse(API_OFFICIALS_SEARCH_BY_NAME, kwargs={"pk": 0}),
            "name=onlyOnePartOfName",
            expect_errors=True,
            headers=DBSetup().get_token_header(),
        )
        assert response.status_code == HTTPStatus.BAD_REQUEST

    def test_search_for_name(self):
        DbSetupOfficials().create_officials_and_team()
        official = Official.objects.first()
        response = self.app.get(
            reverse(API_OFFICIALS_SEARCH_BY_NAME, kwargs={"pk": 0}),
            "name=fra%20fed",
            headers=DBSetup().get_token_header(),
        )
        assert response.status_code == HTTPStatus.OK
        assert len(response.json) == 1
        assert response.json[0] == {
            "team": official.team.description,
            "id": official.pk,
            "first_name": "Franzi",
            "last_name": "Fedora",
        }

    def test_search_finds_multiple_matches(self):
        DbSetupOfficials().create_officials_and_team()
        official_1: Official = Official.objects.first()
        official_1.external_id = 55
        official_1.save()
        official_2: Official = Official.objects.last()
        official_2.external_id = 77
        official_2.save()
        DbSetupOfficials().create_officials_and_team()
        response = self.app.get(
            reverse(API_OFFICIALS_SEARCH_BY_NAME, kwargs={"pk": 0}),
            "name=FRA%20FED",
            headers=DBSetup().get_token_header(),
        )
        assert response.status_code == HTTPStatus.OK
        assert len(response.json) == 2

    def _create_official(self, first_name, last_name, external_id):
        if Official.objects.filter(first_name="Franzi").exists():
            team = Official.objects.get(first_name="Franzi").team
        else:
            team = DbSetupOfficials().create_officials_and_team()
        return OfficialFactory(
            first_name=first_name,
            last_name=last_name,
            team=team,
            external_id=external_id,
        )

    def _search(self, name):
        return self.app.get(
            reverse(API_OFFICIALS_SEARCH_BY_NAME, kwargs={"pk": 0}),
            f"name={name}",
            expect_errors=True,
            headers=DBSetup().get_token_header(),
        )

    def test_search_full_name_with_multi_word_last_name(self):
        official = self._create_official("Hans", "van der Berg", 101)
        response = self._search("Hans%20van%20der%20Berg")
        assert response.status_code == HTTPStatus.OK
        assert [o["id"] for o in response.json] == [official.pk]

    def test_search_full_name_with_multi_word_first_name(self):
        official = self._create_official("Anna Maria", "Mueller", 102)
        response = self._search("Anna%20Maria%20Mueller")
        assert response.status_code == HTTPStatus.OK
        assert [o["id"] for o in response.json] == [official.pk]

    def test_search_ignores_surrounding_and_repeated_whitespace(self):
        official = self._create_official("Hans", "Berg", 103)
        response = self._search("%20Hans%20%20Berg%20")
        assert response.status_code == HTTPStatus.OK
        assert [o["id"] for o in response.json] == [official.pk]

    def test_search_query_count_does_not_depend_on_name_parts(self):
        self._create_official("Hans", "Berg", 104)
        self._create_official("Hans", "van der Berg", 105)
        with CaptureQueriesContext(connection) as short:
            assert self._search("Hans%20Berg").status_code == HTTPStatus.OK
        with CaptureQueriesContext(connection) as long:
            response = self._search("Hans%20van%20der%20Berg")
        assert response.status_code == HTTPStatus.OK
        assert len(long) == len(short)

    def test_search_no_official_found(self):
        DbSetupOfficials().create_officials_and_team()
        response = self.app.get(
            reverse(API_OFFICIALS_SEARCH_BY_NAME, kwargs={"pk": 0}),
            "name=nonExist%20Official",
            expect_errors=True,
            headers=DBSetup().get_token_header(),
        )
        assert response.status_code == HTTPStatus.NOT_FOUND

    def test_search_first_name_is_too_short(self):
        DBSetup().create_new_user()
        response = self.app.get(
            reverse(API_OFFICIALS_SEARCH_BY_NAME, kwargs={"pk": 0}),
            "name=to%20oShortFirstName",
            expect_errors=True,
            headers=DBSetup().get_token_header(),
        )
        assert response.status_code == HTTPStatus.BAD_REQUEST
        assert response.json[0] == "Vorname muss mindestens 3 Zeichen haben"
