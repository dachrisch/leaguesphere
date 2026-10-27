"""End-to-end walk through /scorecard/v2/ in a real browser.

Seeds one gameday for today with a single game, logs in as the official whose
crew runs it, and drives the whole flow: gameday → game → preparation → start →
touchdown → finalise → result. The API behaviour is covered by the unit and
view tests; this one proves the click path a referee actually uses.
"""

import os

# Must be set before any Django imports: the test writes through the ORM while
# the live server serves the same database in another thread.
os.environ["DJANGO_ALLOW_ASYNC_UNSAFE"] = "true"

import re

import pytest
from django.contrib.auth import get_user_model
from playwright.sync_api import Page, expect

from gamedays.models import Gameday, Gameinfo, TeamLog
from gamedays.tests.setup_factories.db_setup import DBSetup
from gamedays.tests.setup_factories.factories import (
    GameinfoFactory,
    GameresultFactory,
    TeamFactory,
)

USERNAME = "scorecardv2official"
PASSWORD = "password123"

# The game list shows `Team.description`; the log and `PUT /possession` use
# `Team.name`. Keeping them different is what catches a start that sends the
# list label — the endpoint rejects it with a 400 and the game never opens.
HOME_NAME = "Heimteam Nord"
HOME_DESCRIPTION = "Heimteam Nord e.V."
AWAY_NAME = "Gastteam Sued"
AWAY_DESCRIPTION = "Gastteam Sued e.V."

JERSEY = 7


def _seed_game_today() -> Gameinfo:
    """A planned game today whose crew is the logged-in official.

    The games list asks `GET /api/gameday/<id>/officials/<team>` with the
    username as `team`, and the backend matches it against the *name* of the
    game's officials team.
    """
    db_setup = DBSetup()
    gameday = db_setup.create_empty_gameday()
    gameday.status = Gameday.STATUS_PUBLISHED
    gameday.save()

    crew = TeamFactory(
        name=f"Crew {USERNAME}",
        description="Crew of the scorecard v2 e2e official",
    )
    game = GameinfoFactory(
        gameday=gameday,
        field=1,
        scheduled="10:00",
        stage="Vorrunde",
        standing="Spiel 1",
        status=Gameinfo.STATUS_PUBLISHED,
        officials=crew,
    )
    GameresultFactory(
        gameinfo=game,
        team=TeamFactory(name=HOME_NAME, description=HOME_DESCRIPTION),
        isHome=True,
    )
    GameresultFactory(
        gameinfo=game,
        team=TeamFactory(name=AWAY_NAME, description=AWAY_DESCRIPTION),
        isHome=False,
    )
    return game


def _login(page: Page, live_server_url: str) -> None:
    get_user_model().objects.create_user(
        username=USERNAME, password=PASSWORD, email="official@example.com"
    )
    page.goto(f"{live_server_url}/login/")
    page.fill('input[name="username"]', USERNAME)
    page.fill('input[name="password"]', PASSWORD)
    page.click('button[type="submit"]')
    # Session auth redirects to the home page; the flow starts from v2 itself.
    expect(page).not_to_have_url(re.compile(r"/login/$"))


def _open_game(page: Page, live_server_url: str, gameday_name: str) -> None:
    """Gameday list → games → preparation, the tap path from the help topic."""
    page.goto(f"{live_server_url}/scorecard/v2/")
    expect(page.get_by_role("heading", name="Meine Spieltage")).to_be_visible(
        timeout=20000
    )
    page.locator("button.day-card", has_text=gameday_name).click()

    expect(page.get_by_role("heading", name=gameday_name)).to_be_visible(timeout=20000)
    rows = page.locator("button.game-row")
    expect(rows).to_have_count(1)
    expect(rows.first).to_contain_text(HOME_DESCRIPTION)
    expect(rows.first).to_contain_text(AWAY_DESCRIPTION)
    rows.first.click()

    expect(page.get_by_role("heading", name="Vorbereitung")).to_be_visible(
        timeout=20000
    )
    expect(page.get_by_role("heading", name="Offizielle")).to_be_visible()


@pytest.mark.django_db(transaction=True)
def test_scorecard_v2_flow_from_gameday_to_result(live_server, page: Page):
    game = _seed_game_today()
    gameday_name = game.gameday.name

    _login(page, live_server.url)
    _open_game(page, live_server.url, gameday_name)

    # ---- Start: officials, setup, opening possession and the log. ---------
    page.get_by_role("button", name="Spiel starten").click()
    expect(page.get_by_role("heading", name="Feld 1 · Vorrunde")).to_be_visible(timeout=30000)
    # The score header reads the team *names*, and the possession marker proves
    # the opening possession was accepted (the list label would have 400'd).
    board = page.get_by_role("region", name="Spielstand")
    possessing = board.get_by_role(
        "button", name=f"{HOME_NAME}, 0 Punkte, am Ball", exact=True
    )
    expect(possessing).to_be_visible()
    expect(possessing).to_have_attribute("aria-pressed", "true")

    # ---- Touchdown without a roster: the numeric fallback. ----------------
    page.locator("button.tdbtn").click()
    sheet = page.get_by_role("dialog", name="Wer hat gepunktet?")
    expect(sheet).to_be_visible()
    # No passcheck ran for this gameday, so there is no jersey grid — the sheet
    # must offer the number field instead of blocking the game.
    number = sheet.locator("input.sheetinput-num")
    expect(number).to_be_visible()
    number.fill(str(JERSEY))
    sheet.get_by_role("button", name="Speichern").click()

    expect(page.get_by_text("Touchdown gespeichert")).to_be_visible(timeout=20000)
    expect(page.get_by_role("dialog")).to_have_count(0)
    expect(page.get_by_text(f"Touchdown {HOME_NAME}", exact=True)).to_be_visible()
    expect(page.get_by_text(f"1 Extrapunkt {HOME_NAME}", exact=True)).to_be_visible()
    expect(page.get_by_text(f"#{JERSEY}", exact=True).first).to_be_visible()
    expect(
        page.get_by_role("region", name="Spielstand").get_by_text("7", exact=True)
    ).to_be_visible()

    # ---- Finalise: both captains, then the result. ------------------------
    page.get_by_role("button", name="Spielende und Bestätigung").click()
    expect(page.get_by_role("heading", name="Spielende")).to_be_visible(timeout=20000)
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
    expect(page.get_by_text("Spiel beendet")).to_be_visible()

    game.refresh_from_db()
    assert game.status.strip().lower() == "beendet"
    touchdown = TeamLog.objects.filter(gameinfo=game, event="Touchdown", player=JERSEY)
    assert touchdown.count() == 1
