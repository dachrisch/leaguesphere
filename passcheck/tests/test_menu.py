"""The Team menu carries the Scorecard v2 entry.

The v2 app is the field capture client; without a menu entry the only way in is
to know the URL. It sits directly under "Scorecard / Passcheck" because that is
the entry it replaces for the crew, and it is visible to anonymous users too so
a demo visitor can find it (the app itself redirects to the login page).
"""

import pytest
from django.contrib.auth.models import AnonymousUser

from league_manager.utils.utils import get_menu_items
from passcheck.menu import PasscheckMenu

SCORECARD_V2_LABEL = "\U0001f4f1 Scorecard v2 (Beta)"
LIVETICKER_V2_LABEL = "\U0001f4e1 Liveticker v2"
TEAM_MENU_NAME = "Team"


def _team_items(rf, user=None):
    request = rf.get("/")
    request.user = user or AnonymousUser()
    return get_menu_items(request)[TEAM_MENU_NAME]["items"]


@pytest.mark.django_db
def test_scorecard_v2_entry_follows_the_passcheck_entry(rf):
    names = [item.get("name") for item in _team_items(rf)]
    assert SCORECARD_V2_LABEL in names

    passcheck_index = names.index("Scorecard / Passcheck")
    assert names[passcheck_index + 1] == SCORECARD_V2_LABEL


@pytest.mark.django_db
def test_scorecard_v2_entry_points_at_the_app(rf):
    entry = next(
        item for item in _team_items(rf) if item.get("name") == SCORECARD_V2_LABEL
    )
    assert entry["url"] == "/scorecard/v2/"
    assert entry["static"] is False


@pytest.mark.django_db
def test_liveticker_v2_entry_follows_the_scorecard_entry(rf):
    names = [item.get("name") for item in _team_items(rf)]
    assert LIVETICKER_V2_LABEL in names

    scorecard_index = names.index(SCORECARD_V2_LABEL)
    assert names[scorecard_index + 1] == LIVETICKER_V2_LABEL


@pytest.mark.django_db
def test_liveticker_v2_entry_points_at_the_v2_app(rf):
    entry = next(
        item for item in _team_items(rf) if item.get("name") == LIVETICKER_V2_LABEL
    )
    assert entry["url"] == "/liveticker/v2/"
    assert entry["static"] is False


@pytest.mark.django_db
def test_liveticker_v2_entry_is_visible_when_anonymous(rf):
    """The ticker is public; a demo visitor must find it without an account."""
    names = [item.get("name") for item in _team_items(rf)]
    assert LIVETICKER_V2_LABEL in names


@pytest.mark.django_db
def test_scorecard_v2_entry_is_visible_when_anonymous(rf):
    """A demo visitor has no account yet; the app redirects to /login/ itself."""
    names = [item.get("name") for item in _team_items(rf)]
    assert SCORECARD_V2_LABEL in names


def test_menu_class_still_builds_its_own_items(rf):
    request = rf.get("/")
    request.user = AnonymousUser()
    items = PasscheckMenu().get_menu_items(request=request)
    assert [item.get("name") for item in items].count(SCORECARD_V2_LABEL) == 1
    assert [item.get("name") for item in items].count(LIVETICKER_V2_LABEL) == 1


@pytest.mark.django_db
def test_entry_renders_in_the_site_header_for_visitors(client):
    html = client.get("/", follow=True).content.decode()
    assert SCORECARD_V2_LABEL in html
    assert 'href="/scorecard/v2/"' in html
    assert LIVETICKER_V2_LABEL in html
    assert 'href="/liveticker/v2/"' in html
