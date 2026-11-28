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
import time

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from capture import StepCapture, capture_step  # noqa: E402
from transport import Session  # noqa: E402


def api_session(context):
    """An HTTP session against the same side as this browser context.

    A role view carries the transport session that performed the login, so
    discovery sees the same games the signed-in user does. The anonymous base
    context falls back to a basic-auth-only session.
    """
    role_session = getattr(context, "ls_role_session", None)
    if role_session is not None:
        return role_session
    base_url = getattr(context, "ls_base_url", "") or getattr(context, "base_url", "")
    basic = getattr(context, "ls_basic_auth", ("", ""))
    return Session(base_url, username=basic[0], password=basic[1])


def role_view(context, role):
    """The isolated browser context logged in as ``role`` (or ``None``)."""
    return getattr(context, "role_views", {}).get(role)


def discover(context, game_status=None, prefer_last=False):
    """Pick one gameday/game pair that exists on the shared stage DB.

    ``game_status`` selects a game by its wire status; the scorecard setup
    journey needs a planned game, while the tracking journey needs a live one.
    ``prefer_last`` picks the most recently dated live game: older games on
    this stage have no staff crew assignment and render read-only tiles. The
    default keeps the other journeys' original first-game behaviour.
    """
    session = api_session(context)
    try:
        response = session.request("/api/gamedays/?page_size=100")
    except OSError:  # a transient proxy disconnect is a discovery miss
        return {}
    if response.status != 200:
        return {}
    try:
        payload = json.loads(response.body)
    except ValueError:
        return {}
    items = payload.get("results", payload if isinstance(payload, list) else [])
    # Scanning from the newest gameday first finds a live game with a staff
    # crew in a handful of requests; older live games on this stage render
    # read-only tiles. The default keeps the original first-game behaviour.
    if prefer_last:
        items = list(reversed(items))
    for gameday in items:
        gameday_id = gameday.get("id")
        if not gameday_id:
            continue
        try:
            games_response = session.request(f"/api/gamedays/{gameday_id}/games/")
        except OSError:  # a transient proxy disconnect is a discovery miss
            continue
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
        candidates = [
            game
            for game in games
            if game.get("id")
            and (game_status is None or game.get("status") == game_status)
        ]
        if candidates:
            chosen = candidates[-1] if prefer_last else candidates[0]
            return {
                "gameday_id": gameday_id,
                "game_id": chosen["id"],
                "game_status": chosen.get("status") or "",
                "season_id": gameday.get("season") or "",
                "league_id": gameday.get("league") or "",
            }
    return {}


def wait_for_quiet(page, capture, timeout_ms=4000, quiet_ms=600):
    """Wait until no new API request has arrived for ``quiet_ms``.

    The screens fire several fetches in parallel on mount; a fixed short sleep
    captured a different subset on the two sides and produced false diffs.
    """
    deadline = time.monotonic() + timeout_ms / 1000
    last = len(capture.requests)
    stable = 0
    while time.monotonic() < deadline:
        page.wait_for_timeout(100)
        current = len(capture.requests)
        stable = stable + 100 if current == last else 0
        if stable >= quiet_ms:
            break
        last = current


def wait_until(page, predicate, timeout_ms=8000, poll_ms=100):
    """Poll a page condition until it holds, or fail loudly on timeout.

    Network quiescence alone is not a readiness proof: a page can be quiet
    before its first data fetch starts, so one side captures an empty form
    while the other captures the loaded fixture. Callers pass the observable
    condition that marks their screen as ready.
    """
    deadline = time.monotonic() + timeout_ms / 1000
    while time.monotonic() < deadline:
        try:
            if predicate(page):
                return
        except Exception:  # a selector missing while still loading
            pass
        page.wait_for_timeout(poll_ms)
    raise TimeoutError("page did not reach the expected ready state")


def run_steps(
    context,
    path,
    steps,
    skipped,
    actions=(),
    wait="domcontentloaded",
    tokens=None,
    prefix="",
    ready=None,
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
    step_name = "open"
    try:
        page.goto(path, wait_until=wait)
        # Condition first, quiet second: a screen that has not rendered its
        # data yet can look network-quiet and compare as a different state.
        if ready is not None:
            wait_until(page, ready)
        wait_for_quiet(page, capture)
        opening = capture_step(page, capture=capture, tokens=tokens)
        opening["absent"] = []
        steps[f"{prefix}{step_name}"] = opening
        for name, action in actions:
            step_name = name
            absent = []
            action(page, absent)
            wait_for_quiet(page, capture)
            step = capture_step(page, capture=capture, tokens=tokens)
            # An optional click that found nothing is recorded, not silently
            # turned into an identical step; compare_steps diffs this list.
            step["absent"] = absent
            steps[f"{prefix}{step_name}"] = step
    except Exception as error:  # a missing selector is a skip, never a fake diff
        skipped.append(f"{path}:{step_name}: {type(error).__name__}")
    finally:
        page.close()


REQUIRED_CLICK_TIMEOUT_MS = 3000  # fail fast on a disabled/absent write control


def required_click(page, selector):
    """Click a selector that must exist; absence fails the journey loudly.

    Playwright's 30 s default made two sides that both stalled on a disabled
    control burn a minute before failing; a bounded timeout keeps the harness
    usable while still failing the journey loudly.
    """
    locator = page.locator(selector)
    if not locator.count():
        raise LookupError(f"required selector absent: {selector}")
    locator.first.click(timeout=REQUIRED_CLICK_TIMEOUT_MS)


def optional_click(page, selector, absent):
    """Click when present, otherwise record ``absent`` for the step capture.

    Only use this for a state that is genuinely optional (for example a
    "Fortsetzen" button that exists only once a setup was saved).
    """
    locator = page.locator(selector)
    if not locator.count():
        absent.append(selector)
        return
    try:
        locator.first.click(timeout=2000)
    except Exception:
        # An element that exists but cannot be clicked is the same observable
        # state as an absent one for an optional control.
        absent.append(selector)


def no_op(page, absent):
    """An action that only waits and captures (keyboard steps use this)."""
    del page, absent


def click(selector):
    """Build a required-click action for ``run_steps``."""
    return lambda page, absent: required_click(page, selector)


def optional(selector):
    """Build an optional-click action for ``run_steps``."""
    return lambda page, absent: optional_click(page, selector, absent)


def press(key):
    """Build a keyboard action for ``run_steps``."""
    return lambda page, absent: page.keyboard.press(key)


def id_tokens(ids, run_id):
    """Tokens for discovered ids plus the two sides' run-id suffixes."""
    tokens = dict(ids)
    # The runner already suffixes the run id with -ref / -cand before calling
    # the journey, so tokenise the whole suffix exactly as the backend does.
    tokens[run_id] = "<run-id>"
    tokens[f"{run_id}-ref"] = "<run-id>"
    tokens[f"{run_id}-cand"] = "<run-id>"
    return tokens
