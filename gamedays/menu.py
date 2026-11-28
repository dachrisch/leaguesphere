from gamedays.constants import LEAGUE_GAMEDAY_CREATE_CHOOSER, LEAGUE_GAMEDAY_LIST
from core.base_menu import BaseMenu, MenuItem


class GamedaysMenu(BaseMenu):
    """The public 'Spieltage' dropdown.

    The gameday list is the one entry everybody gets; non-staff also get the
    read-only designer link here instead of in a separate 'Designer' menu.
    Staff reach the designer from their 'Orga' menu.
    """

    @classmethod
    def get_name(cls):
        return "Spieltage"

    def get_menu_items(self, request):
        items = [MenuItem.create(name="Übersicht", url=LEAGUE_GAMEDAY_LIST)]
        if request.user.is_authenticated and not request.user.is_staff:
            items.append(
                MenuItem.create(
                    name="Spieltag ansehen",
                    url="gameday_designer_app:index",
                )
            )
        return items


class GamedaysMenuAdmin(BaseMenu):
    @classmethod
    def get_name(cls):
        return "Orga"

    def get_menu_items(self, request):
        if not request.user.is_staff:
            return []
        return [
            MenuItem.create(
                name="Spieltag erstellen",
                url=LEAGUE_GAMEDAY_CREATE_CHOOSER,
            ),
            MenuItem.create(
                name="Backend",
                url="admin:index",
            ),
        ]
