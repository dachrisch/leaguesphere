"""Layout regressions from the Scorecard v2 layout & responsiveness review.

The review (07.11.2026, release 5.12.2) measured the app at nine widths and
found the breaks in the *height*: a phone on its side had no log and its
controls ran under the bottom edge, short phones kept only the log heading,
every log row was 119px tall and the saved strip covered the newest rows. It
also found Feld 2 hidden in the 900–1028px game list, a phone-sized penalty
dialog on a desktop and a preparation screen whose refusal reason sat under the
sticky start bar. Each test below pins one of those down at the sizes the
review used.
"""

import os

# Must be set before any Django imports: the test writes through the ORM while
# the live server serves the same database in another thread.
os.environ["DJANGO_ALLOW_ASYNC_UNSAFE"] = "true"

import pytest
from playwright.sync_api import Page, expect

from gamedays.models import Gameinfo
from gamedays.tests.setup_factories.factories import (
    GameinfoFactory,
    GameresultFactory,
    TeamFactory,
)
from test_scorecard_v2_flow import (
    _choose_start_fields,
    _login,
    _open_game,
    _seed_game_today,
    _tap_start,
)

# (width, height, fits without scrolling). The short upright phones may scroll
# the screen as a whole — that is the fallback that keeps two log entries —
# but nothing may be clipped.
TRACKING_SIZES = [
    (320, 568, False),
    (360, 640, False),
    (375, 667, False),
    (390, 844, True),
    (844, 390, True),
    (932, 430, True),
    (768, 1024, True),
    (900, 700, True),
    (1024, 768, True),
    (1440, 900, True),
]

TRACKING_CONTROLS = (
    ".tracking .tdbtn, .tracking .playbtn, .tracking .action, "
    ".tracking .possbtn, .tracking .halfbtn, .tracking .trackfoot .startbtn"
)

# Pairs of controls whose boxes intersect: two tap targets on top of each
# other (932×430 put the last tile row under the end buttons).
OVERLAPS = """selector => {
  const boxes = [...document.querySelectorAll(selector)]
    .map(el => ({ el, r: el.getBoundingClientRect() }))
    .filter(({ r }) => r.width > 0 && r.height > 0);
  const hits = [];
  for (let i = 0; i < boxes.length; i++) {
    for (let j = i + 1; j < boxes.length; j++) {
      const a = boxes[i].r, b = boxes[j].r;
      const x = Math.min(a.right, b.right) - Math.max(a.left, b.left);
      const y = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
      if (x > 1 && y > 1) {
        hits.push([boxes[i].el.textContent.trim(), boxes[j].el.textContent.trim()]);
      }
    }
  }
  return hits;
}"""


def _rect(page: Page, selector: str) -> dict:
    rect = page.evaluate(
        """s => { const r = document.querySelector(s).getBoundingClientRect();
                  return { top: r.top, bottom: r.bottom, left: r.left,
                           right: r.right, height: r.height }; }""",
        selector,
    )
    return rect


MEASURE_LOG = """() => {
  const rect = (el) => {
    if (el === null) return null;
    const r = el.getBoundingClientRect();
    return { top: r.top, bottom: r.bottom, left: r.left, right: r.right,
             height: r.height };
  };
  return {
    row: rect(document.querySelector('.logrows .row')),
    rows: rect(document.querySelector('.logrows')),
    strip: rect(document.querySelector('.trackok')),
  };
}"""


def _measure_log_and_strip(page: Page) -> dict:
    """One snapshot for row, log and strip.

    Read in a single round-trip: the strip's undo button arrives a moment after
    the entry, and anything that reflows in between would otherwise mix the
    geometry of two layouts into one assertion.
    """
    return page.evaluate(MEASURE_LOG)


def _start_with_entries(page: Page, live_server_url: str, entries: int) -> None:
    game = _seed_game_today()
    page.set_viewport_size({"width": 390, "height": 844})
    _login(page, live_server_url)
    _open_game(page, live_server_url, game.gameday.name)
    _choose_start_fields(page)
    _tap_start(page).get_by_role("button", name="Jetzt starten").click()
    expect(page.locator("button.tdbtn")).to_be_visible(timeout=30000)
    # Turnover saves in one tap and arms nothing, so it can be repeated. The
    # start itself is the first row.
    turnover = page.locator(".tracking .action", has_text="Turnover")
    for count in range(1, entries + 1):
        turnover.click()
        expect(page.locator(".logrows .row")).to_have_count(count + 1, timeout=20000)
    if entries > 0:
        expect(page.locator(".trackok")).to_be_visible()


@pytest.mark.django_db(transaction=True)
def test_scorecard_v2_tracking_keeps_log_and_controls_at_every_size(
    live_server, page: Page
):
    """F1, F2, F5: the log keeps two entries and every control stays reachable.

    Checked with the saved strip showing, which is the normal state during a
    game: it stays until the next entry.
    """
    _start_with_entries(page, live_server.url, 4)

    for width, height, fits in TRACKING_SIZES:
        size = (width, height)
        page.set_viewport_size({"width": width, "height": height})
        page.evaluate("() => { document.querySelector('.app-shell').scrollTop = 0; }")

        assert (
            page.evaluate("() => document.scrollingElement.scrollWidth") <= width
        ), size

        # F5: the row actions sit side by side, a row is one target high.
        geometry = _measure_log_and_strip(page)
        row, rows, strip = geometry["row"], geometry["rows"], geometry["strip"]
        assert row["height"] <= (76 if width < 360 else 62), (size, row)

        # F2/F1: at least two entries are visible in the log...
        assert rows["height"] >= 2 * row["height"] - 1, (size, rows, row)
        # ...and the saved strip no longer lies on top of them.
        side_by_side = (
            strip["left"] >= rows["right"] - 1 or strip["right"] <= rows["left"] + 1
        )
        assert side_by_side or strip["top"] >= rows["bottom"] - 1, (size, strip, rows)

        assert page.evaluate(OVERLAPS, TRACKING_CONTROLS) == [], size

        shell = page.evaluate("""() => { const s = document.querySelector('.app-shell');
                       return [s.scrollHeight, s.clientHeight]; }""")
        if fits:
            assert shell[0] <= shell[1] + 1, (size, shell)

        # Nothing is clipped: each control can be brought fully into view.
        controls = page.locator(TRACKING_CONTROLS)
        for index in range(controls.count()):
            control = controls.nth(index)
            if not control.is_visible():
                continue
            control.scroll_into_view_if_needed()
            box = control.bounding_box()
            assert box is not None, (size, index)
            assert box["y"] >= -1 and box["y"] + box["height"] <= height + 1, (
                size,
                control.text_content(),
                box,
            )


@pytest.mark.django_db(transaction=True)
def test_scorecard_v2_saved_strip_keeps_its_height(live_server, page: Page):
    """The strip's undo button lands a moment after the entry is saved.

    The strip must keep its height when it does: the log is sized to hand it one
    line, so a strip that grows as the button arrives (30.9px with the text
    alone, 48px with the button) takes that 17px back from the rows and can drop
    them under the strip's top edge.
    """
    _start_with_entries(page, live_server.url, 1)
    page.set_viewport_size({"width": 320, "height": 568})
    expect(page.locator(".trackok .trackok-actions")).to_be_visible(timeout=20000)

    heights = page.evaluate(
        """() => {
             const strip = document.querySelector('.trackok');
             const before = strip.getBoundingClientRect().height;
             strip.querySelector('.trackok-actions').remove();
             const after = strip.getBoundingClientRect().height;
             return { before, after };
           }"""
    )

    assert heights["after"] == pytest.approx(heights["before"], abs=0.5), heights


@pytest.mark.django_db(transaction=True)
def test_scorecard_v2_game_list_never_hides_a_field(live_server, page: Page):
    """F3: between 900 and 1040px the plan had no room for Feld 2.

    Those widths keep the one-column list; from 1040px both fields of the plan
    are in view without a sideways scroll.
    """
    game = _seed_game_today()
    second = GameinfoFactory(
        gameday=game.gameday,
        field=2,
        scheduled="10:00",
        stage="Vorrunde",
        standing="Spiel 2",
        status=Gameinfo.STATUS_PUBLISHED,
        officials=game.officials,
    )
    GameresultFactory(gameinfo=second, team=TeamFactory(name="Nord 2"), isHome=True)
    GameresultFactory(gameinfo=second, team=TeamFactory(name="Sued 2"), isHome=False)

    page.set_viewport_size({"width": 900, "height": 800})
    _login(page, live_server.url)
    page.goto(f"{live_server.url}/scorecard/v2/")
    page.locator("button.day-card", has_text=game.gameday.name).click()
    expect(page.get_by_role("heading", name=game.gameday.name)).to_be_visible(
        timeout=20000
    )

    for width in (900, 1024, 1028):
        page.set_viewport_size({"width": width, "height": 800})
        expect(page.get_by_role("region", name="Feldplan")).to_have_count(0)
        expect(page.locator("button.game-row")).to_have_count(2)

    for width in (1040, 1280, 1440):
        page.set_viewport_size({"width": width, "height": 800})
        plan = page.get_by_role("region", name="Feldplan")
        expect(plan).to_be_visible()
        expect(plan.get_by_role("heading", name="Feld 2")).to_be_visible()
        scroll = plan.evaluate("el => [el.scrollWidth, el.clientWidth]")
        assert scroll[0] <= scroll[1] + 1, (width, scroll)


@pytest.mark.django_db(transaction=True)
def test_scorecard_v2_penalty_dialog_uses_the_desktop(live_server, page: Page):
    """F4: from 1280px the penalty form opens wide and in two columns."""
    _start_with_entries(page, live_server.url, 0)

    page.set_viewport_size({"width": 1440, "height": 900})
    page.locator(".tracking .action", has_text="Strafe").click()
    dialog = page.get_by_role("dialog", name="Strafe")
    expect(dialog.get_by_role("group", name="Strafen")).to_be_visible(timeout=20000)

    box = dialog.bounding_box()
    assert box is not None
    assert 900 <= box["width"] <= 961, box
    # The fields that sat under the scroll edge are in view without scrolling.
    body = dialog.locator(".sheetbody").bounding_box()
    assert body is not None
    for group in ("Gegen wen?", "Nächster Versuch"):
        target = dialog.get_by_role("group", name=group).bounding_box()
        assert target is not None, group
        assert target["y"] + target["height"] <= body["y"] + body["height"], group

    # A tablet keeps the 680px dialog.
    page.set_viewport_size({"width": 1024, "height": 768})
    box = dialog.bounding_box()
    assert box is not None
    assert abs(box["width"] - 680) <= 1, box


@pytest.mark.django_db(transaction=True)
def test_scorecard_v2_start_bar_says_why_it_is_refused(live_server, page: Page):
    """F6: the reason sat under the sticky start bar at 1024×768."""
    game = _seed_game_today()
    page.set_viewport_size({"width": 1024, "height": 768})
    _login(page, live_server.url)
    _open_game(page, live_server.url, game.gameday.name)

    why = page.locator(".setupfoot .setupfoot-why")
    expect(why).to_contain_text("Noch offen:")
    expect(why).to_be_in_viewport(ratio=1)

    _choose_start_fields(page)
    expect(why).to_have_count(0)
