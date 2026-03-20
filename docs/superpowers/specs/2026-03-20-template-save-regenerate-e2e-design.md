# E2E Test: Template Save and Regenerate Flow

**Date:** 2026-03-20
**Feature:** Gameday Designer — generate from built-in template, save as own, clear, regenerate from own

---

## Goal

A single integration test that exercises the complete template lifecycle in the Gameday Designer:
1. Open the tournament generator modal on a new gameday
2. Save the current schedule configuration as a custom template
3. Generate a schedule from a built-in template
4. Clear the schedule
5. Reopen the generator and regenerate from the saved custom template

This validates that the custom template is persisted, appears in the modal on subsequent opens, and can be used to regenerate a schedule — all within one continuous user flow.

---

## File

**New file:** `gameday_designer/src/components/__tests__/TemplateSaveAndRegenerate.integration.test.tsx`

---

## Setup

### Render Pattern

Matches the existing `ListDesignerApp-e2e.test.tsx` pattern:

```tsx
render(
  <MemoryRouter initialEntries={['/designer/1']}>
    <GamedayProvider>
      <AppHeader />
      <Routes>
        <Route path="/designer/:id" element={<ListDesignerApp />} />
      </Routes>
    </GamedayProvider>
  </MemoryRouter>
);
await waitFor(() => expect(screen.queryByRole('status')).not.toBeInTheDocument(), { timeout: 15000 });
```

### Initial State

The gameday starts with existing nodes so that `validation.isValid = true` (required to enable the "Save as Template" button):

- 1 field node
- 1 stage node (child of field)
- 2 game nodes (children of stage)
- `status: 'DRAFT'`

### API Mocks

| API call | Return value | Notes |
|---|---|---|
| `gamedayApi.getGameday` | Gameday with DRAFT status | Standard fixture |
| `gamedayApi.getDesignerState` | State with field/stage/game nodes | Enables save button |
| `gamedayApi.saveData` | Resolves OK | Auto-save during generation |
| `gamedayApi.getTemplates` — call 1 | `[]` | No custom templates initially |
| `gamedayApi.getTemplates` — call 2 | `[savedCustomTemplate]` | After save, template appears |
| `gamedayApi.saveTemplate` | Returns `savedCustomTemplate` | The save-from-designer endpoint |

The `getTemplates` mock uses `mockResolvedValueOnce` for call 1 and `mockResolvedValue` for call 2 so the second open automatically picks up the new template.

---

## Test Steps

```
Step 1:  render app → waitFor loading spinner gone
Step 2:  click [data-testid="generate-tournament-button"]
Step 3:  waitFor modal to appear (role="dialog")
Step 4:  click "Save as Template" button (ui:button.saveAsTemplate text)
Step 5:  waitFor SaveTemplateModal sub-modal to appear
Step 6:  type template name ("My Custom Template") into name field
Step 7:  click save/confirm button in SaveTemplateModal
Step 8:  assert gamedayApi.saveTemplate called with name "My Custom Template"
Step 9:  waitFor SaveTemplateModal to close (back in generator modal)
Step 10: click first built-in template card (auto-selects it)
Step 11: click "Generate teams automatically" radio/checkbox
         (bypasses team-count validation — no teams in test data)
Step 12: click [data-testid="confirm-generate-button"]
Step 13: waitFor modal to close
Step 14: assert schedule was generated (gamedayApi.saveData called)
Step 15: open GamedayMetadataAccordion
         (click [data-testid="gameday-metadata-toggle"])
Step 16: click [data-testid="clear-all-button"]
Step 17: waitFor confirmation → confirm clear
Step 18: assert canvas is cleared (saveData called with empty nodes)
Step 19: click [data-testid="generate-tournament-button"]
Step 20: waitFor modal to appear
Step 21: waitFor custom template card with name "My Custom Template" to appear
         in "Eigene Vorlagen" / "Custom Templates" section
Step 22: click the custom template card
Step 23: click [data-testid="confirm-generate-button"]
Step 24: waitFor modal to close
Step 25: assert gamedayApi.saveData called again (schedule regenerated)
```

---

## Assertions Summary

| Step | Assertion |
|---|---|
| 8 | `gamedayApi.saveTemplate` called with `{ name: "My Custom Template", ... }` |
| 14 | `gamedayApi.saveData` called at least once after generation |
| 18 | `gamedayApi.saveData` called with state containing empty nodes |
| 21 | Custom template card text "My Custom Template" visible in modal |
| 25 | `gamedayApi.saveData` called again (regeneration triggered auto-save) |

---

## What This Test Does NOT Cover

- Server-side persistence (covered by `test_api.py`)
- Template sharing/visibility rules (covered by `test_template_sharing.py`)
- Error paths (save failure, generation failure)
- Publishing the gameday before regeneration

---

## Dependencies

- `@testing-library/user-event` for realistic click/type events
- `vitest` mocks for `gamedayApi`
- Existing `testConfig` for i18n setup (same as other tests)
- No new test utilities needed
