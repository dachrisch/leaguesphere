from league_manager.base_menu import BaseMenu, MenuItem

class FinanceMenu(BaseMenu):
    def get_name(self):
        return "Finance"

    def get_menu_items(self, request):
        if not request.user.is_staff:
            return []
            
        return [
            MenuItem.create("Dashboard", "finance-dashboard"),
            MenuItem.create("Global Settings", "finance-settings"),
        ]
