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
    # Playwright's BrowserContext has no public `base_url` attribute; the
    # journeys need the side's URL and the proxy credential for API sessions.
    context.ls_base_url = url
    context.ls_basic_auth = (username, password)
    context.role_pages = {}
    for role, (user, secret) in credentials.items():
        if not user or not secret:
            context.role_pages[role] = None
            continue
        # Log in through the stdlib transport, which sends the `Referer:
        # https://localhost/...` the proxied Django expects, then hand the
        # resulting cookies to the browser. A browser form POST sends the
        # tunnel hostname as Referer and fails CSRF verification.
        session = Session(url, username=username, password=password)
        response = session.login(user, secret)
        if response.status >= 400 or "/login/" in response.url:
            errors.append(f"login failed for role `{role}`")
            context.role_pages[role] = None
            continue
        context.add_cookies(
            [
                {"name": cookie.name, "value": cookie.value, "url": url}
                for cookie in session._cookies
            ]
        )
        context.role_pages[role] = True
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
        "close_contexts": lambda contexts: [
            context.close() for context in contexts.values()
        ],
        "close_browser": lambda browser: (browser.close(), playwright.stop()),
        "comment": lambda pr, text: subprocess.run(
            ["gh", "pr", "comment", str(pr), "--body", text], check=False
        ),
    }
