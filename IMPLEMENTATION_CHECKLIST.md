# Implementation Checklist: Tag-Driven Release Management

## Files to Modify

### ✅ DONE: Release-Please Configuration

**File:** `.github/workflows/release-please.yaml`

**Change:** Add `skip-github-release: true`

```diff
      - uses: googleapis/release-please-action@v5
        id: release
        with:
          config-file: release-please-config.json
          token: ${{ secrets.RELEASE_PLEASE_TOKEN }}
+         skip-github-release: true
```

**Verification:**
```bash
git diff .github/workflows/release-please.yaml
# Should show the skip-github-release: true line added
```

---

### TODO: CircleCI Configuration

**File:** `.circleci/config.yml`

**Changes:** 
1. Add two new jobs before `workflows:` section
2. Add two new job calls in the workflow

#### Step 1: Add Jobs (around line 573, before `workflows:`)

After the `run_migrations_production` job, add:

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

#### Step 2: Add Job Calls in Workflow

After `deploy_staging` (around line 663):

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

After `run_migrations_production` (around line 708):

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

**Verification:**
```bash
# Check syntax
circleci config validate .circleci/config.yml

# View the changes
git diff .circleci/config.yml | head -100
```

---

## Files That DON'T Need Changes

These files work as-is with the new approach:

- ✅ `.release-please-manifest.json` — No change
- ✅ `release-please-config.json` — No change  
- ✅ `.github/workflows/release-please-automerge.yaml` — No change
- ✅ `.github/workflows/release-please-finalize.yaml` — No change
- ✅ `pyproject.toml` — No change
- ✅ `league_manager/__init__.py` — No change
- ✅ All `package.json` files — No change
- ✅ All deployment scripts — No change
- ✅ `.circleci/config.yml` existing jobs — No change to logic

---

## Testing Sequence

### Test 1: Release Candidate (Staging Only)

```bash
# Create RC tag
git tag v3.26.20-rc.1
git push origin v3.26.20-rc.1

# Monitor CircleCI: https://circleci.com/gh/dachrisch/leaguesphere/pipelines

# Expected timeline:
# 1. CircleCI starts all tests
# 2. deploy_staging succeeds (after ~30 mins)
# 3. create_stage_release runs
# 4. Check GitHub releases
#    gh release list | grep v3.26.20-rc
#    Should see: v3.26.20-rc.1+stage (draft, prerelease)
# 5. No production deployment (RC only)

# Verify
gh release view v3.26.20-rc.1+stage
# Should show: "prerelease: true", "draft: true"
```

### Test 2: Full Release (Staging → Prod)

```bash
# Create version tag
git tag v3.26.20
git push origin v3.26.20

# Monitor CircleCI

# Expected timeline:
# 1. All tests run
# 2. deploy_staging succeeds
# 3. create_stage_release creates: v3.26.20+stage
#    (Can see in GitHub: https://github.com/dachrisch/leaguesphere/releases)
# 4. Manual approval gate in CircleCI UI
#    (Approve "hold_production" job)
# 5. deploy_production succeeds
# 6. run_migrations_production succeeds
# 7. create_production_release runs:
#    - Creates: v3.26.20 (latest)
#    - Deletes: v3.26.20+stage (promotion)
# 8. Check GitHub releases
#    gh release list | head
#    Should show: v3.26.20 as latest, NO v3.26.20+stage

# Verify
gh release view v3.26.20
# Should show: "latest: true", "prerelease: false", "draft: false"
```

### Test 3: Demo Release (No GitHub Release)

```bash
# Create demo tag
git tag v3.26.20+demo.1
git push origin v3.26.20+demo.1

# Monitor CircleCI

# Expected timeline:
# 1. Tests run
# 2. deploy_demo runs (skips staging)
# 3. NO GitHub release created (demo-only)

# Verify
gh release list | grep demo
# Should show nothing (no demo releases in GitHub)
```

---

## Rollback Procedure

If something goes wrong during testing:

```bash
# Delete the test tag and release
git tag -d v3.26.20-rc.1
git push origin --delete v3.26.20-rc.1

gh release delete v3.26.20-rc.1+stage --cleanup-tag

# CircleCI pipeline will stop automatically
```

---

## Pre-Implementation Checklist

Before making changes:

- [ ] Backup current workflows (commit current state)
- [ ] Review the three analysis documents
- [ ] Understand the tag patterns (RC vs full vs demo)
- [ ] Verify you have `gh` CLI installed locally
- [ ] Verify CircleCI token has `repo` permissions
- [ ] Have CircleCI UI open for monitoring

---

## Implementation Steps

1. **Make release-please change** (1 line):
   ```bash
   # Edit .github/workflows/release-please.yaml
   # Add: skip-github-release: true
   ```

2. **Make CircleCI changes** (~66 lines):
   ```bash
   # Edit .circleci/config.yml
   # - Add create_stage_release job (~20 lines)
   # - Add create_production_release job (~20 lines)
   # - Add create_stage_release call (~8 lines)
   # - Add create_production_release call (~8 lines)
   ```

3. **Commit changes**:
   ```bash
   git add .github/workflows/release-please.yaml .circleci/config.yml
   git commit -m "feat: implement tag-driven CircleCI release management"
   git push origin master
   ```

4. **Test with RC tag** (low risk):
   ```bash
   git tag v3.26.20-rc.1
   git push origin v3.26.20-rc.1
   # Monitor in CircleCI, verify stage release created
   # Rollback if needed: git push origin --delete v3.26.20-rc.1
   ```

5. **Test with full release** (if RC test passes):
   ```bash
   git tag v3.26.20
   git push origin v3.26.20
   # Monitor entire flow including production approval
   # Verify both stage release (temporary) and prod release (final) created
   ```

6. **Document in team** - Share the three analysis documents

---

## Success Criteria

After implementation:

- ✅ Release-please creates tag without GitHub release
- ✅ CircleCI runs full pipeline on tag
- ✅ Stage release (v1.2.3+stage) created after staging succeeds
- ✅ Production release (v1.2.3) created after production succeeds
- ✅ Stage release deleted when production release created (promotion)
- ✅ GitHub release timeline matches deployment timeline
- ✅ RC releases only create stage release (no prod)
- ✅ Demo releases create no GitHub releases

---

## Support

If issues arise:

1. Check CircleCI job output for `gh release create` errors
2. Verify `GITHUB_TOKEN` is available in CircleCI context
3. Check GitHub API rate limits: `gh api rate-limit`
4. Review release-please action docs: https://github.com/googleapis/release-please-action
5. Ask for help in team Slack/Discord with the CircleCI job URL
