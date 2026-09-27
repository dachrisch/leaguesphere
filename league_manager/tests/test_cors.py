import pytest
from django.conf import settings
from django.test import override_settings

# A real public endpoint: /api/ has no index route, so it would pass for
# the wrong reason.
PUBLIC_API_URL = "/api/leagues/"
WIDGET_ORIGIN = "https://widget.example.com"


def test_cors_is_not_wide_open():
    """Only an explicit allow-list should be trusted -- under either the old
    or the current django-cors-headers setting name.
    """
    assert not getattr(settings, "CORS_ORIGIN_ALLOW_ALL", False)
    assert not getattr(settings, "CORS_ALLOW_ALL_ORIGINS", False)


@pytest.mark.django_db
def test_preflight_from_unlisted_origin_gets_no_cors_header(client):
    response = client.options(
        PUBLIC_API_URL,
        HTTP_ORIGIN="https://evil.example.com",
        HTTP_ACCESS_CONTROL_REQUEST_METHOD="GET",
    )
    assert "Access-Control-Allow-Origin" not in response.headers


@pytest.mark.django_db
@override_settings(CORS_ALLOWED_ORIGINS=[WIDGET_ORIGIN])
def test_listed_origin_gets_cors_header_and_unlisted_still_does_not(client):
    allowed = client.get(PUBLIC_API_URL, HTTP_ORIGIN=WIDGET_ORIGIN)
    assert allowed.status_code == 200
    assert allowed.headers["Access-Control-Allow-Origin"] == WIDGET_ORIGIN

    denied = client.get(PUBLIC_API_URL, HTTP_ORIGIN="https://evil.example.com")
    assert denied.status_code == 200
    assert "Access-Control-Allow-Origin" not in denied.headers
