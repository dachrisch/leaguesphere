"""End-to-end walk through /scorecard/v2/ in a real browser.

Seeds one gameday for today with a single game, logs in as the official whose
crew runs it, and drives the whole flow: gameday → game → preparation → start
confirmation → tracking → touchdown → finalise → result. The API behaviour is
covered by the unit and view tests; this one proves the click path a referee
actually uses.

Two paths matter here, because the preparation refuses incomplete input:

- the happy path, with a full crew and the three start fields chosen, needs
  exactly two taps on **Spiel starten** / **Jetzt starten**;
- a game without a crew cannot be started at all: the sheet names the missing
  positions and nothing leaves the device.
"""

import os

# Must be set before any Django imports: the test writes through the ORM while
# the live server serves the same database in another thread.
os.environ["DJANGO_ALLOW_ASYNC_UNSAFE"] = "true"

import re

import pytest
from django.contrib.auth import get_user_model
from playwright.sync_api import Page, expect

from gamedays.models import GameSetup, Gameday, Gameinfo, Team, TeamLog
from gamedays.tests.setup_factories.db_setup import DBSetup
from gamedays.tests.setup_factories.factories import (
    GameinfoFactory,
    GameOfficialFactory,
    GameresultFactory,
    TeamFactory,
)
from officials.tests.setup_factories.factories_officials import (
    OfficialFactory,
    OfficialLicenseFactory,
    OfficialLicenseHistoryFactory,
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

# The four positions the built-in crew configuration requires (Scorecard Judge
# is the optional fifth). The start refuses an empty required slot, so the game
# needs one official per position or the confirmation blocks it.
REQUIRED_POSITIONS = ["Referee", "Down Judge", "Field Judge", "Side Judge"]
CREW_NAMES = [
    ("Michael", "Klein"),
    ("Anna", "Richter"),
    ("Tom", "Weber"),
    ("Sabine", "Lang"),
]


def _seed_crew(game: Gameinfo, team: Team) -> None:
    """A complete crew whose licences are valid today.

    `GET /api/officials/team/<id>/list` resolves each official's licence from
    the F1-F4 history, and an F2 course dated today is valid for 365 days — so
    the preparation shows no licence warning and the start stays a plain
    two-tap confirmation. The officials must belong to the game's officials
    team, because that is the list the screen loads.
    """
    license_f2 = OfficialLicenseFactory(name="F2")
    for position, (first_name, last_name) in zip(REQUIRED_POSITIONS, CREW_NAMES):
        official = OfficialFactory(
            first_name=first_name, last_name=last_name, team=team
        )
        OfficialLicenseHistoryFactory(license=license_f2, official=official)
        GameOfficialFactory(gameinfo=game, position=position, official=official)


def _seed_game_today(with_crew: bool = True) -> Gameinfo:
    """A planned game today whose crew team is the logged-in official's.

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
    if with_crew:
        _seed_crew(game, crew)
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

    expect(page.get_by_role("heading", name="Spiel vorbereiten")).to_be_visible(
        timeout=20000
    )
    expect(page.get_by_role("heading", name="Offizielle")).to_be_visible()


def _choose_start_fields(page: Page) -> None:
    """Toss, first possession and direction: no default, all three required.

    The segment buttons are `role="group"` with the screen's own labels, and
    each option is named like the team it stores (the list's description).
    """
    page.get_by_role("group", name="Münzwurf gewonnen von").get_by_role(
        "button", name=HOME_DESCRIPTION, exact=True
    ).click()
    page.get_by_role("group", name="Erster Ballbesitz").get_by_role(
        "button", name=HOME_DESCRIPTION, exact=True
    ).click()
    # The arrow is a drawn SVG with an sr-only "→", so the accessible name is
    # "Ost → West"; the pattern tolerates whitespace normalisation and a missing
    # arrow glyph while still pinning the direction.
    page.get_by_role("group", name="Spielrichtung").get_by_role(
        "button", name=re.compile(r"^Ost\s*→?\s*West$")
    ).click()


def _tap_start(page: Page):
    """First tap: opens the confirmation sheet, writes nothing."""
    page.get_by_role("button", name="Spiel starten").click()
    sheet = page.get_by_role("dialog", name="Spiel starten")
    expect(sheet).to_be_visible()
    return sheet


@pytest.mark.django_db(transaction=True)
def test_scorecard_v2_flow_from_gameday_to_result(live_server, page: Page):
    game = _seed_game_today()
    gameday_name = game.gameday.name

    _login(page, live_server.url)
    _open_game(page, live_server.url, gameday_name)
    # The seeded crew counts as complete: no required slot is empty, so the only
    # thing between the tap and the game is the confirmation.
    expect(page.get_by_text("4/4 besetzt", exact=True)).to_be_visible()
    _choose_start_fields(page)

    # ---- Start: confirmation, then officials, setup, possession and the log.
    sheet = _tap_start(page)
    # The sheet restates the crew it is about to write, and no licence warning
    # is in the way: the footer starts instead of asking "Trotzdem starten".
    expect(sheet.get_by_text("Michael Klein")).to_be_visible()
    expect(sheet.get_by_text("Lizenz ist nicht gültig")).to_have_count(0)
    expect(sheet.get_by_role("button", name="Trotzdem starten")).to_have_count(0)
    sheet.get_by_role("button", name="Jetzt starten").click()

    expect(page.get_by_role("heading", name="Feld 1 · Vorrunde")).to_be_visible(
        timeout=30000
    )
    expect(page.get_by_role("dialog")).to_have_count(0)
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
    touchdown_sheet = page.get_by_role("dialog", name="Wer hat gepunktet?")
    expect(touchdown_sheet).to_be_visible()
    # No passcheck ran for this gameday, so there is no jersey grid — the sheet
    # must offer the number field instead of blocking the game.
    number = touchdown_sheet.locator("input.sheetinput-num")
    expect(number).to_be_visible()
    number.fill(str(JERSEY))
    touchdown_sheet.get_by_role("button", name="Speichern").click()

    expect(page.get_by_text("Touchdown gespeichert")).to_be_visible(timeout=20000)
    expect(page.get_by_role("dialog")).to_have_count(0)
    expect(page.get_by_text(f"Touchdown {HOME_NAME}", exact=True)).to_be_visible()
    expect(page.get_by_text(f"1 Extrapunkt {HOME_NAME}", exact=True)).to_be_visible()
    expect(page.get_by_text(f"#{JERSEY}", exact=True).first).to_be_visible()
    expect(
        page.get_by_role("region", name="Spielstand").get_by_text("7", exact=True)
    ).to_be_visible()

    # ---- Finalise: both captains, then the result. ------------------------
    page.get_by_role("button", name="Spiel beenden").click()
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


@pytest.mark.django_db(transaction=True)
def test_scorecard_v2_start_is_refused_without_a_crew(live_server, page: Page):
    """The confirmation refuses instead of starting: the crew is empty.

    This is the prepared-but-incomplete game the review asked for: the sheet
    names the missing positions and the missing start fields, its action stays
    disabled, and closing it leaves the app — and the database — untouched.
    """
    game = _seed_game_today(with_crew=False)
    gameday_name = game.gameday.name

    _login(page, live_server.url)
    _open_game(page, live_server.url, gameday_name)

    sheet = _tap_start(page)

    # The reasons live in the sheet's live region, at the top of the body.
    blockers = sheet.get_by_role("alert")
    expect(blockers).to_be_visible()
    expect(blockers).to_contain_text("Start nicht möglich")
    expect(blockers).to_contain_text(
        "Offizielle: Schiedsrichter fehlt – die Liga verlangt diese Position."
    )
    expect(blockers).to_contain_text(
        "Münzwurf gewonnen von: keine Mannschaft gewählt."
    )
    expect(blockers).to_contain_text("Erster Ballbesitz: keine Mannschaft gewählt.")
    expect(blockers).to_contain_text("Spielrichtung: keine Seite gewählt.")

    blocked = sheet.get_by_role("button", name="Angaben fehlen")
    expect(blocked).to_be_disabled()
    expect(sheet.get_by_role("button", name="Jetzt starten")).to_have_count(0)

    sheet.get_by_role("button", name="Schließen").click()
    expect(page.get_by_role("dialog")).to_have_count(0)
    # Nothing left the device: a write would have opened tracking (the start
    # navigates on success), so the preparation still being on screen is the
    # visible proof. The database check below makes it explicit.
    expect(page.get_by_role("heading", name="Spiel vorbereiten")).to_be_visible()
    expect(page.get_by_role("button", name="Spiel starten")).to_be_enabled()

    assert not GameSetup.objects.filter(gameinfo=game).exists()
    game.refresh_from_db()
    assert game.status.strip().lower() != "beendet"
