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
    Full E2E flow for the template save-and-regenerate lifecycle:

    Phase 1 — Create a gameday and fill mandatory metadata.
    Phase 2 — Generate a schedule from a built-in template (first pass).
    Phase 3 — Save the generated structure as a custom template.
    Phase 4 — Clear the schedule.
    Phase 5 — Regenerate from the saved custom template.
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

    # ---- Phase 2: Generate from a built-in template (first pass) -------------
    page.get_by_test_id("generate-tournament-button").click()
    expect(page.get_by_role("dialog")).to_be_visible(timeout=5000)

    # Select the first built-in template (F6 2-field 2-group)
    builtin_template = page.get_by_test_id("builtin-template-F6-2-2")
    expect(builtin_template).to_be_visible(timeout=5000)
    builtin_template.click()

    # Enable "Generate teams automatically" so team-count validation passes
    generate_teams = page.locator("#generate-teams")
    expect(generate_teams).to_be_enabled(timeout=3000)
    if not generate_teams.is_checked():
        generate_teams.click()

    confirm_btn = page.get_by_test_id("confirm-generate-button")
    expect(confirm_btn).to_be_enabled(timeout=3000)
    confirm_btn.click()

    # Modal closes after confirming
    expect(page.get_by_role("dialog")).not_to_be_visible(timeout=5000)

    # Wait for auto-save debounce (1.5 s) to complete
    page.wait_for_timeout(2000)

    # Snapshot the game and team counts produced by the built-in template.
    # Phase 5 must reproduce exactly these numbers — neither more (additive bug)
    # nor fewer (data-loss bug).
    expect(page.locator('tr[id^="game-"]').first).to_be_visible(timeout=5000)
    expected_game_count = page.locator('tr[id^="game-"]').count()
    expected_team_count = page.locator('.team-group-card [id^="team-"]').count()
    assert expected_game_count > 0, "Built-in template should produce at least one game"
    assert expected_team_count > 0, "Built-in template should produce at least one team"

    # Snapshot assigned team slots (.react-select__single-value is present only when a
    # team is selected; empty slots show .react-select__placeholder instead).
    expect(page.locator('tr[id^="game-"] .react-select__single-value').first).to_be_visible(timeout=5000)
    expected_assigned_slots = page.locator('tr[id^="game-"] .react-select__single-value').count()
    assert expected_assigned_slots > 0, "Phase 2 games should have team assignments"

    # ---- Phase 3: Save the generated structure as a custom template ----------
    page.get_by_test_id("generate-tournament-button").click()
    expect(page.get_by_role("dialog")).to_be_visible(timeout=5000)

    # save-as-template-button is enabled only when isValid=true (metadata filled)
    # and a schedule is present in the canvas
    save_btn = page.get_by_test_id("save-as-template-button")
    expect(save_btn).to_be_enabled(timeout=5000)
    save_btn.click()

    # SaveTemplateModal opens (dialog is still open / new dialog)
    template_name_input = page.get_by_test_id("template-name-input")
    expect(template_name_input).to_be_visible(timeout=5000)
    template_name_input.fill("My E2E Template")

    page.get_by_test_id("save-template-submit-button").click()

    # Expect success toast
    expect(page.get_by_text("Template saved successfully")).to_be_visible(timeout=10000)

    # SaveTemplateModal calls onHide() after onSave() resolves; wait for it to
    # disappear before clicking Cancel on TournamentGeneratorModal so we don't
    # get a strict-mode violation from two "Cancel" buttons being visible.
    expect(page.get_by_test_id("template-name-input")).not_to_be_visible(timeout=5000)

    # Close TournamentGeneratorModal via its link-style Cancel button
    page.get_by_role("button", name="Cancel").click()
    expect(page.get_by_role("dialog")).not_to_be_visible(timeout=5000)

    # ---- Phase 4: Clear the schedule -----------------------------------------
    # Expand the metadata accordion so the Clear All button is accessible
    page.get_by_test_id("gameday-metadata-toggle").click()
    clear_btn = page.get_by_test_id("clear-all-button")
    expect(clear_btn).to_be_visible(timeout=5000)
    clear_btn.click()

    # Wait for auto-save debounce (1.5 s) to complete
    page.wait_for_timeout(2000)

    # ---- Phase 5: Regenerate from the saved custom template ------------------
    page.get_by_test_id("generate-tournament-button").click()
    expect(page.get_by_role("dialog")).to_be_visible(timeout=5000)

    # The custom template ID is server-assigned — match by data-testid prefix
    custom_template = page.locator('[data-testid^="custom-template-"]').first
    expect(custom_template).to_be_visible(timeout=10000)
    custom_template.click()

    generate_teams2 = page.locator("#generate-teams")
    expect(generate_teams2).to_be_enabled(timeout=3000)
    if not generate_teams2.is_checked():
        generate_teams2.click()

    confirm_btn2 = page.get_by_test_id("confirm-generate-button")
    expect(confirm_btn2).to_be_enabled(timeout=3000)
    confirm_btn2.click()

    # Modal closes after confirming
    expect(page.get_by_role("dialog")).not_to_be_visible(timeout=5000)

    # ---- Phase 6: Assert game and team counts match the original generation --
    expect(page.locator('tr[id^="game-"]').first).to_be_visible(timeout=10000)
    expect(page.locator('tr[id^="game-"]')).to_have_count(expected_game_count)
    expect(page.locator('.team-group-card [id^="team-"]')).to_have_count(expected_team_count)
    expect(page.locator('tr[id^="game-"] .react-select__single-value')).to_have_count(expected_assigned_slots)
