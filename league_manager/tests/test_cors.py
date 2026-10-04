"""CORS: only the public API (/api/snapshot/) is cross-origin readable.

Replaces the blanket CORS_ORIGIN_ALLOW_ALL removed in #1977 with the
property that matters: any origin may *read* the anonymous snapshot, no
origin gets CORS on anything else, and nothing is ever credentialed.
"""

import pytest

PUBLIC_API_URL = "/api/snapshot/"
ORIGIN = "https://club.example.org"
INTERNAL_URLS = [
    "/api/leagues/",
    "/api/teams/",
    "/api/seasons/",
    "/api/liveticker/",
    "/api/gamedays/",
    "/api/",
    "/admin/",
    "/",
]


@pytest.mark.django_db
def test_snapshot_is_readable_from_any_origin(client):
    response = client.get(PUBLIC_API_URL, HTTP_ORIGIN=ORIGIN)

    assert response.status_code == 200
    assert response.headers["Access-Control-Allow-Origin"] == "*"
    exposed = response.headers["Access-Control-Expose-Headers"].lower()
    assert "etag" in exposed
    assert "retry-after" in exposed


@pytest.mark.django_db
def test_snapshot_preflight_allows_conditional_get_only(client):
    response = client.options(
        PUBLIC_API_URL,
        HTTP_ORIGIN=ORIGIN,
        HTTP_ACCESS_CONTROL_REQUEST_METHOD="GET",
        HTTP_ACCESS_CONTROL_REQUEST_HEADERS="if-none-match",
    )

    assert response.status_code == 200
    assert response.headers["Access-Control-Allow-Origin"] == "*"
    assert "if-none-match" in response.headers["Access-Control-Allow-Headers"]
    methods = response.headers["Access-Control-Allow-Methods"]
    assert "GET" in methods
    for write_method in ("POST", "PUT", "PATCH", "DELETE"):
        assert write_method not in methods


@pytest.mark.django_db
def test_snapshot_never_allows_credentials(client):
    response = client.get(PUBLIC_API_URL, HTTP_ORIGIN=ORIGIN)

    assert "Access-Control-Allow-Credentials" not in response.headers


@pytest.mark.django_db
def test_snapshot_body_is_identical_with_and_without_origin(client):
    with_origin = client.get(PUBLIC_API_URL, HTTP_ORIGIN=ORIGIN)
    without_origin = client.get(PUBLIC_API_URL)

    assert with_origin.json()["gamedays"] == without_origin.json()["gamedays"]


@pytest.mark.django_db
@pytest.mark.parametrize("url", INTERNAL_URLS)
def test_internal_routes_get_no_cors_headers(client, url):
    response = client.get(url, HTTP_ORIGIN=ORIGIN)
    preflight = client.options(
        url,
        HTTP_ORIGIN=ORIGIN,
        HTTP_ACCESS_CONTROL_REQUEST_METHOD="GET",
    )

    assert "Access-Control-Allow-Origin" not in response.headers
    assert "Access-Control-Allow-Origin" not in preflight.headers
