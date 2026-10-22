"""Wiring: the `home` route, the login redirect, the nav entry, and `/`.

`/` keeps its permanent redirect to the gameday list so bookmarks and
`league_manager/tests/test_views.py::TestHomeView` stay valid.
"""

import pytest
from django.conf import settings
from django.urls import reverse

from gamedays.constants import LEAGUE_GAMEDAY_LIST


def test_home_url():
    assert reverse("home") == "/home/"


def test_login_redirects_to_home():
    assert settings.LOGIN_REDIRECT_URL == "home"


@pytest.mark.django_db
def test_login_lands_on_home(client, django_user_model):
    django_user_model.objects.create_user(
        username="home-login", password="a-long-test-password"
    )

    response = client.post(
        "/login/", {"username": "home-login", "password": "a-long-test-password"}
    )

    assert response.status_code == 302
    assert response.url == "/home/"


@pytest.mark.django_db
def test_root_still_redirects_permanently_to_the_gameday_list(client):
    response = client.get("/")

    assert response.status_code == 301
    assert response.url == reverse(LEAGUE_GAMEDAY_LIST)


@pytest.mark.django_db
def test_navigation_home_entry_points_at_the_home_page(client):
    response = client.get(reverse(LEAGUE_GAMEDAY_LIST))

    assert 'href="/home/"' in response.content.decode()


def test_dead_homeview_is_removed():
    from league_manager import views

    assert not hasattr(views, "homeview")
