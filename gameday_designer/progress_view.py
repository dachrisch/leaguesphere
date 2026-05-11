from django.contrib.auth.mixins import LoginRequiredMixin
from django.views.generic import TemplateView


class GameProgressPageView(LoginRequiredMixin, TemplateView):
    """
    Serves the game progress dashboard React application.
    Requires user authentication to view.
    """

    template_name = "gameday_designer/progress.html"
