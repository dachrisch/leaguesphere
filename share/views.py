"""Public, cross-origin embeddable pages (/share/*).

These are the only LeagueSphere pages that may be framed by a third-party site,
so clubs can embed live scores and standings. They are read-only and serve the
same anonymous, public data the JSON API already exposes; no credentials or
cookies are involved. Framing is opened with CSP ``frame-ancestors *`` (X-Frame-
Options cannot express a wildcard allowlist) while every other route keeps
Django's default ``X-Frame-Options: DENY``.
"""

from django.utils.decorators import method_decorator
from django.views.decorators.clickjacking import xframe_options_exempt
from django.views.generic import TemplateView

FRAME_ANCESTORS = "*"


class FrameableTemplateView(TemplateView):
    """A page that third-party sites are allowed to embed."""

    @method_decorator(xframe_options_exempt)
    def dispatch(self, request, *args, **kwargs):
        response = super().dispatch(request, *args, **kwargs)
        response["Content-Security-Policy"] = f"frame-ancestors {FRAME_ANCESTORS}"
        return response


class ShareWidgetView(FrameableTemplateView):
    template_name = "share/widget.html"


class ShareGeneratorView(FrameableTemplateView):
    template_name = "share/generator.html"
