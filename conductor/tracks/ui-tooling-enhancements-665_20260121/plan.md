# Plan: UI & Tooling Enhancements

## Phase 1: Action Polish
Reposition and rebrand the generation action.

- [ ] Task: Rebrand and Move Generation Button (#691)
    - [ ] Update translation keys in `ui.json`.
    - [ ] Relocate button from `FlowToolbar.tsx` or `GamedayDashboard.tsx` to the preferred layout position (next to "Create Gameday").
- [ ] Task: Conductor - User Manual Verification 'Phase 1: Action Polish' (Protocol in workflow.md)

## Phase 2: Template Tooling (TDD)
Implement the structured export feature.

- [ ] Task: Implement Structure Export (#674)
    - [ ] Create a new export utility `templateExport.ts` that strips gameday-specific data (IDs, dates) and keeps structural mapping.
    - [ ] Add the trigger to the UI and connect it to the utility.
    - [ ] Write unit tests verifying the exported JSON structure.
- [ ] Task: Final Quality Gate
    - [ ] Run full test suite.
    - [ ] Run production build.
- [ ] Task: Conductor - User Manual Verification 'Phase 2: Template Tooling' (Protocol in workflow.md)
