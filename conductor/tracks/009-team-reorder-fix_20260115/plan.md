# Plan: Team Reorder Button Interaction Fix (#680)

## Phase 1: TDD Fix Implementation
- [x] **Task 1: Write failing unit test** b0eaafd
  - Update `gameday_designer/src/components/list/__tests__/TeamGroupCard.test.tsx` to simulate a click on the reorder buttons and assert that the `onToggle` handler is not called.
- [x] **Task 2: Apply fix in TeamGroupCard** b0eaafd
  - Identify the reorder buttons in `TeamGroupCard.tsx`.
  - Add `e.stopPropagation()` to their `onClick` handlers to prevent the event from reaching the header toggle zone.
- [x] Task: Conductor - User Manual Verification 'TDD Fix Implementation' (Protocol in workflow.md) 1835c96

## Phase 2: QA & Regression Testing
- [x] **Task 1: Audit other action buttons** 1835c96
  - Verify if "Edit Team" or "Delete Team" buttons within the same card suffer from the same bubbling issue and fix them if necessary. (Confirmed: protected via stopPropagation on containers or buttons).
- [x] **Task 2: Fix button expansion on hover** 1835c96
  - Remove `btn-adaptive` and labels from reorder buttons to prevent layout shifts.
- [x] **Task 3: Full UI Test Run** 1835c96
  - Execute `npm run test:run` in the `gameday_designer` directory to ensure no regressions.
- [x] Task: Conductor - User Manual Verification 'QA & Regression Testing' (Protocol in workflow.md) 1835c96