"""
Menu integration for Gameday Designer app.

Adds "Spieltag designen" entry to the "Orga" menu for staff users.
"""

from league_manager.base_menu import BaseMenu, MenuItem
from gamedays.menu import GamedaysMenuAdmin


class Gameday_designerMenuOrgaEntry(BaseMenu):
    """
    Add Gameday Designer entry to the Orga menu.

    The menu system automatically discovers this class and adds
    its items to the dropdown menu.
    """

    def get_name(self):
        """Return 'Orga' to add this item to the Orga menu."""
        return GamedaysMenuAdmin.get_name()  # Returns 'Orga'

    def get_menu_items(self, request):
        """
        Return menu items for the gameday designer.

        Args:
            request: HTTP request object for permission checking

        Returns:
            List of menu item dictionaries, empty if user lacks permission
        """
        # Only show to staff users
        if not request.user.is_staff:
            return []

        return [
            MenuItem.create(
                name='📊 Live Status',
                url="game-progress-page",  # Reverses to /gamedays/progress/
            ),
        ]


class Gameday_designerViewOnlyEntry(BaseMenu):
    """
    Show a view-only 'Spieltag ansehen' link to authenticated non-staff users.

    Placed in a dedicated 'Spieltage' dropdown group that is invisible to
    staff (who use the 'Orga' group) and anonymous users.
    """

    def get_name(self):
        return "Spieltage"

    def get_menu_items(self, request):
        if not request.user.is_authenticated or request.user.is_staff:
            return []
        return [
            MenuItem.create(
                name="Spieltag ansehen",
                url="gameday_designer_app:index",  # Reverses to /gamedays/gameday/design/
            ),
        ]
