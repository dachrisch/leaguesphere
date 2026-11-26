"""Shared setup for the six frontend journeys (Phase 3 Layer 1).

Every journey opens a fresh page in the side's browser context (the context
holds both the basic-auth credential and the role login cookies), attaches a
``StepCapture`` and records one normalised step per UI state. A missing target
or a failed role login is reported as a skipped step, never as a fake diff.
"""

from __future__ import annotations

import json
from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from capture import StepCapture, capture_step  # noqa: E402
from transport import Session  # noqa: E402


def api_session(context):
    """An HTTP session against the same side as this browser context."""
    base_url = getattr(context, "ls_base_url", "") or getattr(context, "base_url", "")
    basic = getattr(context, "ls_basic_auth", ("", ""))
    return Session(base_url, username=basic[0], password=basic[1])


def discover(context):
    """Pick one gameday/game pair that exists on the shared stage DB."""
    session = api_session(context)
    response = session.request("/api/gamedays/")
    if response.status != 200:
        return {}
    try:
        payload = json.loads(response.body)
    except ValueError:
        return {}
    items = payload.get("results", payload if isinstance(payload, list) else [])
    for gameday in items:
        gameday_id = gameday.get("id")
        if not gameday_id:
            continue
        games_response = session.request(f"/api/gamedays/{gameday_id}/games/")
        if games_response.status != 200:
            continue
        try:
            games_payload = json.loads(games_response.body)
        except ValueError:
            continue
        if isinstance(games_payload, list):
            games = games_payload
        else:
            games = games_payload.get("results", [])
        if games and games[0].get("id"):
            return {
                "gameday_id": gameday_id,
                "game_id": games[0]["id"],
                "season_id": gameday.get("season") or "",
                "league_id": gameday.get("league") or "",
            }
    return {}


def run_steps(
    context,
    path,
    steps,
    skipped,
    actions=(),
    wait="domcontentloaded",
    tokens=None,
    prefix="",
):
    """Open ``path``, apply each ``(name, action)`` and capture the state."""
    page = context.new_page()
    # Never hold a liveticker SSE connection: it would pin the side's worker
    # and stall unrelated requests (the reason the ref route went unhealthy).
    page.route("**/api/liveticker/stream/**", lambda route: route.abort())
    capture = StepCapture(tokens)
    page.on(
        "request",
        lambda request: capture.record(
            {
                "url": request.url,
                "method": request.method,
                "body": request.post_data,
            }
        ),
    )
    try:
        page.goto(path, wait_until=wait)
        page.wait_for_timeout(250)
        steps[f"{prefix}open"] = capture_step(page, capture=capture, tokens=tokens)
        for name, action in actions:
            action(page)
            page.wait_for_timeout(250)
            steps[f"{prefix}{name}"] = capture_step(
                page, capture=capture, tokens=tokens
            )
    except Exception as error:  # a missing selector is a skip, never a fake diff
        skipped.append(f"{path}: {type(error).__name__}")
    finally:
        page.close()


def click_if_present(page, selector):
    """Click a selector when it exists; otherwise leave the state unchanged."""
    locator = page.locator(selector)
    if locator.count():
        locator.first.click()
