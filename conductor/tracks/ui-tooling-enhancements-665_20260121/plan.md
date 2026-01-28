# Plan: UI & Tooling Enhancements

## Phase 0: Critical Bugfixes
Address issues found during Phase 1 & 2 manual validation.

- [x] Task: Fix Disappearing Validation Popover [647a978b]
    - [x] Ensure the popover stays open when hovered and allows interaction (clicking items).
    - [x] Added 10px offset to bridge gaps and prevent flickering.
- [x] Task: Restore Metadata Warnings UI [647a978b]
    - [x] Investigate why 'Venue missing' and 'Date in past' warnings don't trigger the warning badge.
- [x] Task: Verify Localization of Metadata Placeholders [647a978b]
    - [x] Ensure 'Season' and 'League' select placeholders use translated strings.
- [x] Task: Fix Localization of Dynamic Team References [647a978b]
    - [x] Resolve raw keys `label.ranking` and `message.placeingroup` showing in Game Table.
- [x] Task: Fix Officials Group Auto-Creation [647a978b]
    - [x] Ensure "External Officials" group is created even when an initial state exists (but group is missing).
    - [x] Fixed visibility in sidebar even when group is empty.
- [x] Task: Fix Database Team Connection UI [647a978b]
    - [x] Investigate why the Link icon is missing from team group headers.
    - [x] Improved button visibility (outline-secondary).

## Phase 1: Action Polish
Reposition and rebrand the generation action.

- [ ] Task: Rebrand and Move Generation Button (#691)
    - [ ] Update translation keys in `ui.json`.
    - [ ] Relocate button from `FlowToolbar.tsx` or `GamedayDashboard.tsx` to the preferred layout position (next to "Create Gameday").
- [ ] Task: Filter Gameday Display (#706)
    - [ ] Filter gameday list to show only future designer-created gamedays.
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
