# Release-Please Workflow Race Condition Fix

**Date:** May 31, 2026  
**Issue:** `league_manager/__init__.py` not updated during releases  
**Status:** Fixed  
**PR:** #1261

## Problem Description

Version mismatches occurred during automated releases where `league_manager/__init__.py` fell out of sync with `pyproject.toml`:
- `pyproject.toml`: 3.22.1
- `league_manager/__init__.py`: 3.22.0 ❌

**Affected Releases:** 3.22.1, 3.22.2

## Root Cause Analysis

A **race condition** between two GitHub Actions workflows:

### Problematic Execution Order
```
Timeline (Before Fix):
1. release-please creates PR with version updates (commit 11e0f894)
2. ❌ automerge immediately merges PR to master (commit 6a6a72ff)
3. ⏳ finalize workflow THEN runs (too late!)
4. finalize creates commit c58c375f with __init__.py update
5. ❌ c58c375f never reaches master (stranded on PR branch)
```

### Evidence
- **Finalize commit exists:** `c58c375f` on `remotes/origin/release-please--branches--master`
- **But never merged:** Not in `origin/master` history
- **Merge showed only 8 files changed:** Missing `league_manager/__init__.py`

The automerge workflow had no protection against merging before finalize completed. It ran immediately upon PR label, without waiting for any checks or the finalize workflow.

## Solution Implemented

### 1. Enhanced `release-please-automerge.yaml`

**Added check polling (64 lines):**
```yaml
- Waits for ALL check runs to complete
- Polls GitHub API for up to 10 minutes
- Specifically monitors "Release Please Finalize" workflow
- Counts successful, failed, and pending checks
- Fails fast if any check fails (with PR comment)
- Prevents "red state" merges
```

**Key improvements:**
- Never merges with failing checks
- Explicit logging of check status
- Automatic PR comments explaining blocks
- Configurable timeout (10 min default)

### 2. Enhanced `release-please-finalize.yaml`

**Added validation steps (44 lines):**
```yaml
Step 1: Verify version extraction
  - Confirm pyproject.toml is readable
  - Validate version string is not empty
  - Fail explicitly if extraction fails

Step 2: Update version files
  - Run sed to update all version files
  - Read back the updated value
  - Validate actual ≠ expected (sed failed) → ERROR
  - Proceed only if validation passes

Step 3: Commit and push
  - Confirm git push succeeded
  - Fail with error if push fails
```

**Key improvements:**
- No silent failures (every step validated)
- Explicit error messages with context
- Verification prevents partial updates
- Git push success/failure explicitly reported

## New Execution Flow

```
After Fix (Proper Sequencing):
1. release-please creates PR with version updates
2. PR gets `autorelease: pending` label
3. ✅ automerge workflow starts
4. ⏳ automerge WAITS for finalize workflow
5. finalize runs and updates __init__.py
6. ✅ finalize validation confirms success
7. ✅ automerge sees finalize=success + all checks green
8. ✅ PR merges with ALL changes included
9. ✅ master branch stays in sync
```

## Files Modified

### Workflow Files (Critical)
- `.github/workflows/release-please-automerge.yaml`
  - Lines: +64 (check polling logic)
  - Added permissions: `checks: read`
  - New step: "Wait for finalize and all checks to pass"

- `.github/workflows/release-please-finalize.yaml`
  - Lines: +44 (validation logic)
  - New step: "Verify version extraction"
  - Enhanced step: "Update version files" with validation

### Documentation
- Commit 2af2667a: Workflow changes
- Commit e079e0d9: Guide documentation (moved to reports)

## Testing & Verification

### Test Case 1: Normal Release (All Checks Pass)
- Release PR created → finalize runs → automerge waits → finalize succeeds → all checks green → **MERGE**
- Expected: `__init__.py` included in merge commit ✓

### Test Case 2: Finalize Fails
- Release PR created → finalize runs → validation fails (e.g., sed pattern) → **NO MERGE**
- Expected: PR comment explains block, manual investigation ✓

### Test Case 3: Other CI Check Fails
- Release PR created → finalize succeeds → other check fails → **NO MERGE**
- Expected: PR comment explains which check failed ✓

### Test Case 4: Timeout (Finalize Takes Too Long)
- Release PR created → automerge waits 10 min → timeout → **NO MERGE**
- Expected: Explicit timeout message in logs ✓

## Impact

### Positive Outcomes
✅ Eliminates version mismatches in future releases  
✅ Prevents "red state" merges (all checks must pass)  
✅ Better error detection and reporting  
✅ Explicit validation at every step  
✅ No false positives (silent failures eliminated)

### No Breaking Changes
- Backwards compatible
- Automatically applies to all future releases
- Requires no manual intervention
- No configuration changes needed

## Monitoring

### In GitHub UI
- Two new check statuses: "Release Please Finalize" and "Release Please Automerge"
- PR comments explain any blocks or failures
- Clear separation between version update and merge decision

### In Logs
Look for:
- `Finalize` job: Version extraction, sed validation, push confirmation
- `Automerge` job: Check polling, count of passed/failed/pending checks, final decision

## Lessons Learned

1. **Workflow sequencing matters:** Don't assume workflows run in a specific order without explicit coordination
2. **Silent failures are dangerous:** Always validate that automated changes actually happened
3. **Race conditions in CI:** Add locks/waits when one workflow depends on another
4. **Check status API:** GitHub's check-runs API is the reliable way to query workflow status across jobs

## Related Issues

- **Original Issue:** `league_manager/__init__.py` at 3.22.0 while pyproject.toml at 3.22.1
- **Affected Releases:** 3.22.1, 3.22.2 (finalize commit exists but not merged)
- **Fix Applied:** PR #1261
- **Status:** Ready for next release validation
