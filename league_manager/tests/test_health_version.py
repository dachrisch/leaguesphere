"""Tests for /health/version/ (Phase 0c, dachrisch/leaguesphere#2536).

The equivalence harness refuses to trust a candidate it cannot identify, so
this endpoint must report the commit SHA baked into the image and never
require a database read.
"""

from __future__ import annotations

import pytest


@pytest.mark.parametrize("sha", ["387fad15f", "unknown"])
def test_health_version_reports_the_baked_sha(client, settings, sha):
    settings.BUILD_SHA = sha

    response = client.get("/health/version/")

    assert response.status_code == 200
    assert response.json() == {"sha": sha}


@pytest.mark.django_db
def test_health_version_reads_no_application_data(
    client, settings, django_assert_max_num_queries
):
    settings.BUILD_SHA = "abc1234"

    # The maintenance middleware owns the only queries on this path (a
    # connection check plus SiteConfiguration); the view itself reads none.
    with django_assert_max_num_queries(2):
        response = client.get("/health/version/")

    assert response.json()["sha"] == "abc1234"
