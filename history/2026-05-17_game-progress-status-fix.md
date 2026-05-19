# Game Progress Status Computation Fix

**Date:** 2026-05-17  
**PR:** https://github.com/dachrisch/leaguesphere/pull/1180  
**Status:** ✅ Merged

## Problem

Games marked as finished ('beendet') in the database were displaying as "0 min until start" in the game-progress dashboard. The root cause was that the parent `Gameday` record had an empty status field, causing the API to return no usable status value for the frontend.

### Evidence

**Database layer:** ✓ Correct
- All finished games had `status='beendet'` in Gameinfo model
- All had proper `gameFinished` timestamps

**API layer:** ✓ Correct
- Games were correctly serialized with `status='beendet'`
- Frontend received correct data from `/api/game-progress/`

**Root Cause:** Gameday.status = "" (empty string)
- Parent Gameday records missing status values (should be PUBLISHED, IN_PROGRESS, or COMPLETED)
- This caused the frontend's filtering/display logic to malfunction

## Solution

Implemented **Option 2: Handle in API** - Added defensive computation in the serializer layer.

### Changes

**Backend (`journey/api/progress_serializers.py`):**
- Added `computed_status` SerializerMethodField to `GamedayProgressSerializer`
- When `Gameday.status` is empty, computes effective status from child games:
  - All games 'beendet' → `COMPLETED`
  - Any pending game → `PUBLISHED`
- When `Gameday.status` is set, returns `None` (explicit value takes precedence)

**Frontend (`journey_dashboard/src/types/progressTypes.ts`):**
- Added optional `computed_status?: string` field to `GamedayProgress` interface
- No changes to frontend logic needed (already correctly processes game statuses)

**Tests (`journey/tests.py`):**
- Added `GamedayProgressSerializerTests` class with 3 comprehensive test cases:
  1. Empty Gameday status + all games completed → `computed_status='COMPLETED'`
  2. Empty Gameday status + pending games → `computed_status='PUBLISHED'`
  3. Explicit Gameday status preserved → `computed_status=None`

## Verification

✅ All 3 new test cases pass  
✅ All 34 existing journey app tests pass  
✅ No regressions introduced  
✅ CI pipeline green

## Impact

- **Frontend:** Games will display correctly even if parent Gameday.status is empty
- **Data integrity:** No changes to database (issue only addressed at API serialization level)
- **Backward compatible:** Explicit Gameday.status values unchanged; computed_status only used when status is empty
- **Performance:** Minimal overhead (single aggregation per gameday during serialization)

## Files Modified

- `journey/api/progress_serializers.py`
- `journey/tests.py`
- `journey_dashboard/src/types/progressTypes.ts`

## Future Work

Consider root-cause fix (Option 1) to ensure new Gameday records always have a valid status value, preventing this issue in the future. This would eliminate the need for computed_status computation.
