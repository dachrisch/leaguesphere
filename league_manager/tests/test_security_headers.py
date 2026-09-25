import pytest


@pytest.mark.django_db
def test_x_frame_options_denies_framing(client):
    """ALLOWALL is not a valid X-Frame-Options value: browsers ignore it and
    drop the header entirely, leaving pages embeddable by any origin. The
    default (DENY) must be in effect so clickjacking protection is real.
    """
    response = client.get("/health/")
    assert response.headers.get("X-Frame-Options") == "DENY"
