"""Framing contract for the public /share/ pages.

The widget must be embeddable cross-origin so clubs can iframe it on their own
site; every other LeagueSphere page keeps Django's default X-Frame-Options: DENY.
The generator is a normal page (it is never framed — the *widget* is what the
preview frames), so it stays DENY too.
"""

import pytest

CSP_FRAME_ANCESTORS = "frame-ancestors *"


@pytest.mark.django_db
def test_widget_page_is_frameable(client):
    response = client.get("/share/widget/")
    assert response.status_code == 200
    assert response.headers["Content-Security-Policy"] == CSP_FRAME_ANCESTORS
    assert "X-Frame-Options" not in response.headers


@pytest.mark.django_db
def test_generator_page_still_denies_framing(client):
    response = client.get("/share/")
    assert response.status_code == 200
    assert response.headers.get("X-Frame-Options") == "DENY"
    assert "Content-Security-Policy" not in response.headers


@pytest.mark.django_db
def test_other_pages_still_deny_framing(client):
    response = client.get("/health/")
    assert response.headers.get("X-Frame-Options") == "DENY"
    assert "Content-Security-Policy" not in response.headers
