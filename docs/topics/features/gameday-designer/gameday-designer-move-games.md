# Gameday Designer — Moving Games Between Stages and Fields

Implements [Issue #1921](https://github.com/dachrisch/leaguesphere/issues/1921).

## What it does

In the Gameday Designer, a game can be moved to **another stage** (e.g. from
Preliminary to Final) or **onto another field** — within the same field or
across fields. This supports rebalancing load across fields, reacting to
schedule delays, and fixing misclicks during setup, especially for large
tournaments with many games, fields, and parallel stages.

## How to move a game

Two equivalent mechanisms (edit mode only — published/locked gamedays are
read-only):

1. **Context menu** — every game row has a *Move* action (`bi-box-arrow-in-right`
   icon). The dropdown lists all other stages grouped by field; the game's own
   stage is not offered. If no other stage exists, the control is disabled with
   a hint.
2. **Drag & drop** — game rows are draggable; drop them on any stage card.
   The target stage is highlighted while dragging.

## Conflict handling & consistency

- Moves to the game's own stage are rejected (no-op with a warning notification).
- Start times of **both** affected stages are recalculated automatically;
  manually set times (`manualTime`) are preserved.
- Bracket progression is untouched: game-to-game edges, rank references and
  officials assignments stay attached to the moved game.
- Remaining collisions (team plays twice at once, field overlap, duplicate
  standings) surface immediately through the existing validation panel.
- Template export (`genericizeFlowState`) derives stage/field from the
  `parentId` hierarchy, so saved templates follow the move automatically.

Changes are persisted via the existing debounced designer-state auto-save.

## Technical notes

- Core operation: `moveNodeToStage(gameId, targetStageId)` in
  `gameday_designer/src/hooks/useNodesState.ts` — re-parents the game node,
  repositions it below the target stage's games, syncs `stage`/`stageType`
  metadata, and recalculates times. Returns `false` for rejected moves.
- Controller handler: `handleMoveGame` in `useDesignerController.ts`
  (success/warning notification + `game_moved` analytics event).
- UI: move dropdown in `GameTable.tsx`, drop target in `StageSection.tsx`,
  prop plumbing through `FieldSection` → `ListCanvas` → `ListDesignerApp`.
- i18n keys (`ui:tooltip.moveGame`, `ui:tooltip.dropToMove`,
  `ui:message.noMoveTargets`) added to `en` and `de` locales.

## Decisions on open questions from the issue

- **Games with results / in progress:** moves are only available in edit mode;
  published gamedays are read-only, so results entered on live games are never
  affected by a move.
- **Bulk move:** deliberately out of scope for this iteration; single-game moves
  via drag & drop and the context menu.
