from league_manager.base_menu import BaseMenu, MenuItem


class DashboardMenuAdmin(BaseMenu):
    @classmethod
    def get_name(cls):
        return "Admin"

    def get_menu_items(self, request):
        if not request.user.is_staff:
            return []
        return [
            MenuItem.create(
                name="Dashboard",
                url="dashboard-home",
            ),
        ]
