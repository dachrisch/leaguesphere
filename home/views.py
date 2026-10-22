"""The personal home page: one authenticated, read-only page per role."""

from django.contrib.auth.mixins import LoginRequiredMixin
from django.views.generic import TemplateView

from .service.home_service import build_context


class HomeView(LoginRequiredMixin, TemplateView):
    template_name = "home/home.html"
    login_url = "login"

    def get_context_data(self, **kwargs):
        context = super().get_context_data(**kwargs)
        # Officials log in through Moodle, not Django: the only link between a
        # signed-in person and an Official row is this session key
        # (officials/views.py:57). There is no User -> Official relation.
        from officials.views import MOODLE_LOGGED_IN_USER

        context.update(
            build_context(
                self.request.user,
                official_id=self.request.session.get(MOODLE_LOGGED_IN_USER),
            )
        )
        return context
