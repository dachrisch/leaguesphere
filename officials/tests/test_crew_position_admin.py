"""Admin is how a league manager edits its crew labels — pin the surface."""

import pytest
from django.contrib import admin
from django.urls import reverse

from gamedays.tests.setup_factories.factories import LeagueFactory, UserFactory
from officials.admin import CrewPositionAdmin
from officials.models import CrewPosition


@pytest.mark.django_db
def test_crew_position_is_registered_with_its_own_admin():
    assert CrewPosition in admin.site._registry
    assert isinstance(admin.site._registry[CrewPosition], CrewPositionAdmin)


@pytest.mark.django_db
def test_the_changelist_can_create_and_filter_by_league():
    model_admin = CrewPositionAdmin(CrewPosition, admin.site)

    assert "league" in model_admin.list_display
    assert "label" in model_admin.list_display
    assert "required" in model_admin.list_display
    assert "league" in model_admin.list_filter
    assert "position" in model_admin.search_fields


@pytest.mark.django_db
def test_a_superuser_opens_the_crew_position_pages(client):
    league = LeagueFactory()
    superuser = UserFactory(username="root", is_staff=True, is_superuser=True)
    client.force_login(superuser)

    assert client.get(reverse("admin:officials_crewposition_changelist")).status_code == 200
    assert client.get(reverse("admin:officials_crewposition_add")).status_code == 200

    CrewPosition.objects.create(
        league=league, position="Referee", label="Schiedsrichter", order=1
    )
    change_url = reverse("admin:officials_crewposition_change", args=[CrewPosition.objects.get().pk])
    assert client.get(change_url).status_code == 200


@pytest.mark.django_db
def test_a_league_manager_can_type_its_own_labels(client):
    league = LeagueFactory()
    superuser = UserFactory(username="root", is_staff=True, is_superuser=True)
    client.force_login(superuser)

    response = client.post(
        reverse("admin:officials_crewposition_add"),
        {
            "league": league.pk,
            "position": "Referee",
            "label": "Head Referee",
            "order": 1,
            "required": "on",
        },
    )

    assert response.status_code == 302
    assert CrewPosition.objects.get(league=league).label == "Head Referee"


@pytest.mark.django_db
def test_the_admin_refuses_a_position_twice_in_one_league(client):
    league = LeagueFactory()
    superuser = UserFactory(username="root", is_staff=True, is_superuser=True)
    client.force_login(superuser)
    CrewPosition.objects.create(
        league=league, position="Referee", label="Schiedsrichter", order=1
    )

    response = client.post(
        reverse("admin:officials_crewposition_add"),
        {
            "league": league.pk,
            "position": "Referee",
            "label": "Zweiter",
            "order": 2,
        },
    )

    # The form answers with an error, the stored row is untouched.
    assert response.status_code == 200
    assert CrewPosition.objects.filter(league=league).count() == 1
