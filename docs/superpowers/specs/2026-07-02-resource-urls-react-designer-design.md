# ResourceURL CRUD in the React Gameday Designer

**Date:** 2026-07-02
**PR:** #1374 (`feat/gameday_detail_enhancements`)
**Status:** Approved design

## Background

PR #1374 adds `ResourceUrl` (a URL + description attached to a `Gameday`, shown on the
gameday detail page). URL management was implemented only in the **old Django designer**
(`gamedays/templates/gamedays/gameday_form.html`, via an inline formset with add/edit/delete).

The blocking review request (dachrisch) asks for the same capability in the **new React
designer** — specifically the metadata accordion
`gameday_designer/src/components/GamedayMetadataAccordion.tsx`.

## Goal

Full CRUD parity: the React metadata accordion can list, add, edit, and delete a gameday's
resource URLs, persisting them as real `ResourceUrl` rows.

## Key constraint

The React designer persists metadata into a designer-state JSON blob
(`gamedayApi.updateDesignerState`), materialized to the real `Gameday` only later. But
`ResourceUrl` are real DB rows (FK → `Gameday`). Therefore URLs must be persisted **directly
and immediately** against the real gameday (as the old designer's formset does on submit),
independent of the draft-state autosave. The designer always edits an already-persisted
gameday (`getGameday(id)`), so a real gameday PK always exists to attach URLs to.

## Chosen approach: reuse the existing gameday endpoint (nested writable field)

No new route or viewset. Extend the existing `GamedaySerializer` (the `/gamedays/{id}/`
GET/PATCH the accordion already uses) with a nested writable `resource_urls` field. URLs ride
along with the gameday payload the designer already loads and saves.

**Save semantics:** saving replaces the whole URL set — the server reconciles against
`resourceurl_set` (create new, update existing, delete omitted). This matches the old
designer's formset behavior (`can_delete`; omitted rows = removed).

Rejected alternatives:
- **Dedicated sub-endpoint** `/gamedays/{id}/resource-urls/` (per-row POST/PATCH/DELETE): more
  surface (viewset, routing, frontend methods, separate lifecycle) for granularity and
  race-avoidance we don't need for a small single-author list.
- **Carry URLs in the designer-state blob, materialize on publish:** URLs wouldn't be real
  until publish; diverges from the old designer; extra reconcile logic.

## Components

### Backend — `gamedays/api/serializers.py`, `gamedays/api/views.py`
- `ResourceUrlSerializer`: fields `id` (optional/read-write for matching), `url`, `description`.
- `GamedaySerializer`: add
  `resource_urls = ResourceUrlSerializer(many=True, source='resourceurl_set', required=False)`.
- Override `GamedaySerializer.update()` to reconcile the nested set against `resourceurl_set`:
  - incoming items with an `id` matching an existing row → update `url`/`description`;
  - incoming items without a matching `id` → create;
  - existing rows whose `id` is absent from the incoming list → delete.
- Reads stay cheap via the `prefetch_related('resourceurl_set')` already added in this PR.

### Frontend
- `gameday_designer/src/types/flowchart.ts`: extend `GamedayMetadata` with
  `resource_urls?: { id?: number; url: string; description: string }[]`.
- `gameday_designer/src/api/gamedayApi.ts`: no new method required — reuse `getGameday` /
  `patchGameday`; ensure the `Gameday`/metadata types carry `resource_urls`.
- `gameday_designer/src/components/GamedayMetadataAccordion.tsx`: new "Links" section in the
  accordion body mirroring the old designer:
  - rows of description + URL inputs, a delete (trash) button per row, and an
    "URL hinzufügen" add button;
  - local list state seeded from the loaded gameday's `resource_urls`;
  - **save trigger:** the whole list is persisted via `patchGameday(id, { resource_urls })`
    (not through the flow-state blob) when a row input **blurs** and immediately when a row is
    **deleted**. A newly added row is not sent until it has a non-empty URL. This keeps URLs as
    real DB rows without an extra "save" button, consistent with the accordion's blur-driven
    feel.
  - editing disabled in `readOnly` mode.

## Data flow

1. Designer loads gameday → `getGameday(id)` returns `resource_urls`.
2. Accordion seeds local Links list state from `resource_urls`.
3. User adds/edits/deletes rows in the Links section (local state only).
4. On save (row blur, or immediately on delete), accordion calls
   `patchGameday(id, { resource_urls: [...] })`.
5. `GamedaySerializer.update()` reconciles the set; DB now reflects the edited list.

## Error handling
- Invalid URL → serializer/`URLField` validation error surfaced on the row (frontend shows
  the field error; backend rejects with 400).
- Save failure → surface an error to the user; local edits retained for retry (do not silently
  drop). Mirror the accordion's existing `console.error` + non-destructive behavior.

## Testing
- Backend (`gamedays/tests/test_views.py`): through the gameday endpoint —
  create URLs, update an existing URL, delete via omission, validation of a bad URL. Reuse
  `ResourceUrlFactory`.
- Frontend (`gameday_designer/src/components/__tests__/GamedayMetadataAccordion.test.tsx`):
  render existing URLs, add a row, edit a row, delete a row, and assert the
  `patchGameday` save payload; assert read-only disables editing.

## Out of scope
- Changing the old Django designer's URL management.
- The `ResourceUrlFactory` placeholder-URL comment thread (`leaguesphere.app` vs `example.com`)
  — separate, not part of this design.
