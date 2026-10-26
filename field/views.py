from django.views.generic import TemplateView


class FieldView(TemplateView):
    """Public shell; the SPA authenticates its API calls with a Knox token."""

    template_name = "field/index.html"
