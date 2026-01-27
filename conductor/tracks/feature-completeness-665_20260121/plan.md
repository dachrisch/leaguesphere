# Plan: Feature Completeness

## Phase 1: Metadata and Validation (TDD)
Implement new fields and strict validation rules.

- [ ] Task: Expand Metadata Fields (#694, #666)
    - [ ] Update `types.ts` and `metadata.json` schema.
    - [ ] Update `GamedayMetadataAccordion.tsx` to include Season and League selectors.
    - [ ] Implement default value logic in `ListDesignerApp.tsx` for new gamedays.
- [ ] Task: Implement Mandatory and Date Validation (#694)
    - [ ] Add validation rules to `useFlowValidation.ts`.
    - [ ] Verify that empty mandatory fields and past dates trigger validation errors.
- [ ] Task: Conductor - User Manual Verification 'Phase 1: Metadata and Validation' (Protocol in workflow.md)

## Phase 2: Selection and Seeding (TDD)
Implement advanced assignment logic.

- [ ] Task: Group-based Seeding (#671)
    - [ ] Update `teamReference.ts` to support rank-by-group references.
    - [ ] Update `TeamSelector.tsx` to display these options for playoff games.
- [ ] Task: Team Swapping and Officials (#679)
    - [ ] Implement team swapping logic in `useDesignerController.ts`.
    - [ ] Expand officials selection pool in `GameTable.tsx`.
- [ ] Task: Generation UI Polish (#678)
    - [ ] Refactor `TournamentGeneratorModal.tsx` to allow team selection.
- [ ] Task: Connect Existing Teams (#705)
    - [ ] Implement team lookup and selection from the database pool.
- [ ] Task: Final Quality Gate
    - [ ] Run all tests and ensure >80% coverage for new logic.
- [ ] Task: Conductor - User Manual Verification 'Phase 2: Selection and Seeding' (Protocol in workflow.md)
