# Plan: Critical UI & Navigation Fixes

## Phase 1: Navigation and Layout Fixes
Address the disappearing navigation bar and overlapping buttons.

- [ ] Task: Fix Navigation Bar Disappearance (#692)
    - [ ] Create reproduction test case in Vitest (if possible) or perform manual verification of CSS z-index/positioning.
    - [ ] Identify if React Bootstrap Select/Portal is causing layout shifts.
    - [ ] Fix positioning logic in `AppHeader.tsx` or `ListDesignerApp.tsx`.
- [ ] Task: Fix Publish Button Overlap (#695)
    - [ ] Audit `GamedayMetadataAccordion.tsx` styling.
    - [ ] Adjust CSS/Bootstrap classes to ensure button and date labels have sufficient spacing.
- [ ] Task: Conductor - User Manual Verification 'Phase 1: Navigation and Layout Fixes' (Protocol in workflow.md)

## Phase 2: Hover State Polish
Address reorder button hover issues.

- [ ] Task: Polish Reorder Buttons (#680)
    - [ ] Update `TeamGroupCard.tsx` and `GlobalTeamTable.tsx` to use correct translation keys for tooltips.
    - [ ] Remove or stabilize the `transform: scale` or similar growth effect in CSS.
- [ ] Task: Final Quality Gate
    - [ ] Run `npm run test:run` in `gameday_designer/`.
    - [ ] Run `npm run eslint`.
- [ ] Task: Conductor - User Manual Verification 'Phase 2: Hover State Polish' (Protocol in workflow.md)
