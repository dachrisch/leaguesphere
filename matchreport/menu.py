from gamedays.constants import LEAGUE_GAMEDAY_CREATE
from gamedays.menu import GamedaysMenuAdmin
from league_manager.base_menu import BaseMenu, MenuItem

from .constants import MATCHREPORT_GAMEDAY_LIST

class MatchreportMenuAdmin(BaseMenu):
    @classmethod
    def get_name(cls):
        return GamedaysMenuAdmin.get_name()

    def get_menu_items(self, request):
        if not request.user.is_staff:
            return []
        return [
            MenuItem.create(
                name='<span class="badge bg-warning text-dark me-1" style="font-size: 0.65em; vertical-align: middle;">BETA</span> Spielberichtsbogen Lite',
                url=MATCHREPORT_GAMEDAY_LIST,  # Reverses to /gamedays/gameday/design/
            ),
        ]
