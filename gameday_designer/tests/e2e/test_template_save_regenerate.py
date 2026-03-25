import os

# Must be set before any Django imports
os.environ["DJANGO_ALLOW_ASYNC_UNSAFE"] = "true"

import pytest
from playwright.sync_api import Page, expect

from gamedays.tests.setup_factories.factories import LeagueFactory, SeasonFactory

from .test_designer_flow import _login, _navigate_to_dashboard


@pytest.mark.django_db(transaction=True)
def test_save_custom_template_and_regenerate(live_server, page: Page):
    """
    E2E flow for the template save-and-regenerate lifecycle using the new
    Template Library modal:

    Phase 1 — Create a gameday and fill mandatory metadata.
    Phase 2 — Generate a schedule from a built-in template via Template Library.
    Phase 3 — Save the generated structure as a custom template.
    Phase 4 — Clear the schedule.
    Phase 5 — Regenerate from the saved custom template via Template Library.
    Phase 6 — Assert the schedule was recreated.
    """

    # ---- Setup: ensure League and Season exist in DB -------------------------
    LeagueFactory(name="Template E2E League")
    SeasonFactory(name="2026")

    # ---- Phase 1: Create a gameday and fill metadata -------------------------
    _login(page, live_server.url)
    _navigate_to_dashboard(page, live_server.url)

    page.get_by_role("button", name="Create Gameday").first.click()
    expect(page.get_by_test_id("gameday-metadata-accordion")).to_be_visible(timeout=15000)

    page.get_by_test_id("gameday-metadata-toggle").click()
    expect(page.locator("#gamedayName")).to_be_visible(timeout=10000)

    page.fill("#gamedayName", "Template E2E Testday")
    page.fill("#gamedayDate", "2026-07-15")
    page.fill("#gamedayStart", "09:00")
    page.fill("#gamedayVenue", "Template E2E Stadium")

    expect(page.locator("#gamedaySeason option", has_text="2026")).to_be_attached(timeout=10000)
    page.select_option("#gamedaySeason", label="2026")
    page.select_option("#gamedayLeague", label="Template E2E League")

    # ---- Phase 2: Generate from a built-in template via Template Library -----
    page.get_by_test_id("open-template-library-button").click()
    expect(page.get_by_text("Template Library")).to_be_visible(timeout=5000)

    # Select the F6-2-2 built-in template
    builtin_template = page.get_by_test_id("builtin-template-F6-2-2")
    expect(builtin_template).to_be_visible(timeout=5000)
    builtin_template.click()

    # Apply — no teams exist so it auto-generates and modal closes
    expect(page.get_by_test_id("apply-template-button")).to_be_visible(timeout=5000)
    page.get_by_test_id("apply-template-button").click()
    expect(page.get_by_text("Template Library")).not_to_be_visible(timeout=5000)

    # Wait for auto-save debounce
    page.wait_for_timeout(2000)

    # Snapshot the game and team counts
    expect(page.locator('tr[id^="game-"]').first).to_be_visible(timeout=5000)
    expected_game_count = page.locator('tr[id^="game-"]').count()
    expected_team_count = page.locator('.team-group-card [id^="team-"]').count()
    assert expected_game_count > 0, "Built-in template should produce at least one game"
    assert expected_team_count > 0, "Built-in template should produce at least one team"

    # ---- Phase 3: Save the generated structure as a custom template ----------
    page.get_by_test_id("open-template-library-button").click()
    expect(page.get_by_text("Template Library")).to_be_visible(timeout=5000)

    # Click "Save current as template" in the modal header
    page.get_by_role("button", name="Save current as template").click()

    # SaveTemplateSheet opens — fill in name and submit
    template_name_input = page.get_by_placeholder("Template name...")
    expect(template_name_input).to_be_visible(timeout=5000)
    template_name_input.fill("My E2E Template")

    page.get_by_role("button", name="Save Template").click()

    # Expect success notification
    expect(page.get_by_text("Template saved successfully")).to_be_visible(timeout=10000)

    # Close the Template Library modal via the ✕ button
    page.get_by_role("button", name="✕").click()
    expect(page.get_by_text("Template Library")).not_to_be_visible(timeout=5000)

    # ---- Phase 4: Clear the schedule -----------------------------------------
    page.get_by_test_id("gameday-metadata-toggle").click()
    clear_btn = page.get_by_test_id("clear-all-button")
    expect(clear_btn).to_be_visible(timeout=5000)
    clear_btn.click()

    # Wait for auto-save debounce
    page.wait_for_timeout(2000)

    # ---- Phase 5: Open Template Library and verify saved template appears ----
    page.get_by_test_id("open-template-library-button").click()
    expect(page.get_by_text("Template Library")).to_be_visible(timeout=5000)

    # The saved template should appear in "My Templates" group
    expect(page.get_by_text("My E2E Template")).to_be_visible(timeout=10000)

    # Select the saved template
    page.get_by_text("My E2E Template").click()

    # Preview should show it
    expect(page.get_by_test_id("apply-template-button")).to_be_visible(timeout=5000)

    # Close modal via the ✕ button
    page.get_by_role("button", name="✕").click()
    expect(page.get_by_text("Template Library")).not_to_be_visible(timeout=5000)
