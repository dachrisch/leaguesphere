"""Menu integration for the share widget.

Adds an entry to the "Team" menu linking to the widget generator, so clubs can
find the embed code without knowing the URL. The menu system discovers this
class automatically via ``<AppName>Menu`` naming.
"""

from league_manager.base_menu import BaseMenu, MenuItem

TEAM_MENU_NAME = "Team"


class ShareMenu(BaseMenu):
    def get_name(self):
        return TEAM_MENU_NAME

    def get_menu_items(self, request):
        return [
            MenuItem.create(
                name="📺 Widget einbetten",
                url="share-generator",
            ),
        ]
