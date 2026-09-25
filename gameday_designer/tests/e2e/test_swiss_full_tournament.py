import os
import re

# Must be set before any Django imports
os.environ["DJANGO_ALLOW_ASYNC_UNSAFE"] = "true"

import pytest
from django.contrib.auth.models import User
from playwright.sync_api import Page, expect

from gamedays.models import Gameday, Gameinfo
from gamedays.tests.setup_factories.factories import (
    LeagueFactory,
    SeasonFactory,
    SeasonLeagueTeamFactory,
    TeamFactory,
)

DESIGNER_BASE_URL = "/gamedays/gameday/design"
SCREENSHOT_DIR = "test-reports/swiss-e2e"

ROUNDS = 4
TEAM_NAMES = [f"Swiss E2E Team {i}" for i in range(1, 7)]


def _login(page: Page, live_server_url: str) -> None:
    """Log in via Django's standard session login page (/login/)."""
    username = "swiss_e2e_user"
    password = "password123"
    if not User.objects.filter(username=username).exists():
        User.objects.create_superuser(
            username=username, password=password, email="swiss_e2e@test.com"
        )

    page.goto(f"{live_server_url}/login/")
    page.fill('input[name="username"]', username)
    page.fill('input[name="password"]', password)
    page.get_by_role("button", name="Login").click()
    page.wait_for_url(lambda url: "/login" not in url, timeout=10000)


def _seed_order(gameday: Gameday) -> list:
    """Seed team ids in tournament order (index 0 = top seed)."""
    state = gameday.designer_state.state_data or {}
    return [int(tid) for tid in state["swiss"]["seedOrder"]]


def _complete_pending_games(gameday: Gameday) -> None:
    """
    Complete every unfinished Swiss game: higher seed (lower seed index)
    wins 2:0. Mirrors the manual run-through and the scorecard e2e helper.
    """
    rank = {tid: i for i, tid in enumerate(_seed_order(gameday))}
    pending = Gameinfo.objects.filter(gameday=gameday, stage="Swiss").exclude(
        status=Gameinfo.STATUS_COMPLETED
    )
    assert pending.exists(), "expected unfinished Swiss games"
    for game in pending.order_by("pk"):
        home = game.gameresult_set.get(isHome=True)
        away = game.gameresult_set.get(isHome=False)
        home_wins = rank[home.team_id] < rank[away.team_id]
        home_score, away_score = (2, 0) if home_wins else (0, 2)
        home.fh, home.sh, home.pa = home_score, 0, away_score
        home.save()
        away.fh, away.sh, away.pa = away_score, 0, home_score
        away.save()
        game.status = Gameinfo.STATUS_COMPLETED
        game.save()


def _round_games(gameday: Gameday):
    return Gameinfo.objects.filter(gameday=gameday, stage="Swiss").order_by("pk")


def _open_swiss_control(page: Page) -> None:
    """Expand the Swiss Tournament Control card in the overview row."""
    page.get_by_text("Swiss Tournament Control").first.click()
    expect(page.get_by_test_id("swiss-standings-table")).to_be_visible(timeout=10000)


def _generate_next_round(page: Page, round_number: int) -> None:
    """Click Generate (dry-run adjust modal) and confirm unmodified."""
    generate_btn = page.get_by_test_id("swiss-generate-next")
    expect(generate_btn).to_contain_text(f"Generate Round {round_number}")
    generate_btn.click()

    expect(page.get_by_test_id("swiss-adjust-modal")).to_be_visible(timeout=10000)
    # 6 teams, even count: 3 pairings, no bye.
    expect(page.locator('[data-testid^="swiss-adjust-row-"]')).to_have_count(3)
    page.screenshot(path=f"{SCREENSHOT_DIR}/adjust-round-{round_number}.png")
    page.get_by_test_id("swiss-adjust-confirm").click()
    expect(page.get_by_test_id("swiss-adjust-modal")).not_to_be_visible(timeout=10000)


@pytest.mark.django_db(transaction=True)
def test_swiss_full_tournament_published_progression(live_server, page: Page):
    """
    Full Swiss run-through on a PUBLISHED schedule (6 teams, 4 rounds):

      1. Create league/season/6 teams; log in; create a DRAFT gameday via the
         designer dashboard and fill its metadata.
      2. Template Library -> Swiss System -> select the 6 teams -> setup
         (4 rounds default) -> Generate Round 1 (seed-order pairings).
      3. Publish the schedule.
      4. Regression guard: publish must preserve the Swiss games (it used to
         wipe them via CanvasPublishService, orphaning completedRounds).
      5. Rounds 1-4: complete every game ORM-side (higher seed wins 2:0),
         generate the next round through the UI adjust modal (unmodified),
         assert the standings table per round, screenshot per round.
      6. After round 4: "All 4 rounds are complete", no generate button,
         final table from the approved run-through.
    """
    os.makedirs(SCREENSHOT_DIR, exist_ok=True)

    # ---- 1. Setup ---------------------------------------------------------
    league = LeagueFactory(name="Swiss E2E League")
    season = SeasonFactory(name="2026")
    teams = [TeamFactory(name=name, description=name) for name in TEAM_NAMES]
    SeasonLeagueTeamFactory(season=season, league=league, teams=teams)

    _login(page, live_server.url)

    # ---- 2. Create gameday via designer dashboard --------------------------
    page.goto(f"{live_server.url}{DESIGNER_BASE_URL}/")
    expect(page.get_by_role("button", name="Create Gameday").first).to_be_visible(
        timeout=15000
    )
    page.get_by_role("button", name="Create Gameday").first.click()
    expect(page.get_by_test_id("gameday-metadata-accordion")).to_be_visible(
        timeout=15000
    )
    page.wait_for_url(re.compile(r"/designer/\d+"), timeout=5000)
    gameday_id = re.search(r"/designer/(\d+)", page.url).group(1)

    toggle = page.get_by_test_id("gameday-metadata-toggle")
    if "collapsed" in (toggle.get_attribute("class") or ""):
        toggle.click()
    page.fill("#gamedayName", "Swiss E2E Tournament")
    page.fill("#gamedayDate", "2026-09-27")
    page.fill("#gamedayStart", "10:00")
    page.fill("#gamedayVenue", "E2E Stadium, Testville")
    expect(page.locator("#gamedaySeason option", has_text="2026")).to_be_attached(
        timeout=10000
    )
    page.select_option("#gamedaySeason", label="2026")
    page.select_option("#gamedayLeague", label="Swiss E2E League")

    # ---- 3. Swiss template --------------------------------------------------
    page.get_by_test_id("open-template-library-button").click()
    expect(page.get_by_text("Template Library")).to_be_visible(timeout=5000)
    page.get_by_test_id("builtin-template-SWISS").click()
    expect(page.get_by_test_id("apply-template-button")).to_be_visible(timeout=5000)
    page.get_by_test_id("apply-template-button").click()

    expect(page.get_by_text("Select Teams")).to_be_visible(timeout=5000)
    for name in TEAM_NAMES:
        page.get_by_role("button", name=name).click()
    apply_btn = page.get_by_role("button", name=re.compile(r"Apply to Gameday"))
    expect(apply_btn).to_be_enabled(timeout=10000)
    apply_btn.click()

    # SwissSetupStep: seeds in selection order, 4 rounds by default.
    expect(page.get_by_test_id("swiss-seed-list")).to_be_visible(timeout=10000)
    expect(page.get_by_test_id("swiss-rounds")).to_have_text(str(ROUNDS))
    page.get_by_test_id("swiss-setup-confirm").click()

    # Round 1 generates from seed order: T1vT4, T2vT5, T3vT6.
    page.wait_for_timeout(2000)
    gameday = Gameday.objects.get(pk=gameday_id)
    round1 = list(_round_games(gameday))
    assert len(round1) == 3
    assert [
        (
            g.gameresult_set.get(isHome=True).team.name,
            g.gameresult_set.get(isHome=False).team.name,
        )
        for g in round1
    ] == [
        ("Swiss E2E Team 1", "Swiss E2E Team 4"),
        ("Swiss E2E Team 2", "Swiss E2E Team 5"),
        ("Swiss E2E Team 3", "Swiss E2E Team 6"),
    ]
    page.screenshot(path=f"{SCREENSHOT_DIR}/round-1-pairings.png")

    # ---- 4. Publish ----------------------------------------------------------
    publish_btn = page.get_by_test_id("publish-schedule-button")
    expect(publish_btn).to_be_visible(timeout=5000)
    publish_btn.click()
    expect(page.get_by_role("dialog")).to_be_visible(timeout=5000)
    publish_now_btn = page.get_by_role("button", name=re.compile(r"^Publish"))
    expect(publish_now_btn).to_be_enabled(timeout=5000)
    publish_now_btn.click()
    expect(page.get_by_text("Schedule published and locked")).to_be_visible(
        timeout=10000
    )

    # Regression guard: the publish materialization must keep the Swiss rows
    # (same PKs, so completedRounds.gameIds stay valid) and must not
    # duplicate them from the canvas game nodes.
    gameday.refresh_from_db()
    assert gameday.status == Gameday.STATUS_PUBLISHED
    assert [g.pk for g in _round_games(gameday)] == [g.pk for g in round1]
    page.screenshot(path=f"{SCREENSHOT_DIR}/published.png")

    # ---- 5. Rounds 1-4 while published ---------------------------------------
    for round_number in range(1, ROUNDS + 1):
        _complete_pending_games(gameday)
        page.reload()
        _open_swiss_control(page)
        expect(page.locator('[data-testid^="swiss-standing-"]')).to_have_count(6)
        page.screenshot(path=f"{SCREENSHOT_DIR}/standings-round-{round_number}.png")
        if round_number < ROUNDS:
            _generate_next_round(page, round_number + 1)
            page.wait_for_timeout(1500)
            gameday.refresh_from_db()

    # ---- 6. Tournament complete ----------------------------------------------
    page.reload()
    _open_swiss_control(page)
    expect(page.get_by_test_id("swiss-all-complete")).to_be_visible(timeout=10000)
    expect(page.get_by_test_id("swiss-generate-next")).to_have_count(0)
    page.screenshot(path=f"{SCREENSHOT_DIR}/final-standings.png")

    # Exact final table (higher seed always wins 2:0, rematch-free rounds):
    # T1 8, T2 6, T3 4, T4 4, T5 2, T6 0.
    from gameday_designer.service.swiss_tournament_service import (
        SwissTournamentService,
    )

    table = SwissTournamentService(gameday).standings()
    names = [f"Swiss E2E Team {i}" for i in (1, 2, 3, 4, 5, 6)]
    assert [(row["team_name"], row["points"]) for row in table] == [
        (name, points) for name, points in zip(names, [8, 6, 4, 4, 2, 0])
    ]
