from django.contrib.auth.mixins import LoginRequiredMixin
from django.utils.decorators import method_decorator
from django.views.decorators.csrf import ensure_csrf_cookie
from django.views.generic import TemplateView


@method_decorator(ensure_csrf_cookie, name="dispatch")
class ScorecardV2View(LoginRequiredMixin, TemplateView):
    template_name = "scorecard_v2/index.html"
    login_url = "login"
