from pathlib import Path

from django.http import FileResponse
from django.views import View
from django.views.generic import TemplateView


class FieldView(TemplateView):
    """Public shell; the SPA authenticates its API calls with a Knox token."""

    template_name = "field/index.html"


class ServiceWorkerView(View):
    """Serve sw.js from /field/ so its scope can only ever be /field/."""

    def get(self, request):
        path = Path(__file__).resolve().parent / "public" / "sw.js"
        response = FileResponse(open(path, "rb"), content_type="application/javascript")
        response["Service-Worker-Allowed"] = "/field/"
        response["Cache-Control"] = "no-cache"
        return response
