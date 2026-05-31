# Release-Please Workflow Fix: Check Sequencing

## Problem

The release-please automation had a **race condition** where `__init__.py` version updates were not making it to the master branch.

### Root Cause

The automerge workflow was merging PRs **before** the finalize workflow had time to run and push its changes:

```
Timeline (Before Fix):
1. release-please creates commit with version updates
2. Release PR gets `autorelease: pending` label
3. ❌ Automerge IMMEDIATELY merges PR to master
4. ⏳ Finalize workflow THEN runs (too late!)
5. ❌ Finalize's __init__.py update never reaches master
```

**Result:** Commits showed different versions:
- `pyproject.toml`: 3.22.1
- `league_manager/__init__.py`: 3.22.0 ← out of sync!

---

## Solution

Updated both workflows to enforce proper sequencing:

### 1. Finalize Workflow (`release-please-finalize.yaml`)

**Added validation checks:**
- Verifies version extraction from `pyproject.toml` succeeds
- Validates that `league_manager/__init__.py` was actually updated
- Reports errors explicitly if sed pattern fails to match
- Confirms git push succeeded before completing

**Why this matters:** If the sed pattern fails silently, the workflow would complete successfully but changes wouldn't be made. Now we verify the update actually happened.

### 2. Automerge Workflow (`release-please-automerge.yaml`)

**Added check polling:**
- Waits for ALL checks to complete (not just label presence)
- Specifically monitors finalize workflow status
- Polls for up to 10 minutes (60 attempts × 10 seconds)
- Fails fast if any check fails (no silent red merges)
- Posts comment to PR if checks fail, explaining the block

**Execution sequence:**
```
1. release-please creates PR with version updates
2. Release PR gets `autorelease: pending` label
3. Automerge workflow starts
4. ⏳ Automerge WAITS for finalize workflow
5. Finalize completes successfully
6. ✓ All checks green
7. Automerge merges PR to master
8. ✓ All changes (including __init__.py) are on master
```

---

## How It Works

### Automerge Check Loop

```bash
# Gets latest commit SHA from PR
COMMIT_SHA=$(gh api repos/$REPO/pulls/$PR_NUMBER --jq '.head.sha')

# Queries all check runs for that commit
CHECKS=$(gh api repos/$REPO/commits/$COMMIT_SHA/check-runs --jq '.check_runs[]...')

# Counts results
TOTAL_CHECKS    # Total number of checks
SUCCESSFUL      # Checks with conclusion="success"
FAILED          # Checks with conclusion="failure"
PENDING         # Checks still running (status != "completed")

# Specifically looks for finalize
FINALIZE_CONCLUSION=$(echo "$CHECKS" | jq '.[] | select(.name == "Release Please Finalize")')
```

**Success condition:**
- FAILED = 0 (no red checks)
- PENDING = 0 (all checks done)
- TOTAL_CHECKS > 0 (at least one check ran)
- FINALIZE_CONCLUSION = "success" (finalize specifically passed)

**Failure condition:**
- Any check fails → immediate abort with PR comment
- Timeout (10 minutes) → fail and notify user

---

## Testing the Fix

### Scenario 1: All Checks Pass (Normal Release)

```
Release PR created → finalize runs → automerge waits → finalize succeeds → automerge merges
Expected: __init__.py is included in merge commit
```

### Scenario 2: Finalize Fails (e.g., sed pattern doesn't match)

```
Release PR created → finalize runs → finalize fails (validation error) → automerge sees failure → NO MERGE
Expected: PR comment explains the block, manual investigation required
```

### Scenario 3: Other CI Check Fails

```
Release PR created → finalize succeeds → other check fails → automerge sees failure → NO MERGE
Expected: PR comment explains the block with check details
```

---

## What Changed in the Workflows

### `release-please-automerge.yaml`

**New:**
- Permissions: added `checks: read`
- New step: "Wait for finalize and all checks to pass"
  - Polls GitHub API for check runs
  - Monitors finalize workflow specifically
  - Fails fast on any failures
  - Posts comments for debugging

**Removed:**
- Direct immediate merge (now waits for checks first)

### `release-please-finalize.yaml`

**New:**
- "Verify version extraction" step
  - Ensures pyproject.toml is readable
  - Validates version format not empty
  
- Validation in "Update version files" step
  - Reads back the updated version from `__init__.py`
  - Compares actual vs. expected
  - Fails if mismatch (sed didn't work)

- Better error handling in commit/push
  - Checks if push succeeded
  - Explicit error messages

**Better:**
- Clearer logging at each step
- Exit codes properly indicate success/failure

---

## Monitoring

### In GitHub UI

The PR now shows:
1. **Release Please Finalize** check status
2. **Release Please Automerge** check status
3. Clear separation of concerns

### In Logs

If a release fails:
1. Check finalize job output for version validation errors
2. Check automerge job output for failed checks
3. PR comments explain what's blocking (if automerge failed)

---

## Future Improvements

1. **Stricter finalize validation**: Could also verify all package.json files were updated
2. **Parallel checks**: Could run other CI checks in parallel with finalize (they run anyway, finalize is just one of them)
3. **Slack notifications**: Could notify on failure for faster response
4. **Automatic retry**: Could retry finalize if it fails (though currently it shouldn't)

---

## Related Issues

- **Issue**: PR #1257 — finalize changes not included in merge
- **Root cause**: Race condition between automerge and finalize
- **Fixed by**: Proper check sequencing and validation
- **Affected versions**: 3.22.1, 3.22.2 (now fixed for future releases)
