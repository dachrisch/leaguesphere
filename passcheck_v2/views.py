from pathlib import Path

from django.http import FileResponse
from django.views import View
from django.views.generic import TemplateView


class PasscheckV2View(TemplateView):
    """Public shell; the SPA authenticates its API calls with a Knox token."""

    template_name = "passcheck_v2/index.html"


class ServiceWorkerView(View):
    """Serve sw.js from /passcheck/v2/ so its scope can only ever be /passcheck/v2/."""

    def get(self, request):
        path = Path(__file__).resolve().parent / "public" / "sw.js"
        response = FileResponse(open(path, "rb"), content_type="application/javascript")
        response["Service-Worker-Allowed"] = "/passcheck/v2/"
        response["Cache-Control"] = "no-cache"
        return response
