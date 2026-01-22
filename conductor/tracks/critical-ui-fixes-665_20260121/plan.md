# Plan: Critical UI & Navigation Fixes

## Phase 1: Navigation and Layout Fixes
Address the disappearing navigation bar and overlapping buttons.

- [x] Task: Fix Navigation Bar Disappearance (#692)
    - [x] Create reproduction test case in Vitest (if possible) or perform manual verification of CSS z-index/positioning.
    - [x] Identify if React Bootstrap Select/Portal is causing layout shifts.
    - [x] Fix positioning logic in `AppHeader.tsx` or `ListDesignerApp.tsx`.
- [x] Task: Fix Publish Button Overlap (#695)
    - [x] Audit `GamedayMetadataAccordion.tsx` styling.
    - [x] Adjust CSS/Bootstrap classes to ensure button and date labels have sufficient spacing.
- [ ] Task: Conductor - User Manual Verification 'Phase 1: Navigation and Layout Fixes' (Protocol in workflow.md)

## Phase 2: Hover State Polish
Address reorder button hover issues.

- [x] Task: Polish Reorder Buttons (#680)
    - [x] Update `TeamGroupCard.tsx` and `GlobalTeamTable.tsx` to use correct translation keys for tooltips.
    - [x] Remove or stabilize the `transform: scale` or similar growth effect in CSS.
- [x] Task: Final Quality Gate
    - [x] Run `npm run test:run` in `gameday_designer/`.
    - [x] Run `npm run eslint`.
- [ ] Task: Conductor - User Manual Verification 'Phase 2: Hover State Polish' (Protocol in workflow.md)