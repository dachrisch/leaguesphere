from django.views.generic import TemplateView
from django.contrib.auth.mixins import LoginRequiredMixin


class DashboardView(LoginRequiredMixin, TemplateView):
    """Main dashboard view."""

    template_name = "dashboard/index.html"
    login_url = "/accounts/login/"
