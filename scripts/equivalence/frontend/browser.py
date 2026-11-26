"""Real Playwright/HTTP adapters for the frontend equivalence runner.

Kept separate from ``runner.py`` so the runner's orchestration can be
characterized at 100% branches with in-memory fakes. The live adapters are
verified on the agent stage by the ref-vs-ref noise floor.
"""

from __future__ import annotations

import datetime
import os
import subprocess
from pathlib import Path
import sys

for path in (
    str(Path(__file__).resolve().parent),
    str(Path(__file__).resolve().parents[1]),
):
    if path not in sys.path:
        sys.path.insert(0, path)

import journeys  # noqa: E402
import normalise  # noqa: E402
from transport import Session  # noqa: E402


def build_context(url, username, password, credentials, errors, browser):
    """One browser context per side: basic auth plus the four role logins."""
    context = browser.new_context(
        base_url=url,
        http_credentials=(
            {"username": username, "password": password} if username else None
        ),
        ignore_https_errors=True,
        service_workers="block",
    )
    context.role_pages = {}
    for role, (user, secret) in credentials.items():
        if not user or not secret:
            context.role_pages[role] = None
            continue
        page = context.new_page()
        page.goto("/login/")
        page.locator('input[name="username"]').fill(user)
        page.locator('input[name="password"]').fill(secret)
        page.locator('button[type="submit"], input[type="submit"]').first.click()
        if "/login/" in page.url:
            errors.append(f"login failed for role `{role}`")
            context.role_pages[role] = None
        else:
            context.role_pages[role] = page
    return context


def sha_probe(url, username, password):
    """Baked commit reported by the backend on one side."""
    response = Session(url, username=username, password=password).request(
        "/health/version/"
    )
    if response.status != 200:
        return "unknown"
    try:
        return normalise.normalise_json(response.json()).get("sha", "unknown")
    except ValueError:
        return "unknown"


def real_deps():
    """Wire the real Playwright browser, journeys and HTTP sha probe."""
    from playwright.sync_api import sync_playwright

    playwright = sync_playwright().start()
    browser = playwright.chromium.launch(headless=True)
    return {
        "browser": browser,
        "now": lambda: datetime.datetime.now().strftime("fe-%Y%m%d-%H%M%S"),
        "env": dict(os.environ),
        "context": build_context,
        "sha": sha_probe,
        "journeys": journeys.JOURNEYS,
        "comment": lambda pr, text: subprocess.run(
            ["gh", "pr", "comment", str(pr), "--body", text], check=False
        ),
    }
