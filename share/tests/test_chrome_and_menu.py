"""The embeddable widget and generator carry the site chrome (header nav +
footer), and the Team menu links to the generator. Attribution is not
optional, so the LeagueSphere footer/credit is always present.
"""

import pytest
from django.contrib.auth.models import AnonymousUser

from league_manager.utils.utils import get_menu_items
from share.menu import ShareMenu, TEAM_MENU_NAME


@pytest.mark.django_db
def test_widget_page_has_site_header_and_footer(client):
    html = client.get("/share/widget/").content.decode()
    assert 'class="site-header"' in html
    assert 'href="/login/"' in html
    assert "bumbleflies" in html
    assert "Impressum" in html


@pytest.mark.django_db
def test_generator_page_has_site_header_and_footer(client):
    html = client.get("/share/").content.decode()
    assert 'class="site-header"' in html
    assert "LeagueSphere" in html
    assert "bumbleflies" in html
    assert "Impressum" in html


def test_share_menu_targets_the_team_menu_with_a_generator_link():
    menu = ShareMenu()
    assert menu.get_name() == TEAM_MENU_NAME
    items = menu.get_menu_items(request=None)
    assert len(items) == 1
    assert "Widget" in items[0]["name"]
    assert items[0]["url"] == "/share/"


@pytest.mark.django_db
def test_team_menu_reaches_the_generator(rf):
    request = rf.get("/")
    request.user = AnonymousUser()
    menus = get_menu_items(request)
    team_items = menus[TEAM_MENU_NAME]["items"]
    assert any("Widget" in item.get("name", "") for item in team_items)
