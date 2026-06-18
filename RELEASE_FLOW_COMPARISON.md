# Release Flow: Before vs After

## Current Flow ❌

```
Push to master
    ↓
release-please PR created
    ├─ finalize workflow updates versions
    └─ automerge workflow waits for CircleCI checks, then merges
         ↓
    ⚠️  GitHub release created immediately after PR merge
         ↓
    CircleCI gets tag, starts deployment
         ├─ Build/Test all jobs
         ├─ deploy_staging → [SUCCESS or FAILURE]
         ├─ Manual approval needed
         ├─ deploy_production → [SUCCESS or FAILURE]
         └─ run_migrations_production → [SUCCESS or FAILURE]

Problems:
- GitHub release exists even if CircleCI later fails
- No separation between stage and prod releases
- GitHub doesn't know if deployment actually succeeded
- Release created at wrong time in pipeline
```

---

## New Flow ✅

```
Push to master
    ↓
release-please PR created
    ├─ finalize workflow updates versions
    └─ automerge workflow merges (NO GitHub release created)
         ↓
    release-please creates tag (v1.2.3)
         ↓
    CircleCI gets tag, starts deployment
         │
         ├─ Build/Test all jobs
         │
         ├─ deploy_staging succeeds ✅
         │   └─ create_stage_release creates: v1.2.3+stage
         │                                   (prerelease, draft)
         │
         ├─ Manual approval gate
         │
         ├─ deploy_production succeeds ✅
         │
         ├─ run_migrations_production succeeds ✅
         │   └─ create_production_release creates: v1.2.3
         │                                        (latest, final)
         │                                        deletes: v1.2.3+stage
         │
         └─ Pipeline complete

Benefits:
- Stage release only created after staging proves it works
- Production release only created after all steps succeed
- Clear separation: v1.2.3+stage vs v1.2.3
- GitHub always has accurate deployment status
- Release-please unchanged, works with any tag source
```

---

## Release Timeline Comparison

### Current (Problematic)

```
Timeline:
16:00 - PR merged by automerge
16:01 - GitHub release v1.2.3 created ⚠️ (too early!)
16:02 - CircleCI starts deployment
16:05 - Staging deployment fails ❌
        ^ but release already exists!
16:10 - Investigation begins
```

### After Implementation (Correct)

```
Timeline:
16:00 - PR merged by automerge
16:01 - Tag v1.2.3 created (no GitHub release yet)
16:02 - CircleCI starts deployment
16:05 - Staging deployment succeeds ✅
16:06 - GitHub release v1.2.3+stage created (draft)
        ^ Only created because staging worked
16:07 - Manual approval
16:08 - Production deployment starts
16:15 - Prod deployment succeeds ✅
16:16 - Migrations succeed ✅
16:17 - GitHub release v1.2.3 created (final, latest)
        ^ Only created after everything works
        ^ Stage release (v1.2.3+stage) deleted (promotion)
```

---

## GitHub Release View Comparison

### Current State (All Releases at Once)

```
Releases
├─ v1.2.3 (latest)   ← Shows immediately after PR merge
│  └─ Created at 16:01, before CircleCI even started
├─ v1.2.2
├─ v1.2.1
└─ v1.2.0
```

### After Implementation (Staged Appearance)

```
After staging succeeds (16:06):
Releases
├─ v1.2.3+stage (draft, prerelease) ← NEW: Stage artifact
│  └─ Created at 16:06, proves staging worked
├─ v1.2.2 (latest)
├─ v1.2.1
└─ v1.2.0

After production succeeds (16:17):
Releases
├─ v1.2.3 (latest)   ← NEW: Promoted to final release
│  └─ Created at 16:17, after all deployments work
├─ v1.2.2
├─ v1.2.1
└─ v1.2.0
[v1.2.3+stage deleted - promotion complete]
```

---

## Code Changes Required

| Location | Change | Lines |
|----------|--------|-------|
| `create_stage_release` job | Add new job | ~25 |
| `create_production_release` job | Add new job | ~25 |
| After `deploy_staging` | Add job call | ~8 |
| After `run_migrations_production` | Add job call | ~8 |
| **Total lines added** | | **~66** |
| **Files modified** | `.circleci/config.yml` | **1** |
| **Files deleted** | None | **0** |
| **Files created** | None | **0** |

**No changes needed to:**
- release-please workflows (GitHub Actions)
- release-please config
- version files
- Docker configs
- Deployment logic

---

## Release Success Indicators

After implementation, you can tell a release worked by:

1. **Tag created** → CircleCI job status (pass/fail)
2. **Stage release exists** → Staging definitely worked ✅
3. **Production release exists** → Everything worked ✅
4. **Stage release gone** → Successfully promoted to prod ✅

Compare to current:
- **Release exists** → Doesn't mean anything (could've been created before failure)

---

## Validation Tests

After implementation, verify:

```bash
# Test 1: RC stays in staging
git tag v1.2.3-rc.1 && git push origin v1.2.3-rc.1
# Expect: v1.2.3-rc.1+stage created, no production release
gh release list | grep v1.2.3-rc

# Test 2: Staging failure prevents release
git tag v1.2.4-test && git push origin v1.2.4-test
# (Manually break staging, then retry)
# Expect: no v1.2.4-test+stage if staging failed
gh release list | grep v1.2.4-test

# Test 3: Full release works end-to-end
git tag v1.2.4 && git push origin v1.2.4
# Expect: 
#   1. v1.2.4+stage appears after staging
#   2. Requires manual approval
#   3. v1.2.4 appears after production succeeds
#   4. v1.2.4+stage is deleted (promotion)
gh release list | head -5
```

---

## Why This Matters for Your Team

| Scenario | Before | After |
|----------|--------|-------|
| Someone asks "Is v1.2.3 deployed?" | ❓ Unknown (might be broken) | ✅ Yes (GitHub shows it) |
| Release failed in staging | 😞 Release exists but nothing deployed | 😊 No release exists yet |
| Need to rollback | ❓ Hard to track what's actually live | ✅ Clear: release marks what's live |
| Demo environment breaks | ❌ Nothing in GitHub to distinguish | ✅ Demo tags excluded, staging/prod separate |
| Staging works, prod fails | ❓ Everything looks normal | ✅ v1.2.3+stage exists but v1.2.3 missing |
| Historical audit trail | ❌ Release times don't match deployment | ✅ Release time = deployment success time |
