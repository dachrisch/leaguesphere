"""
Menu integration for Gameday Designer app.

Adds designer entries to the staff "Orga" menu. The non-staff read-only link
lives in the "Spieltage" dropdown owned by gamedays/menu.py.
"""

from core.base_menu import BaseMenu, MenuItem
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
                name="🎨 Spieltag Designer",
                url="gameday_designer_app:index",  # Reverses to /gamedays/gameday/design/
            ),
            MenuItem.create(
                name="📊 Live Status",
                url="game-progress-page",  # Reverses to /gamedays/progress/
            ),
        ]
