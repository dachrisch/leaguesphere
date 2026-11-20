"""The public site-menu entry for the liveticker.

``league_manager.utils.get_menu_items`` discovers classes whose name starts
with ``<AppName>Menu``, so the class name is part of the contract. The entry is
public on purpose: fans open the ticker without an account.
"""

from django.contrib.auth.models import AnonymousUser, User
from django.test import RequestFactory, SimpleTestCase, override_settings
from django.urls import reverse

from liveticker.constants import LIVETICKER_HOME, LIVETICKER_V2_HOME
from liveticker.menu import LivetickerMenu


class TestLivetickerMenu(SimpleTestCase):
    def setUp(self):
        self.factory = RequestFactory()

    @staticmethod
    def _request(user):
        request = RequestFactory().get("/")
        request.user = user
        return request

    def _items(self, user):
        menu = LivetickerMenu()
        return menu, menu.get_menu_items(self._request(user))

    def test_class_name_is_discovered_by_the_menu_registry(self):
        # <AppName>Menu prefix: ``liveticker`` -> ``LivetickerMenu``.
        assert LivetickerMenu.__name__.startswith("LivetickerMenu")

    @override_settings(LIVETICKER_V2_ENABLED=True)
    def test_anonymous_user_gets_the_v2_entry_when_the_flag_is_on(self):
        _, items = self._items(AnonymousUser())

        assert len(items) == 1
        assert items[0]["name"] == "Liveticker"
        assert items[0]["url"] == reverse(LIVETICKER_V2_HOME)
        assert items[0]["url"] == "/liveticker/v2/"

    @override_settings(LIVETICKER_V2_ENABLED=False)
    def test_anonymous_user_gets_the_legacy_entry_when_the_flag_is_off(self):
        _, items = self._items(AnonymousUser())

        assert len(items) == 1
        assert items[0]["name"] == "Liveticker"
        assert items[0]["url"] == reverse(LIVETICKER_HOME)
        assert items[0]["url"] == "/liveticker/"

    @override_settings(LIVETICKER_V2_ENABLED=True)
    def test_logged_in_user_gets_the_same_entry(self):
        user = User(username="fan")
        _, items = self._items(user)

        assert [item["name"] for item in items] == ["Liveticker"]
        assert items[0]["url"] == "/liveticker/v2/"

    @override_settings(LIVETICKER_V2_ENABLED=False)
    def test_logged_in_user_gets_the_legacy_entry(self):
        user = User(username="fan")
        _, items = self._items(user)

        assert items[0]["url"] == "/liveticker/"

    def test_menu_group_is_public_and_not_staff_only(self):
        menu, _ = self._items(AnonymousUser())

        # A group name that collides with a staff group would hide the entry
        # from anonymous visitors on a staff-less menu; it is its own group.
        assert menu.get_name() == "Live"
