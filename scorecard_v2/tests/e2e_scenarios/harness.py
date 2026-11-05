"""Two independent phone browsers for the scorecard v2 offline scenarios.

Everything here is test scaffolding: it drives the real app through Playwright
and reads the real server state through the ORM. No product code is imported
for writing, and no behaviour is simulated -- the queue is read from
IndexedDB, the score from ``GameState``, the lock from ``GameSetup``.

Two rules shape the implementation:

- each phone is one Chromium process with its own persistent profile, so it is
  a real device (its own cookies, localStorage device id, IndexedDB and service
  worker), not a second context inside one browser;
- every wait is a condition (a queue length, a badge, a server row), never a
  fixed sleep. The only polling sleeps are the short intervals between two
  condition reads.
"""

from __future__ import annotations

import os
import re
import signal
import subprocess
import sys
import time
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Iterable

from django.contrib.auth import get_user_model
from django.db import connection
from playwright.sync_api import (
    BrowserContext,
    Error as PlaywrightError,
    Page,
    Playwright,
    expect,
)

ROOT = Path(__file__).resolve().parents[3]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from gameevents.models import GameEvent, GameState  # noqa: E402
from gamedays.models import (  # noqa: E402
    Gameresult,
    GameSetup,
    Gameinfo,
    TeamLog,
)

# The existing flow test is the single source of the login, seed and tap
# helpers. Import them rather than copy: a UI change on the stack then updates
# one place. ``_login`` and ``_open_game`` are deliberately not imported --
# ``_login`` creates the user (a fixture does that) and ``_open_game`` expects
# the setup screen, which a started game skips.
from scorecard_v2.tests.e2e.test_scorecard_v2_flow import (  # noqa: E402
    PASSWORD,
    USERNAME,
    _choose_start_fields,
    _seed_game_today,
    _tap_start,
)

DEVICE_ID_STORAGE_KEY = "scorecard-v2-device-id"

# Reads the whole outbox, including rejected rows, straight from IndexedDB.
# The store's primary key is ``id``; ``getAll`` keeps the raw StoredOp shape.
QUEUE_JS = """() => new Promise((res, rej) => {
  const o = indexedDB.open('scorecard-v2');
  o.onerror = rej;
  o.onsuccess = () => {
    if (!o.result.objectStoreNames.contains('ops')) {
      o.result.close();
      res([]);
      return;
    }
    const q = o.result.transaction('ops').objectStore('ops').getAll();
    q.onsuccess = () => { o.result.close(); res(q.result); };
    q.onerror = (e) => { o.result.close(); rej(e); };
  };
})"""

# "Turnover Heimteam Nord" in the log; a count that grows when a tap landed.
TURNOVER_ROW_JS = """() => [...document.querySelectorAll('.logrows .rowprimary')]
  .filter((el) => el.textContent.trim().startsWith('Turnover ')).length"""

TOUCHDOWN_ROW_JS = """() => [...document.querySelectorAll('.logrows .rowprimary')]
  .filter((el) => el.textContent.trim().startsWith('Touchdown ')).length"""


# --------------------------------------------------------------------------- #
# Server-side facts
# --------------------------------------------------------------------------- #


@dataclass
class ServerState:
    """The server's answer for one game, read through the ORM."""

    events: list[GameEvent]
    team_log: list[TeamLog]
    score_home: int
    score_away: int
    device_id: str
    needs_reconciliation: bool
    in_possession: str | None
    status: str

    @property
    def client_ids(self) -> set[str]:
        return {event.client_id for event in self.events}


def server_state(game: Gameinfo) -> ServerState:
    state = GameState.objects.filter(game=game).first()
    setup = GameSetup.objects.filter(gameinfo=game).order_by("pk").first()
    return ServerState(
        events=list(GameEvent.objects.filter(game=game).order_by("seq")),
        team_log=list(TeamLog.objects.filter(gameinfo=game).order_by("pk")),
        score_home=0 if state is None else state.score_home,
        score_away=0 if state is None else state.score_away,
        device_id="" if setup is None else setup.device_id,
        needs_reconciliation=False if state is None else state.needs_reconciliation,
        in_possession=None if state is None else state.in_possession,
        status=game.status,
    )


def team_log_totals(game: Gameinfo) -> tuple[int, int]:
    """What the live rows add up to, split by the game's home/away side."""

    home_id = (
        Gameresult.objects.filter(gameinfo=game, isHome=True)
        .values_list("team_id", flat=True)
        .first()
    )
    away_id = (
        Gameresult.objects.filter(gameinfo=game, isHome=False)
        .values_list("team_id", flat=True)
        .first()
    )
    home = sum(
        row.value or 0
        for row in TeamLog.objects.filter(gameinfo=game, team_id=home_id)
        if not row.isDeleted
    )
    away = sum(
        row.value or 0
        for row in TeamLog.objects.filter(gameinfo=game, team_id=away_id)
        if not row.isDeleted
    )
    return home, away


# --------------------------------------------------------------------------- #
# The report
# --------------------------------------------------------------------------- #


class Report:
    """Collects observations and findings; writes them when the session ends."""

    def __init__(self, directory: Path) -> None:
        self.directory = directory
        self.directory.mkdir(parents=True, exist_ok=True)
        self.observations: dict[str, dict[str, Any]] = {}
        self.findings: list[dict[str, str]] = []

    def observe(self, scenario: str, key: str, value: object) -> None:
        self.observations.setdefault(scenario, {})[key] = value

    def finding(self, finding_id: str, title: str, detail: str) -> None:
        self.findings.append({"id": finding_id, "title": title, "detail": detail})

    def write(self) -> None:
        lines = [
            "# Scorecard v2 offline scenarios — raw observations",
            "",
            "Generated by the scenario run. Every value is what the browser",
            "or the server actually returned; see the history entry for the",
            "interpretation.",
            "",
        ]
        for scenario in sorted(self.observations):
            lines.append(f"## {scenario}")
            lines.append("")
            for key, value in self.observations[scenario].items():
                lines.append(f"- **{key}**: `{value!r}`")
            lines.append("")
        if self.findings:
            lines.append("## Candidate findings")
            lines.append("")
            for finding in self.findings:
                lines.append(
                    f"- **{finding['id']} — {finding['title']}**: "
                    f"{finding['detail']}"
                )
            lines.append("")
        (self.directory / "report.md").write_text("\n".join(lines), encoding="utf-8")


# --------------------------------------------------------------------------- #
# Queue rows
# --------------------------------------------------------------------------- #


@dataclass
class QueuedOp:
    id: str
    seq: int
    kind: str
    failed: bool
    failed_reason: str | None
    game_id: int | None = None
    payload: dict[str, Any] | None = None

    @classmethod
    def from_row(cls, row: dict[str, Any]) -> "QueuedOp":
        return cls(
            id=str(row.get("id", "")),
            seq=int(row.get("seq") or 0),
            kind=str(row.get("kind", "")),
            failed=bool(row.get("failed")),
            failed_reason=row.get("failedReason"),
            game_id=row.get("gameId"),
            payload=row.get("payload"),
        )

    @property
    def expected_events(self) -> int:
        """How many event rows this submission should write (our ops hold one)."""

        events = (self.payload or {}).get("events")
        if isinstance(events, list) and events:
            return len(events)
        return 1


# --------------------------------------------------------------------------- #
# The phone
# --------------------------------------------------------------------------- #


class Phone:
    """One Chromium process with its own persistent profile."""

    def __init__(
        self,
        name: str,
        profile: Path,
        base_url: str,
        playwright: Playwright,
        launch_args: dict[str, Any],
        window_x: int,
        artifact_dir: Path,
    ) -> None:
        self.name = name
        self.profile = Path(profile)
        self.profile.mkdir(parents=True, exist_ok=True)
        self.base_url = base_url.rstrip("/")
        self.playwright = playwright
        self.launch_args = dict(launch_args)
        self.window_x = window_x
        self.artifact_dir = Path(artifact_dir)
        self.artifact_dir.mkdir(parents=True, exist_ok=True)
        self.context: BrowserContext | None = None
        self.page: Page | None = None
        self.game_id: int | None = None
        self.gameday_id: int | None = None
        self.credentials: tuple[str, str] | None = None
        self._trace_path = self.artifact_dir / f"{self.name}-trace.zip"

    # -- lifecycle -------------------------------------------------------- #

    def start(self, offline: bool = False) -> None:
        args = list(self.launch_args.get("args") or [])
        args.extend(
            [
                f"--window-position={self.window_x},0",
                "--no-first-run",
                "--no-default-browser-check",
            ]
        )
        options = dict(self.launch_args)
        options.pop("args", None)
        headless = options.pop("headless", True)
        slow_mo = options.pop("slow_mo", 0)
        self.context = self.playwright.chromium.launch_persistent_context(
            str(self.profile),
            headless=headless,
            slow_mo=slow_mo,
            args=args,
            base_url=self.base_url,
            viewport={"width": 600, "height": 844},
            **options,
        )
        self.context.set_default_timeout(20000)
        if offline:
            self.context.set_offline(True)
        pages = self.context.pages
        self.page = pages[0] if pages else self.context.new_page()
        self.page.on("dialog", lambda dialog: dialog.accept())
        try:
            self.context.tracing.start(screenshots=True, snapshots=True)
        except PlaywrightError:
            # A profile that cannot trace must not cost the scenario.
            pass

    def kill(self) -> None:
        """SIGKILL this phone's browser process, exactly like a dead battery."""

        pids = self.pids()
        for pid in pids:
            try:
                os.kill(pid, signal.SIGKILL)
            except ProcessLookupError:
                pass
        deadline = time.monotonic() + 10
        while self.pids() and time.monotonic() < deadline:
            time.sleep(0.05)
        if self.pids():
            raise AssertionError(
                f"{self.name}: browser survived SIGKILL: {self.pids()}"
            )
        if self.context is not None:
            try:
                self.context.close()
            except PlaywrightError:
                # The process is gone; the persistent context cannot close its
                # transport. That is expected after a hard kill.
                pass
        self.context = None
        self.page = None

    def restart(self, offline: bool = False) -> None:
        self.start(offline=offline)

    def close(self) -> None:
        if self.context is not None:
            try:
                self.context.tracing.stop(path=str(self._trace_path))
            except PlaywrightError:
                pass
            try:
                self.context.close()
            except PlaywrightError:
                pass
        self.context = None
        self.page = None

    def pids(self) -> list[int]:
        pattern = f"--user-data-dir={self.profile}"
        result = subprocess.run(
            ["pgrep", "-f", "--", pattern],
            capture_output=True,
            text=True,
            check=False,
        )
        if result.returncode != 0:
            return []
        return [int(line) for line in result.stdout.split() if line.isdigit()]

    # -- navigation ------------------------------------------------------- #

    def _require_page(self) -> Page:
        if self.page is None:
            raise AssertionError(f"{self.name}: browser is not running")
        return self.page

    def app_url(self) -> str:
        return f"{self.base_url}/scorecard/v2/"

    def game_url(self, game: Gameinfo) -> str:
        return (
            f"{self.base_url}/scorecard/v2/gameday/{game.gameday_id}"
            f"/game/{game.pk}/"
        )

    def login(self, username: str, password: str) -> None:
        self.credentials = (username, password)
        self._login_ui(username, password)
        # Prime the profile before any scenario can SIGKILL it. A browser that
        # has just generated its device id keeps that localStorage write in the
        # renderer for a moment; a clean close/reopen commits it, so the hard
        # kill below tests the profile (a phone used for a while) rather than
        # the first 200 ms of a brand-new install.
        self._reopen_cleanly()
        # The clean restart is also the point where a session cookie can be
        # missing (a cookie store that had not committed yet). Log in again only
        # when the app actually redirected us; re-submitting a login page that
        # is already navigating away races with Django's authenticated-user
        # redirect.
        page = self._require_page()
        page.goto(self.app_url())
        if "/login/" in page.url:
            self._login_ui(username, password)
        else:
            page.wait_for_selector("#scorecard-v2-app")
            expect(page.get_by_role("heading", name="Meine Spieltage")).to_be_visible(
                timeout=30000
            )

    def _login_ui(self, username: str, password: str) -> None:
        page = self._require_page()
        page.goto(f"{self.base_url}/login/")
        if page.locator('input[name="username"]').count() > 0:
            page.fill('input[name="username"]', username)
            page.fill('input[name="password"]', password)
            page.click('button[type="submit"]')
        expect(page).not_to_have_url(re.compile(r"/login/$"))
        page.goto(self.app_url())
        page.wait_for_selector("#scorecard-v2-app")
        expect(page.get_by_role("heading", name="Meine Spieltage")).to_be_visible(
            timeout=30000
        )

    def _reopen_cleanly(self) -> None:
        context = self.context
        if context is not None:
            try:
                context.close()
            except PlaywrightError:
                pass
        self.context = None
        self.page = None
        # Do not launch the second process while the first one is still
        # releasing the profile: Chromium then sometimes starts with a fresh
        # profile, which would look like lost cookies and a lost device id.
        deadline = time.monotonic() + 10
        while self.pids() and time.monotonic() < deadline:
            time.sleep(0.05)
        self.start()

    def logout_and_login(self, creds: dict[str, str]) -> None:
        page = self._require_page()
        menu = page.get_by_role("button", name="Konto")
        if menu.count() > 0:
            menu.click()
            page.get_by_role("button", name="Abmelden").click()
        else:  # pragma: no cover - a screen without the menu
            page.goto(f"{self.base_url}/logout/")
        page.wait_for_url(re.compile(r"/$|/login/"), timeout=20000)
        self.login(creds["username"], creds["password"])

    def _ensure_authenticated(self) -> None:
        """Re-login after a hard kill that lost the session cookie.

        A SIGKILL can lose an uncommitted ``sessionid``; the device id (the
        subject of S00/S03/S04) is still there. An official would simply sign
        in again, so the harness does exactly that when Django redirects.
        """

        page = self._require_page()
        if "/login/" in page.url:
            if self.credentials is None:
                raise AssertionError(f"{self.name}: session lost and no credentials")
            self._login_ui(*self.credentials)

    def open_root(self) -> None:
        page = self._require_page()
        page.goto(self.app_url())
        self._ensure_authenticated()
        page.wait_for_selector("#scorecard-v2-app")
        expect(page.get_by_role("heading", name="Meine Spieltage")).to_be_visible(
            timeout=30000
        )

    def open_game(self, game: Gameinfo | None = None, *, direct: bool = False) -> None:
        """Open a game's setup or tracking screen, online or from the shell.

        The normal path is the tap path an official uses (day card, then game
        row). It needs the game to be in the signed-in user's list; staff and
        the second club user often are not, so the harness falls back to the
        game's own deep link. Both end on the same screen.
        """

        page = self._require_page()
        if game is not None:
            self.game_id = game.pk
            self.gameday_id = game.gameday_id

        def settle_screen() -> None:
            page.wait_for_function(
                "() => document.querySelector('.prep') || document.querySelector('.tracking')",
                timeout=30000,
            )

        if game is None or direct:
            if game is None:
                raise AssertionError("open_game needs a game or a direct path")
            page.goto(self.game_url(game))
            if "/login/" in page.url:
                self._ensure_authenticated()
                page.goto(self.game_url(game))
            settle_screen()
            return

        page.goto(self.app_url())
        if "/login/" in page.url:
            self._ensure_authenticated()
            page.goto(self.app_url())
        page.wait_for_selector("#scorecard-v2-app")
        try:
            expect(page.get_by_role("heading", name="Meine Spieltage")).to_be_visible(
                timeout=20000
            )
            page.locator("button.day-card", has_text=game.gameday.name).click(
                timeout=15000
            )
            expect(page.get_by_role("heading", name=game.gameday.name)).to_be_visible(
                timeout=20000
            )
            rows = page.locator("button.game-row")
            expect(rows).to_have_count(1)
            rows.first.click()
            settle_screen()
        except PlaywrightError:
            page.goto(self.game_url(game))
            settle_screen()

    def ensure_offline_capable(self) -> None:
        """Make sure the service worker is the controller before going offline.

        Without a controller an offline reload is a browser error page, not an
        offline boot; the test would then prove nothing about the app.
        """

        page = self._require_page()
        page.evaluate("() => navigator.serviceWorker.ready.then(() => true)")
        if page.evaluate("() => navigator.serviceWorker.controller === null"):
            page.reload()
        page.wait_for_function(
            "() => navigator.serviceWorker.controller !== null",
            timeout=30000,
        )

    def wait_tracking(self) -> None:
        page = self._require_page()
        expect(page.locator(".tracking")).to_be_visible(timeout=30000)
        expect(
            page.get_by_role("heading", name=re.compile(r"^Feld \d+ · .+$"))
        ).to_be_visible(timeout=30000)

    def start_game(self) -> None:
        page = self._require_page()
        expect(page.get_by_role("heading", name="Spiel vorbereiten")).to_be_visible(
            timeout=30000
        )
        _choose_start_fields(page)
        sheet = _tap_start(page)
        sheet.get_by_role("button", name="Jetzt starten").click()
        self.wait_tracking()

    def attempt_start(self) -> str | None:
        """Start from the setup screen; return the visible error, if any.

        Used by the two-phones-on-setup scenario: the second start must be
        refused without the harness treating it as a crash.
        """

        page = self._require_page()
        expect(page.get_by_role("heading", name="Spiel vorbereiten")).to_be_visible(
            timeout=30000
        )
        _choose_start_fields(page)
        sheet = _tap_start(page)
        sheet.get_by_role("button", name="Jetzt starten").click()
        page.wait_for_function(
            "() => document.querySelector('.tracking') || document.querySelector('.seterror')",
            timeout=30000,
        )
        error = page.locator(".seterror").first
        return error.inner_text().strip() if error.count() > 0 else None

    # -- network ---------------------------------------------------------- #

    def offline(self) -> None:
        page = self._require_page()
        self.context.set_offline(True)
        page.wait_for_function("() => navigator.onLine === false", timeout=10000)

    def online(self) -> None:
        page = self._require_page()
        self.context.set_offline(False)
        page.wait_for_function("() => navigator.onLine === true", timeout=10000)
        # Chromium fires `online` itself; dispatching it as well makes the
        # condition explicit for a context whose event was coalesced.
        page.evaluate("() => window.dispatchEvent(new Event('online'))")

    def clear_session_cookies(self) -> None:
        self.context.clear_cookies()

    def fetch_status(self, path: str) -> int | str:
        page = self._require_page()
        return page.evaluate(
            """path => fetch(path, {credentials: 'same-origin'})
                 .then((response) => response.status)
                 .catch(() => 'failed')""",
            path,
        )

    # -- device and queue -------------------------------------------------- #

    def device_id(self) -> str:
        page = self._require_page()
        page.wait_for_function(
            "key => localStorage.getItem(key) !== null",
            arg=DEVICE_ID_STORAGE_KEY,
            timeout=20000,
        )
        return page.evaluate("key => localStorage.getItem(key)", DEVICE_ID_STORAGE_KEY)

    def clear_device_id(self) -> None:
        page = self._require_page()
        page.evaluate("key => localStorage.removeItem(key)", DEVICE_ID_STORAGE_KEY)

    def reload(self) -> None:
        page = self._require_page()
        page.reload()
        page.wait_for_selector("#scorecard-v2-app")
        page.wait_for_function(
            "() => document.querySelector('.tracking') || document.querySelector('.prep') || document.querySelector('.app-shell')",
            timeout=30000,
        )

    def queue(self) -> list[QueuedOp]:
        page = self._require_page()
        rows = page.evaluate(QUEUE_JS)
        ops = [QueuedOp.from_row(row) for row in rows]
        if self.game_id is not None:
            ops = [op for op in ops if op.game_id in (None, self.game_id)]
        return sorted(ops, key=lambda op: op.seq)

    def pending(self) -> list[QueuedOp]:
        return [op for op in self.queue() if not op.failed]

    def failed(self) -> list[QueuedOp]:
        return [op for op in self.queue() if op.failed]

    def wait_queue(
        self, count: int, timeout_ms: int = 20000, *, include_failed: bool = False
    ) -> None:
        """Wait until the phone's queue holds exactly ``count`` rows."""

        deadline = time.monotonic() + timeout_ms / 1000
        while time.monotonic() < deadline:
            ops = self.queue()
            visible = ops if include_failed else [op for op in ops if not op.failed]
            if len(visible) == count:
                return
            time.sleep(0.1)
        ops = self.queue()
        present = ops if include_failed else [op for op in ops if not op.failed]
        raise AssertionError(
            f"{self.name}: queue did not reach {count} (has {len(present)}: "
            f"{[(op.kind, op.seq, op.failed) for op in ops]})"
        )

    def badge(self) -> str:
        page = self._require_page()
        label = page.locator(".syncbadge-inline .syncbadge-label").first
        if label.count() == 0:
            return ""
        return label.inner_text().strip()

    def strip(self) -> str | None:
        page = self._require_page()
        text = page.locator(".syncstrip .syncstrip-text").first
        if text.count() == 0:
            return None
        return text.inner_text().strip()

    def online_state(self) -> bool:
        page = self._require_page()
        return bool(page.evaluate("() => navigator.onLine"))

    def can_take_over(self) -> bool:
        page = self._require_page()
        for label in ("Spiel übernehmen", "Übernehmen"):
            button = page.get_by_role("button", name=label, exact=True)
            if button.count() > 0 and button.first.is_visible():
                return True
        return False

    def take_over(self) -> None:
        page = self._require_page()
        button = page.get_by_role("button", name="Spiel übernehmen", exact=True)
        expect(button).to_be_visible(timeout=20000)
        button.click()
        confirm = page.get_by_role("button", name="Übernehmen", exact=True)
        expect(confirm).to_be_visible(timeout=10000)
        confirm.click()
        page.wait_for_function(
            "() => document.querySelectorAll('.syncstrip-stop').length === 0",
            timeout=30000,
        )

    # -- entries ---------------------------------------------------------- #

    def _row_count(self, expression: str) -> int:
        return int(self._require_page().evaluate(expression))

    def tap_turnover(self) -> None:
        page = self._require_page()
        tile = page.get_by_role("button", name="Turnover", exact=True)
        expect(tile).to_be_enabled(timeout=20000)
        before = self._row_count(TURNOVER_ROW_JS)
        tile.click()
        page.wait_for_function(
            "expected => [...document.querySelectorAll('.logrows .rowprimary')]"
            ".filter((el) => el.textContent.trim().startsWith('Turnover '))"
            ".length === expected",
            arg=before + 1,
            timeout=20000,
        )
        # The row appears before the possession flip has finished; the next tap
        # must wait for the composer to open again, or it would be dropped by
        # the in-flight guard.
        expect(tile).to_be_enabled(timeout=20000)

    def undo_last(self) -> None:
        page = self._require_page()
        button = page.get_by_role("button", name="Rückgängig", exact=True)
        expect(button).to_be_visible(timeout=10000)
        before = self._row_count(TURNOVER_ROW_JS)
        button.click()
        page.wait_for_function(
            "expected => [...document.querySelectorAll('.logrows .rowprimary')]"
            ".filter((el) => el.textContent.trim().startsWith('Turnover '))"
            ".length < expected",
            arg=before,
            timeout=15000,
        )

    def touchdown(self, jersey: int, extra: str = "miss", *, wait: bool = True) -> None:
        page = self._require_page()
        before = self._row_count(TOUCHDOWN_ROW_JS)
        page.locator("button.tdbtn").click()
        sheet = page.get_by_role("dialog", name="Wer hat gepunktet?")
        expect(sheet).to_be_visible(timeout=20000)
        number = sheet.get_by_role("textbox", name=re.compile(r"^Trikotnummer"))
        expect(number).to_be_visible(timeout=10000)
        number.fill(str(jersey))
        sheet.get_by_role("button", name="Speichern").click()

        pat = page.get_by_role("group", name=re.compile(r"^Extrapunkt "))
        expect(pat).to_be_visible(timeout=20000)
        if extra == "miss":
            pat.get_by_role("button", name="nicht verwandelt", exact=True).click()
        else:
            pat.get_by_role("button", name=extra, exact=True).click()
            pat_sheet = page.get_by_role("dialog", name=re.compile(r"^Extrapunkt "))
            expect(pat_sheet).to_be_visible(timeout=20000)
            pat_sheet.get_by_role("button", name="Speichern").click()
        if wait:
            page.wait_for_function(
                "expected => [...document.querySelectorAll('.logrows .rowprimary')]"
                ".filter((el) => el.textContent.trim().startsWith('Touchdown '))"
                ".length >= expected",
                arg=before + 1,
                timeout=20000,
            )

    def finalize(self) -> None:
        """Finish the game from the tracking screen (both captains confirmed)."""

        page = self._require_page()
        page.get_by_role("button", name="Spiel beenden").click()
        expect(page.get_by_role("heading", name="Spielende")).to_be_visible(
            timeout=20000
        )
        page.fill("#captain-home", "Nord")
        page.fill("#captain-away", "Sued")
        confirm = page.locator("button.captainconfirm")
        expect(confirm).to_have_count(2)
        confirm.nth(0).click()
        confirm.nth(1).click()
        page.get_by_role("button", name="Ergebnis abschicken").click()
        expect(page.get_by_role("heading", name="Ergebnis gesendet")).to_be_visible(
            timeout=30000
        )

    def settle(self, timeout_ms: int = 15000) -> None:
        """Return once the badge and the queue have stopped changing."""

        page = self._require_page()
        deadline = time.monotonic() + timeout_ms / 1000
        previous: tuple[Any, ...] | None = None
        stable_since = time.monotonic()
        while time.monotonic() < deadline:
            ops = self.queue()
            snapshot = (
                self.badge(),
                self.strip(),
                len(ops),
                len([op for op in ops if op.failed]),
                max((op.seq for op in ops), default=0),
            )
            if snapshot != previous:
                previous = snapshot
                stable_since = time.monotonic()
            elif time.monotonic() - stable_since >= 1.0:
                return
            page.wait_for_timeout(200)
        # Timing out is not a failure of the scenario; the invariants report
        # what the stable-enough state actually is.

    def score(self) -> tuple[int, int]:
        page = self._require_page()
        spans = page.locator(".clock .score span")
        values: list[int] = []
        for index in range(spans.count()):
            text = spans.nth(index).inner_text().strip()
            if text.isdigit():
                values.append(int(text))
        return (values[0], values[1]) if len(values) >= 2 else (0, 0)

    def shot(self, label: str) -> str:
        page = self._require_page()
        safe = re.sub(r"[^a-zA-Z0-9_-]+", "-", label).strip("-")
        path = self.artifact_dir / f"{self.name}-{safe}.png"
        page.screenshot(path=str(path), full_page=True)
        return str(path)


# --------------------------------------------------------------------------- #
# Invariants
# --------------------------------------------------------------------------- #


def _badge_counts(label: str) -> tuple[int, int]:
    """Read the pending and rejected counts out of a badge label."""

    waiting = re.search(r"(\d+)\s+warten", label)
    rejected = re.search(r"(\d+)\s+abgelehnt", label)
    offline = re.search(r"Offline\s*·\s*(\d+)", label)
    pending = 0
    failed = 0
    if waiting is not None:
        pending = int(waiting.group(1))
    elif offline is not None:
        pending = int(offline.group(1))
    if rejected is not None:
        failed = int(rejected.group(1))
    return pending, failed


def assert_invariants(
    game: Gameinfo, phones: Iterable[Phone], queued_ids: set[str]
) -> None:
    """I1–I5 from the plan, checked against the real server and the real queue."""

    state = server_state(game)
    live_phones = [phone for phone in phones if phone.page is not None]

    # I2 first: a duplicate would also make the score disagree, and its cause
    # is the more useful finding.
    seen: dict[str, list[GameEvent]] = {}
    for event in state.events:
        seen.setdefault(event.client_id, []).append(event)
    for client_id in queued_ids:
        events = seen.get(client_id, [])
        if len(events) > 1:
            # Every harness op carries exactly one envelope; a second row for
            # one client_id is a replay that was written twice.
            raise AssertionError(
                f"I2 duplicate: client_id {client_id} wrote {len(events)} events "
                f"(seq {[event.seq for event in events]})"
            )
    for event in state.events:
        if (
            event.team_log_id is not None
            and not TeamLog.objects.filter(pk=event.team_log_id).exists()
        ):
            raise AssertionError(
                f"I2 broken link: event seq {event.seq} names missing row "
                f"{event.team_log_id}"
            )

    # I1: every op a phone queued is on the server or still visible in a queue.
    visible: set[str] = set()
    for phone in live_phones:
        visible.update(op.id for op in phone.queue())
    missing = queued_ids - state.client_ids - visible
    if missing:
        raise AssertionError(
            f"I1 lost: {len(missing)} queued ops are neither on the server nor "
            f"in a visible queue: {sorted(missing)}"
        )

    # I3: the projection and the live rows agree.
    expected_home, expected_away = team_log_totals(game)
    if (state.score_home, state.score_away) != (expected_home, expected_away):
        raise AssertionError(
            "I3 score disagrees: GameState "
            f"{state.score_home}:{state.score_away}, TeamLog "
            f"{expected_home}:{expected_away}"
        )
    if state.needs_reconciliation:
        raise AssertionError("I3 GameState is flagged for reconciliation")

    # I4/I5: the badge is honest about whatever is left.
    for phone in live_phones:
        ops = phone.queue()
        pending = [op for op in ops if not op.failed]
        failed = [op for op in ops if op.failed]
        label = phone.badge()
        if not ops:
            continue
        if label == "Synchron":
            raise AssertionError(
                f"I4 {phone.name}: badge says Synchron with {len(ops)} queued ops"
            )
        if label.startswith("Pausiert") or label == "Nur lesen":
            # A pause is a visible reason (I5); these labels carry no count.
            continue
        if not label:
            raise AssertionError(
                f"I5 {phone.name}: {len(ops)} ops queued with no badge reason"
            )
        badge_pending, badge_failed = _badge_counts(label)
        if badge_pending != len(pending) or badge_failed != len(failed):
            raise AssertionError(
                f"I4 {phone.name}: badge {label!r} does not match "
                f"{len(pending)} pending / {len(failed)} rejected"
            )
        if len(pending) > 0 and badge_pending == 0 and badge_failed == 0:
            raise AssertionError(
                f"I5 {phone.name}: {len(pending)} pending ops with no visible reason"
            )

    # I3 for the screen as well: a phone that is online and on tracking must
    # show the server's score. A queued/paused phone may legitimately differ
    # (S12/S13) and says so in its own strip.
    for phone in live_phones:
        if phone.page is None or not phone.online_state():
            continue
        if phone.page.locator(".tracking").count() == 0:
            continue
        shown = phone.score()
        if shown != (state.score_home, state.score_away):
            raise AssertionError(
                f"I3 {phone.name}: screen shows {shown[0]}:{shown[1]}, server has "
                f"{state.score_home}:{state.score_away}"
            )


def started_game(phone: Phone, game: Gameinfo) -> None:
    """Open the game, start it if it is still planned, and wait for tracking."""

    phone.open_game(game)
    if phone.page is not None and phone.page.locator(".prep").count() > 0:
        phone.start_game()
    phone.wait_tracking()
    phone.ensure_offline_capable()


# --------------------------------------------------------------------------- #
# Users and seed helpers
# --------------------------------------------------------------------------- #


def test_username() -> str:
    """The existing flow test's official; the seeded crew is named after it."""

    return USERNAME


def make_user(username: str, password: str, *, is_staff: bool = False):
    return get_user_model().objects.create_user(
        username=username,
        password=password,
        email=f"{username}@example.com",
        is_staff=is_staff,
    )


def seed_club_game() -> Gameinfo:
    return _seed_game_today()


def database_is_sqlite() -> bool:
    return connection.settings_dict["ENGINE"].endswith("sqlite3")
