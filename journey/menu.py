from league_manager.base_menu import BaseMenu, MenuItem


class JourneyMenu(BaseMenu):
    """Menu for journey dashboard with @bumbleflies.de email restriction."""

    def get_name(self):
        """Return the menu group name."""
        return "Analytics"

    def get_menu_items(self, request):
        """
        Return menu items only for @bumbleflies.de users.

        Args:
            request: The HTTP request object

        Returns:
            List of menu items if authorized, empty list otherwise
        """
        if not self._is_authorized_user(request):
            return []

        return [
            MenuItem.create(
                name="Journey Dashboard",
                url="/journey-dashboard/",
                is_static=True,
                permissions=[]
            )
        ]

    @staticmethod
    def _is_authorized_user(request):
        """
        Check if user is authenticated and has @bumbleflies.de email.

        Args:
            request: The HTTP request object

        Returns:
            True if user is authorized, False otherwise
        """
        if request.user is None:
            return False
        return (
            request.user.is_authenticated
            and request.user.email.endswith('@bumbleflies.de')
        )
