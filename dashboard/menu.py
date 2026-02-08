from league_manager.base_menu import BaseMenu, MenuItem


class DashboardMenu(BaseMenu):
    def get_name(self):
        return "Orga"

    def get_menu_items(self, request):
        # Only show dashboard to authenticated users
        if not request.user.is_authenticated:
            return []

        return [
            MenuItem.create(
                name='<span class="badge text-white me-1" style="font-size: 0.65em; vertical-align: middle; background-color: #6f42c1;">ALPHA</span> Dashboard',
                url="dashboard-home",
            ),
        ]
