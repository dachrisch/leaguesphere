import pytest


@pytest.mark.django_db
def test_x_frame_options_denies_framing(client):
    """ALLOWALL is not a valid value -- browsers drop the header entirely, so
    the default DENY must be in effect.
    """
    response = client.get("/health/")
    assert response.headers.get("X-Frame-Options") == "DENY"
