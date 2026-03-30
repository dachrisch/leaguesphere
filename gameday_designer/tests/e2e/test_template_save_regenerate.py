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

    # Apply — advances to the TeamPicker step
    import re as _re
    expect(page.get_by_test_id("apply-template-button")).to_be_visible(timeout=5000)
    page.get_by_test_id("apply-template-button").click()

    # TeamPickerStep dialog appears; no league teams exist so auto-generate placeholder teams
    expect(page.get_by_text("Select Teams")).to_be_visible(timeout=5000)
    page.get_by_role("button", name=_re.compile(r"Auto-generate")).click()

    apply_btn = page.get_by_role("button", name=_re.compile(r"Apply to Gameday"))
    expect(apply_btn).to_be_enabled(timeout=10000)
    apply_btn.click()
    expect(page.get_by_text("Select Teams")).not_to_be_visible(timeout=5000)

    # Wait for auto-save debounce
    page.wait_for_timeout(2000)

    # Snapshot the game, team, stage, and progression counts
    expect(page.locator('tr[id^="game-"]').first).to_be_visible(timeout=5000)
    expected_game_count = page.locator('tr[id^="game-"]').count()
    expected_team_count = page.locator('.team-group-card [id^="team-"]').count()
    expected_stage_count = page.locator('.stage-section[id^="stage-"]').count()
    # Progression slots show winner (⚡) or loser (💔) labels in the react-select value
    expected_progression_count = page.locator('table').filter(
        has_text=_re.compile(r'[⚡💔]')
    ).count()
    assert expected_game_count > 0, "Built-in template should produce at least one game"
    assert expected_team_count > 0, "Built-in template should produce at least one team"
    assert expected_stage_count > 0, "Built-in template should produce at least one stage"
    assert expected_progression_count > 0, "Built-in template should produce at least one progression slot"

    # Assign an official to the first game to exercise the save/restore cycle
    page.get_by_test_id("add-officials-button").click()
    page.wait_for_timeout(500)
    # Add a team to the officials group - use the "Add your first team" button (empty group)
    page.locator('#group-group-officials').get_by_title("Add your first team to this group").click()
    page.wait_for_timeout(500)
    # Open the official select on the first game and pick the new team (first non-disabled option)
    first_game_row = page.locator('tr[id^="game-"]').first
    first_game_row.locator('.official-select__control').click()
    page.locator('.official-select__option[aria-disabled="false"]').first.click()
    page.wait_for_timeout(1000)

    # Snapshot officials count (games with a selected official shown in the single-value slot)
    expected_official_count = page.locator('tr[id^="game-"] .official-select__single-value').count()
    assert expected_official_count > 0, "Should have at least one game with an official assigned"

    # Snapshot times count (game rows whose time cell shows a real HH:MM time, not '--:--')
    expected_time_count = page.locator('tr[id^="game-"] > td:nth-child(2)').filter(
        has_not_text='--:--'
    ).count()
    assert expected_time_count > 0, "Built-in template should produce games with calculated start times"

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

    # ---- Phase 5: Regenerate from the saved custom template -----------------
    page.get_by_test_id("open-template-library-button").click()
    expect(page.get_by_text("Template Library")).to_be_visible(timeout=5000)

    # The saved template should appear in the list
    expect(page.get_by_text("My E2E Template")).to_be_visible(timeout=10000)
    page.get_by_text("My E2E Template").click()

    # Apply the saved template — advances to TeamPicker step
    expect(page.get_by_test_id("apply-template-button")).to_be_visible(timeout=5000)
    page.get_by_test_id("apply-template-button").click()

    # TeamPickerStep: auto-generate placeholder teams and confirm
    expect(page.get_by_text("Select Teams")).to_be_visible(timeout=5000)
    page.get_by_role("button", name=_re.compile(r"Auto-generate")).click()

    apply_btn = page.get_by_role("button", name=_re.compile(r"Apply to Gameday"))
    expect(apply_btn).to_be_enabled(timeout=10000)
    apply_btn.click()

    # Template Library should close after applying
    expect(page.get_by_text("Select Teams")).not_to_be_visible(timeout=5000)

    # No error notification should appear (catches HTTP 400 "Template has no slots defined")
    expect(page.get_by_text("Failed to apply template")).not_to_be_visible(timeout=3000)

    # ---- Phase 6: Assert schedule was recreated ------------------------------
    # Games must reappear in the designer canvas (catches empty-canvas bug where
    # the apply endpoint succeeds but the designer state is not refreshed)
    expect(page.locator('tr[id^="game-"]').first).to_be_visible(timeout=10000)
    actual_game_count = page.locator('tr[id^="game-"]').count()
    assert actual_game_count == expected_game_count, (
        f"Regenerated schedule should have {expected_game_count} games, got {actual_game_count}"
    )

    # Teams must also reappear (catches partial-restore where games load but team pool is empty)
    actual_team_count = page.locator('.team-group-card [id^="team-"]').count()
    assert actual_team_count == expected_team_count, (
        f"Regenerated schedule should have {expected_team_count} teams, got {actual_team_count}"
    )

    # Stage count must match (catches templates saved/restored without all stages)
    actual_stage_count = page.locator('.stage-section[id^="stage-"]').count()
    assert actual_stage_count == expected_stage_count, (
        f"Regenerated schedule should have {expected_stage_count} stages, got {actual_stage_count}"
    )

    # Progression slots (winner/loser references between stages) must be filled
    # (catches templates where game structure is restored but cross-stage edges are dropped)
    actual_progression_count = page.locator('table').filter(
        has_text=_re.compile(r'[⚡💔]')
    ).count()
    assert actual_progression_count == expected_progression_count, (
        f"Regenerated schedule should have {expected_progression_count} filled progression slots, "
        f"got {actual_progression_count}"
    )

    # Officials must be restored (catches templates saved/restored without officials)
    actual_official_count = page.locator('tr[id^="game-"] .official-select__single-value').count()
    assert actual_official_count == expected_official_count, (
        f"Regenerated schedule should have {expected_official_count} games with officials, "
        f"got {actual_official_count}"
    )

    # Start times must be preserved (catches templates where startTime is dropped on regeneration)
    actual_time_count = page.locator('tr[id^="game-"] > td:nth-child(2)').filter(
        has_not_text='--:--'
    ).count()
    assert actual_time_count == expected_time_count, (
        f"Regenerated schedule should have {expected_time_count} games with start times, "
        f"got {actual_time_count}"
    )
