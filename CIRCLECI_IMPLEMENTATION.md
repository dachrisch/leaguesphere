# CircleCI Implementation: Tag-Driven Release Management

## Changes Required

### 0. Configure release-please to Skip GitHub Release

**File:** `.github/workflows/release-please.yaml`

Add `skip-github-release: true` to the release-please action:

```yaml
      - uses: googleapis/release-please-action@v5
        id: release
        with:
          config-file: release-please-config.json
          token: ${{ secrets.RELEASE_PLEASE_TOKEN }}
          skip-github-release: true  # ← Add this line
```

**What this does:**
- ✅ release-please still creates the **tag** (triggers CircleCI)
- ✅ release-please still updates **version files** and **creates PR**
- ❌ release-please NO LONGER creates the **GitHub release** (CircleCI will do it)

### 1. Add Two New Jobs (Before `workflows:` section)

Insert these jobs after the `run_migrations_production` job, around line 573:

```yaml
  create_stage_release:
    docker:
      - image: cimg/base:stable
    steps:
      - checkout
      - run:
          name: Install GitHub CLI
          command: apt-get update && apt-get install -y gh
      - run:
          name: Create Stage Release
          command: |
            # Extract version from tag (remove 'v' prefix if present)
            TAG="${CIRCLE_TAG}"
            VERSION="${TAG#v}"
            
            echo "Creating stage release for tag: ${TAG}"
            gh release create "${TAG}+stage" \
              --title "Stage Release: ${VERSION}" \
              --notes "✅ Staging deployment successful. Awaiting production approval." \
              --prerelease \
              --draft
          env:
            GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}

  create_production_release:
    docker:
      - image: cimg/base:stable
    steps:
      - checkout
      - run:
          name: Install GitHub CLI
          command: apt-get update && apt-get install -y gh
      - run:
          name: Create Production Release
          command: |
            TAG="${CIRCLE_TAG}"
            VERSION="${TAG#v}"
            
            # Check if stage release exists and delete it if it does
            if gh release view "${TAG}+stage" --json isPrerelease 2>/dev/null; then
              echo "Promoting from stage release..."
              gh release delete "${TAG}+stage" --cleanup-tag || true
            fi
            
            echo "Creating production release for tag: ${TAG}"
            gh release create "${TAG}" \
              --title "Release: ${VERSION}" \
              --latest
          env:
            GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}
```

### 2. Update Workflow Jobs (In `build_test_deploy` section)

#### A. After `deploy_staging` job, add:

```yaml
      - create_stage_release:
          requires:
            - deploy_staging
          filters:
            tags:
              only: /^v?[0-9]+\.[0-9]+\.[0-9]+(-rc\.[0-9]+)?$/
            branches:
              ignore: /.*/
```

Location: After line 663 (after `deploy_staging` job definition)

#### B. After `run_migrations_production` job, add:

```yaml
      - create_production_release:
          requires:
            - run_migrations_production
          filters:
            tags:
              only: /^v?[0-9]+\.[0-9]+\.[0-9]+$/
            branches:
              ignore: /.*/
```

Location: After line 708 (after `run_migrations_production` job definition)

---

## Complete Workflow Graph (Updated)

This is what the final workflow will look like:

```
                          ┌─ python ──────┐
                          │               │
                    ┌─────┴─ e2e  ────────┴────────┐
                    │                               │
              build_backend                    scorecard_js ────┐
                    │                               │            │
              test_backend_image          test_compose_network ──┼───┐
                    │                               │            │   │
            check_migrations          liveticker_js ┤            │   │
                    │                               │            │   │
    test_compose_network ─────── deploy_staging ───┼───────────┐│   │
                    │                               │           ││   │
                    │                        create_stage_release│   │
                    │                               │           │    │
                    │                        hold_production    │    │
                    │                               │           │    │
                    │                        deploy_production   │    │
                    │                               │           │    │
                    │                    run_migrations_production   │
                    │                               │           │    │
                    └─────────────────────create_production_release  │
                                                    │           │    │
                         ┌──────────────────────────┘           │    │
                         │                                      │    │
                    deploy_demo (manual)                        │    │
                         │                                      │    │
                         └──────────────────────────────────────┴────┘
```

---

## Tag Flow Examples

### Standard Release Flow: `v1.2.3`

```
1. Tag created: v1.2.3
2. CircleCI sees tag, runs pipeline
3. All tests pass
4. deploy_staging succeeds ✅
5. create_stage_release runs:
   └→ Creates: v1.2.3+stage (prerelease, draft)
6. Manual approval required
7. deploy_production succeeds ✅
8. run_migrations_production succeeds ✅
9. create_production_release runs:
   └→ Creates: v1.2.3 (latest)
   └→ Deletes: v1.2.3+stage (promotion)
10. GitHub shows: v1.2.3 as latest release
```

**GitHub Releases after completion:**
- `v1.2.3` — Latest, production-ready
- `v1.2.2`, `v1.2.1`, ... — Previous versions

### Release Candidate Flow: `v1.2.3-rc.1`

```
1. Tag created: v1.2.3-rc.1
2. CircleCI sees tag, runs pipeline
3. All tests pass
4. deploy_staging succeeds ✅
5. create_stage_release runs:
   └→ Creates: v1.2.3-rc.1+stage (prerelease, draft)
6. NO production gate triggered (RC regex doesn't match prod pattern)
7. Pipeline ends - RC release stays in staging only

**GitHub Releases after completion:**
- `v1.2.3-rc.1+stage` — RC testing only
- `v1.2.2` — Latest stable (unchanged)
```

### Demo Release Flow: `v1.2.3+demo.1`

```
1. Tag created: v1.2.3+demo.1
2. CircleCI sees tag, runs pipeline
3. All tests pass
4. deploy_staging SKIPPED (demo tag doesn't match stage pattern)
5. deploy_demo runs instead
6. NO GitHub releases created (demo is excluded)

**GitHub Releases after completion:**
- Unchanged from before
- Demo deployments don't create releases
```

---

## Environment Variables / Secrets

The jobs use `GH_TOKEN` which needs to be available. CircleCI's GitHub integration should provide this automatically, but if it doesn't, you can:

1. Create a GitHub Personal Access Token with `repo` and `contents` scopes
2. Add it to CircleCI as `GITHUB_TOKEN` context variable
3. Update the jobs to use `$GITHUB_TOKEN` instead of `${{ secrets.GITHUB_TOKEN }}`

---

## Testing the Implementation

### Test 1: Verify Stage Release Creation

```bash
# Create a test RC tag
git tag v1.2.3-rc.1
git push origin v1.2.3-rc.1

# Watch CircleCI pipeline
# After deploy_staging succeeds, check GitHub:
gh release list --limit 5
# Should see: v1.2.3-rc.1+stage (draft, prerelease)
```

### Test 2: Verify Production Release Creation

```bash
# Create a test version tag
git tag v1.2.3
git push origin v1.2.3

# Watch CircleCI pipeline
# Approve hold_production manually in CircleCI UI
# After run_migrations_production succeeds, check GitHub:
gh release list --limit 5
# Should see: v1.2.3 (latest, no prerelease)
# Should NOT see: v1.2.3+stage (deleted/promoted)
```

### Test 3: Verify Demo Release (No GitHub Release)

```bash
# Create a demo tag
git tag v1.2.3+demo.1
git push origin v1.2.3+demo.1

# Watch CircleCI pipeline
# After deploy_demo succeeds, check GitHub:
gh release list --limit 5
# Should NOT see v1.2.3+demo.1 (demo releases don't create GitHub releases)
```

---

## Rollback Plan

If something goes wrong:

1. **Stage release created but staging failed?**
   - CircleCI will fail before reaching `create_stage_release`
   - No release created automatically

2. **Stage release exists but production shouldn't?**
   - Delete the stage release manually:
     ```bash
     gh release delete v1.2.3+stage --cleanup-tag
     ```
   - The tag `v1.2.3` remains, can retry pipeline

3. **Production release created but should be recalled?**
   - Create a hotfix tag `v1.2.4` with the fix
   - Delete the bad release:
     ```bash
     gh release delete v1.2.3 --cleanup-tag
     ```
   - Deploy `v1.2.4` as new latest

---

## No Changes Needed

- ✅ `release-please.yaml` — Works as-is, continues to create tags
- ✅ `release-please-automerge.yaml` — Works as-is, continues auto-merging
- ✅ `release-please-finalize.yaml` — Works as-is, continues updating versions
- ✅ `.release-please-manifest.json` — Works as-is
- ✅ `release-please-config.json` — Works as-is
- ✅ Existing CircleCI deployment jobs — No changes needed

**All existing functionality preserved.**
