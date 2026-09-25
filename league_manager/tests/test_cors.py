import pytest
from django.conf import settings


def test_cors_is_not_wide_open():
    """CORS_ORIGIN_ALLOW_ALL let any website read API responses cross-origin
    (deprecated setting name too -- django-cors-headers now calls it
    CORS_ALLOW_ALL_ORIGINS). Only an explicit allow-list should be trusted.
    """
    assert not getattr(settings, "CORS_ORIGIN_ALLOW_ALL", False)
    assert not getattr(settings, "CORS_ALLOW_ALL_ORIGINS", False)


@pytest.mark.django_db
def test_preflight_from_unlisted_origin_gets_no_cors_header(client):
    response = client.options(
        "/api/",
        HTTP_ORIGIN="https://evil.example.com",
        HTTP_ACCESS_CONTROL_REQUEST_METHOD="GET",
    )
    assert "Access-Control-Allow-Origin" not in response.headers
