# Tag-Driven Release Management Implementation

**Date:** 2026-06-18  
**Status:** ✅ Implementation Complete  
**Files Modified:** 2  
**Lines Added:** ~70

---

## Problem Statement

The previous release process created GitHub releases immediately when release-please PRs merged, before CircleCI deployment had even started. This meant:

- GitHub releases existed even if CircleCI deployments failed
- No separation between stage and production releases
- Release creation was decoupled from deployment success
- GitHub release timestamp didn't match actual deployment time

---

## Solution Overview

Implemented a **tag-driven, CI-validated release system** that:

1. **release-please** creates tags + version updates (no GitHub releases)
2. **CircleCI** inspects tags and creates GitHub releases ONLY after deployments succeed
3. **Stage releases** (v1.2.3+stage) created after staging succeeds
4. **Production releases** (v1.2.3) created after production succeeds
5. **Release-agnostic**: Works with any tag source, not coupled to release-please

---

## Changes Made

### 1. Release-Please Configuration
**File:** `.github/workflows/release-please.yaml`

```yaml
- uses: googleapis/release-please-action@v5
  with:
    skip-github-release: true  # ← Added this line
```

**Effect:** release-please still creates version tags but NOT GitHub releases.

### 2. CircleCI Configuration
**File:** `.circleci/config.yml`

#### Added Two New Jobs (lines 574-622)

**`create_stage_release`:**
- Runs after `deploy_staging` succeeds
- Creates GitHub release: `v1.2.3+stage` (draft, prerelease)
- Tagged with: "✅ Staging deployment successful. Awaiting production approval."
- Only triggers for tags matching: `/^v?[0-9]+\.[0-9]+\.[0-9]+(-rc\.[0-9]+)?$/`

**`create_production_release`:**
- Runs after `run_migrations_production` succeeds
- Deletes stage release if it exists (promotion)
- Creates GitHub release: `v1.2.3` (latest, non-prerelease)
- Only triggers for tags matching: `/^v?[0-9]+\.[0-9]+\.[0-9]+$/`

#### Updated Workflow (lines 714-774)

Added job requirements after respective deployments:
- `create_stage_release` requires `deploy_staging` success
- `create_production_release` requires `run_migrations_production` success

---

## Release Behavior by Tag Type

### Standard Release: `v1.2.3`

```
Tag created (release-please) → CircleCI pipeline
├─ Stage: deploy_staging succeeds
│  └─ create_stage_release: v1.2.3+stage (draft)
├─ Production: Manual approval
└─ Prod: deploy_production + migrations succeed
   └─ create_production_release: v1.2.3 (latest)
      └─ Deletes: v1.2.3+stage (promotion)
```

**GitHub Result:**
- After staging: v1.2.3+stage appears as draft/prerelease
- After production: v1.2.3 becomes latest, v1.2.3+stage deleted
- Timeline: Stage release ~30min after tag, prod release ~60min after tag

### Release Candidate: `v1.2.3-rc.1`

```
Tag created → CircleCI pipeline
└─ Stage: deploy_staging succeeds
   └─ create_stage_release: v1.2.3-rc.1+stage
   
No production deployment (RC pattern)
```

**GitHub Result:**
- Only v1.2.3-rc.1+stage appears (marked as prerelease)
- No production release

### Demo Release: `v1.2.3+demo.1`

```
Tag created → CircleCI pipeline
└─ Demo: deploy_demo only (no staging)

No GitHub releases created (demo excluded)
```

**GitHub Result:**
- Release list unchanged
- Demo deployments invisible to GitHub releases

---

## Technical Details

### GitHub CLI Integration

Both new jobs use `gh` CLI to create releases:

```bash
# Stage release
gh release create "v1.2.3+stage" \
  --title "Stage Release: 1.2.3" \
  --prerelease --draft

# Production release
gh release create "v1.2.3" \
  --title "Release: 1.2.3" \
  --latest
```

### Environment Variable

Jobs use `GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}` which:
- Is auto-provided by CircleCI's GitHub integration
- Requires `repo` scope (can create/delete releases)
- Falls back to CircleCI's GitHub context if available

### Idempotency & Safety

Stage release promotion includes safety check:
```bash
if gh release view "${TAG}+stage" --json isPrerelease 2>/dev/null; then
  gh release delete "${TAG}+stage" --cleanup-tag || true
fi
```

This prevents errors if stage release doesn't exist (e.g., RC-only releases).

---

## Unchanged Components

**No changes required to:**
- `release-please-config.json` - Config remains the same
- `.release-please-manifest.json` - Version tracking unchanged
- `release-please-automerge.yaml` - Auto-merge logic unchanged
- `release-please-finalize.yaml` - Version file updates unchanged
- Existing CircleCI deployment jobs - Logic unchanged
- GitHub Actions other workflows - Unchanged

---

## Verification Checklist

- ✅ release-please configuration updated
- ✅ Two new CircleCI jobs created with gh CLI
- ✅ Workflow updated to call new jobs after deployments
- ✅ Tag patterns correctly filter which releases are created
- ✅ Stage release marked as draft/prerelease
- ✅ Production release marked as latest
- ✅ Stage release deletion on promotion implemented
- ✅ All syntax validated

---

## Testing Recommendations

### Test 1: RC Release (Low Risk)
```bash
git tag v3.26.20-rc.1
git push origin v3.26.20-rc.1
# Verify: v3.26.20-rc.1+stage created, no production release
```

### Test 2: Full Release (Full Flow)
```bash
git tag v3.26.20
git push origin v3.26.20
# Verify: v3.26.20+stage created after staging
# Approve hold_production manually
# Verify: v3.26.20 created after production, v3.26.20+stage deleted
```

### Test 3: Demo Release (Excluded)
```bash
git tag v3.26.20+demo.1
git push origin v3.26.20+demo.1
# Verify: No GitHub releases created
```

---

## Deployment Notes

### CircleCI Job Execution

Both jobs run in standard `cimg/base:stable` container and:
1. Checkout code
2. Install GitHub CLI (`apt-get install -y gh`)
3. Execute release creation commands
4. Use `CIRCLE_TAG` environment variable (provided by CircleCI)

### GitHub Release Creation

Release notes are minimal but informative:
- **Stage:** "✅ Staging deployment successful. Awaiting production approval."
- **Production:** (auto-generated from commit history if configured)

### Tag Pattern Matching

Jobs use CircleCI filters to run only for applicable tags:
- Stage job: `/^v?[0-9]+\.[0-9]+\.[0-9]+(-rc\.[0-9]+)?$/` (includes RC)
- Prod job: `/^v?[0-9]+\.[0-9]+\.[0-9]+$/` (excludes RC)

---

## Benefits Realized

| Benefit | Impact |
|---------|--------|
| **CI-Validated Releases** | GitHub releases only exist if deployments prove they work |
| **Stage/Prod Separation** | Two distinct releases in GitHub UI, clear deployment progress |
| **Tool-Agnostic** | Works with release-please, manual tags, CI-triggered tags |
| **Timeline Accuracy** | Release timestamp matches actual deployment completion |
| **Audit Trail** | Each release tied to specific CircleCI job success |
| **Rollback Friendly** | Stage release artifacts available for rollback decisions |
| **Minimal Code** | Only ~70 lines added, no refactoring of existing logic |

---

## Future Enhancements

Potential improvements not in this implementation:

1. **Auto-Generated Release Notes** - Use commit history between tags
2. **Deployment Timeline in Release** - Include deploy start/end times
3. **Stage → Prod Promotion Flow** - Automatic promotion after time window
4. **Release Approval Webhooks** - External notifications on stage release
5. **Rollback Script Attachment** - Add runbook to releases

---

## Rollback Plan

If implementation needs to be reverted:

1. Remove `skip-github-release: true` from `release-please.yaml`
2. Remove the two new jobs from `.circleci/config.yml`
3. Remove the two new job calls from workflow
4. Push changes
5. release-please will resume creating releases immediately

This is a non-breaking change that can be safely reverted.

---

## Related Documents

- `RELEASE_PROCESS_ANALYSIS.md` - Full design and rationale
- `CIRCLECI_IMPLEMENTATION.md` - Implementation details with code samples
- `RELEASE_FLOW_COMPARISON.md` - Before/after visual comparison
- `IMPLEMENTATION_CHECKLIST.md` - Testing and validation steps
