"""Public navigation entry for the liveticker.

``league_manager.utils.get_menu_items`` discovers menu classes by the
``<AppName>Menu`` prefix, so this module is picked up without registration.
The entry is public: fans open the ticker without an account, and the target
switches with the v2 rollout flag.
"""

from django.conf import settings

from league_manager.base_menu import BaseMenu, MenuItem
from liveticker.constants import LIVETICKER_HOME, LIVETICKER_V2_HOME

# Its own top-level group instead of an existing dropdown ("Team", "Orga"):
# the ticker is a fan-facing page, not a staff or roster tool.
LIVETICKER_MENU_NAME = "Live"


class LivetickerMenu(BaseMenu):
    def get_name(self):
        return LIVETICKER_MENU_NAME

    def get_menu_items(self, request):
        target = (
            LIVETICKER_V2_HOME
            if getattr(settings, "LIVETICKER_V2_ENABLED", False)
            else LIVETICKER_HOME
        )
        return [MenuItem.create(name="Liveticker", url=target)]
