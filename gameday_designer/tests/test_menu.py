"""
Tests for menu restructure: chooser redirect and non-staff view-only link.
Uses simple mock users — no database connection required.
"""
from unittest.mock import MagicMock

import pytest
from django.contrib.auth.models import AnonymousUser
from django.test import RequestFactory

from gamedays.menu import GamedaysMenuAdmin
from gameday_designer.menu import Gameday_designerMenuOrgaEntry, Gameday_designerMenuViewOnlyEntry


@pytest.fixture
def rf():
    return RequestFactory()


def _make_user(is_staff=False, is_authenticated=True):
    user = MagicMock()
    user.is_staff = is_staff
    user.is_authenticated = is_authenticated
    return user


# ---------------------------------------------------------------------------
# GamedaysMenuAdmin — staff "Orga" group
# ---------------------------------------------------------------------------

def test_orga_erstellen_points_to_chooser(rf):
    req = rf.get("/")
    req.user = _make_user(is_staff=True)
    items = GamedaysMenuAdmin().get_menu_items(req)
    labels = [i["name"] for i in items]
    assert any("Spieltag erstellen" in n for n in labels)
    assert not any("designen" in n for n in labels)
    erstellen = next(i for i in items if "Spieltag erstellen" in i["name"])
    assert erstellen["url"] == "/gamedays/gameday/create/"


def test_orga_hidden_for_non_staff(rf):
    req = rf.get("/")
    req.user = _make_user(is_staff=False)
    items = GamedaysMenuAdmin().get_menu_items(req)
    assert items == []


# ---------------------------------------------------------------------------
# Gameday_designerMenuOrgaEntry — "Orga" designer fragment
# ---------------------------------------------------------------------------

def test_designer_orga_entry_no_longer_lists_designen(rf):
    req = rf.get("/")
    req.user = _make_user(is_staff=True)
    items = Gameday_designerMenuOrgaEntry().get_menu_items(req)
    assert not any("designen" in i["name"] for i in items)


def test_designer_orga_entry_live_status_still_present(rf):
    req = rf.get("/")
    req.user = _make_user(is_staff=True)
    items = Gameday_designerMenuOrgaEntry().get_menu_items(req)
    assert any("Live Status" in i["name"] for i in items)


def test_designer_orga_entry_offers_designer_link(rf):
    """Orga (staff) has a direct link to view the Gameday Designer index."""
    req = rf.get("/")
    req.user = _make_user(is_staff=True)
    items = Gameday_designerMenuOrgaEntry().get_menu_items(req)
    designer = next((i for i in items if "Designer" in i["name"]), None)
    assert designer is not None
    assert designer["url"] == "/gamedays/gameday/design/"


def test_designer_orga_entry_hidden_for_non_staff(rf):
    req = rf.get("/")
    req.user = _make_user(is_staff=False)
    items = Gameday_designerMenuOrgaEntry().get_menu_items(req)
    assert items == []


# ---------------------------------------------------------------------------
# Gameday_designerMenuViewOnlyEntry — "Spieltage" group for non-staff
# ---------------------------------------------------------------------------

def test_view_only_entry_group_name():
    assert Gameday_designerMenuViewOnlyEntry().get_name() == "Spieltage"


def test_view_only_entry_shows_for_authenticated_non_staff(rf):
    req = rf.get("/")
    req.user = _make_user(is_staff=False, is_authenticated=True)
    items = Gameday_designerMenuViewOnlyEntry().get_menu_items(req)
    assert len(items) == 1
    assert items[0]["name"] == "Spieltag ansehen"
    assert items[0]["url"] == "/gamedays/gameday/design/"


def test_view_only_entry_hidden_for_staff(rf):
    req = rf.get("/")
    req.user = _make_user(is_staff=True, is_authenticated=True)
    items = Gameday_designerMenuViewOnlyEntry().get_menu_items(req)
    assert items == []


def test_view_only_entry_hidden_for_anonymous(rf):
    req = rf.get("/")
    req.user = AnonymousUser()
    items = Gameday_designerMenuViewOnlyEntry().get_menu_items(req)
    assert items == []
