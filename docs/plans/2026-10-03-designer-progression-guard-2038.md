# Gameday designer progression: stable links + publish guard (#2038)

**Issue:** [dachrisch/leaguesphere#2038](https://github.com/dachrisch/leaguesphere/issues/2038)

## Problem

Playoff progression (`Gewinner HF1 1.-4.`) resolves by matching a reference's
`matchName` against a `Gameinfo.standing`. Two semi-finals that share a standing
(`1.-4.`) cannot be told apart, references like `HF1 1.-4.` match no game, and
`Gameinfo.objects.get(standing=...)` raises `MultipleObjectsReturned` when a
standing is duplicated. The gameday could still be published, so the break was
only noticed on game day (staging gameday 931).

## Fix

1. **Stable canvas link.** `Gameinfo.designer_node_id` (migration `0044`) stores
   the canvas game-node id, written by `CanvasPublishService.apply`.
2. **Edge/node-id resolution.** `CanvasBracketProgressionService` now resolves
   home/away winner/loser refs via the maintained `gameToGame` canvas edge
   (source node -> target node + slot), falling back to a unique `matchName`
   only when no edge exists, and targets `Gameinfo` by `designer_node_id`.
   Duplicate standings no longer raise.
3. **Publish guard.** `CanvasProgressionValidator` blocks publication of a
   canvas with dangling/ambiguous winner-loser refs, missing rank stages,
   out-of-range ranks, self-references, or cycles. Wired into the designer
   `publish` action, `GamedayPublishAPIView`, and `CanvasPublishService.apply`
   (400 with the issue list).
4. **Designer UI.** `useFlowValidation` now reports broken/ambiguous
   progression references as blocking errors (edge-aware), so the publish
   confirmation modal refuses before the API call.
5. `GamedayModelWrapper`'s schedule DataFrame excludes the internal
   `designer_node_id` column so schedule snapshots are unchanged.

## Tests

- Backend: resolver with two semis sharing `1.-4.` wired by edges; validator
  cases; publish returns 400 on a broken canvas; publish persists
  `designer_node_id`.
- Frontend: blocking broken/ambiguous progression; edge-wired duplicates pass.

## Out of scope

Historical gamedays published before this change (e.g. 931) keep their old
`standing`-only links until re-published; the guard prevents new breakage.
