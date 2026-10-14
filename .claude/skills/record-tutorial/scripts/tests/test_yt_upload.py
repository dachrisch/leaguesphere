import pytest

from yt_upload import _extract_code


def test_extract_code_from_full_redirect_url():
    url = (
        "http://localhost/?state=abc&iss=https://accounts.google.com"
        "&code=4/0AXabc-_123&scope=https://www.googleapis.com/auth/youtube.upload"
    )
    assert _extract_code(url) == "4/0AXabc-_123"


def test_extract_code_accepts_a_bare_code():
    assert _extract_code("  4/0AXabc-_123  ") == "4/0AXabc-_123"


def test_extract_code_rejects_url_without_code():
    with pytest.raises(SystemExit):
        _extract_code("http://localhost/?state=abc")
