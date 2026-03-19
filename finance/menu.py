from league_manager.base_menu import BaseMenu, MenuItem
from league_manager.utils.view_utils import is_finance_admin


class FinanceMenu(BaseMenu):
    def get_name(self):
        return "Finance"

    def get_menu_items(self, request):
        if not is_finance_admin(request.user):
            return []

        return [
            MenuItem.create("Dashboard", "finance-dashboard"),
        ]
