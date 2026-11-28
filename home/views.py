"""The personal home page: one authenticated, read-only page per role."""

from django.contrib.auth.mixins import LoginRequiredMixin
from django.views.generic import TemplateView

from .service.home_service import build_context


class HomeView(LoginRequiredMixin, TemplateView):
    template_name = "home/home.html"
    login_url = "login"

    def get_context_data(self, **kwargs):
        context = super().get_context_data(**kwargs)
        # Officials log in through Moodle, not Django: officials.identity owns
        # the session key that links a visitor to an Official row. There is no
        # User -> Official relation.
        from officials.identity import acting_official_id

        context.update(
            build_context(
                self.request.user,
                official_id=acting_official_id(self.request),
            )
        )
        return context
