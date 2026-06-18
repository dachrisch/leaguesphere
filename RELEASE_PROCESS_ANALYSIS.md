# Release Process Analysis & Recommendations

## Current Release Flow

```
GitHub Actions (release-please.yaml)
  ↓
  └─→ release-please-action creates PR with version bumps
        │
        ├─→ release-please-finalize.yaml
        │   └─→ Updates version files + uv.lock
        │
        ├─→ release-please-automerge.yaml
        │   └─→ Waits for CircleCI checks → Auto-merges PR
        │
        └─→ release-please creates GitHub release + tag immediately
             ↓
             CircleCI receives tag → Runs deployment jobs
             (GitHub release already exists, even if CircleCI fails)
             └─→ deploy_staging → hold_production → deploy_production
```

### Current Issues

1. **GitHub release created BEFORE CircleCI runs** - If CircleCI fails, the release already exists
2. **No separation between stage and production releases** - Single release covers both deployments
3. **Cannot tie GitHub release to CI success** - Tag triggers CI, but CI failure doesn't affect release
4. **Tightly coupled to release-please** - Hard to use other tooling to create tags

---

## Recommended Solution: Tag-Driven CircleCI Release Management

**Keep release-please as-is** (it creates tags naturally). Use CircleCI to **inspect tag patterns and job outcomes**, then create GitHub releases only when deployment stages succeed.

### Tag Pattern Analysis

Current CircleCI filtering already defines release types:

| Tag Pattern | Deployment | Release Type |
|-------------|-----------|--------------|
| `v1.2.3` or `1.2.3` | stage → prod | **Production** |
| `v1.2.3-rc.1` | stage only | **Release Candidate** |
| `v1.2.3+demo.N` | demo only | **Demo** |

### Architecture

```
Any tag creation (release-please, manual, API, etc.)
  ↓
CircleCI triggered by tag
  ├─→ python, e2e, build, test jobs
  │
  ├─→ deploy_staging succeeds
  │   └─→ create_stage_release: v1.2.3+stage (marked as pre-release)
  │
  ├─→ hold_production approval (manual gate)
  │   └─→ Only for tags matching /^v?[0-9]+\.[0-9]+\.[0-9]+$/
  │
  ├─→ deploy_production succeeds
  │   └─→ create_production_release: v1.2.3 (marked as latest)
  │
  └─→ run_migrations_production succeeds
      └─→ Release is now live

Key: GitHub releases created ONLY after corresponding stage succeeds
```

### Why This Approach

1. **Tool-Agnostic** - Works with any tag source (release-please, manual, other automation)
2. **CI-Driven** - Release exists only if deployment proves it works
3. **Auto-Detection** - Tag pattern determines release type (no config needed)
4. **No Interdependencies** - Release-please doesn't know about CircleCI, CircleCI doesn't need release-please config
5. **Self-Healing** - If tag created but CI fails, just retry tag → rebuild happens
6. **Audit Trail** - Each GitHub release maps to a successful deployment

---

## Implementation: Tag-Driven Release Jobs

### 1. Add Release Jobs to CircleCI Config

Add these jobs to `.circleci/config.yml`:

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

### 2. Update Workflow to Call Release Jobs

Find the `workflows` section and update `build_test_deploy`:

```yaml
workflows:
  version: 2
  build_test_deploy:
    jobs:
      # ... existing jobs (python, e2e, scorecard_js, etc.)
      
      - build_backend:
          requires:
            - python
            - e2e
          filters:
            tags:
              only: /.*/
      - build_frontend:
          requires:
            - scorecard_js
            - liveticker_js
            - passcheck_js
            - gameday_designer_js
            - journey_dashboard_js
          filters:
            tags:
              only: /.*/
      
      # ... test_backend_image, test_frontend_image, check_migrations, test_compose_network ...
      
      # STAGE RELEASE: Only for version tags with -rc or base versions
      - deploy_staging:
          context: staging
          requires:
            - test_compose_network
          filters:
            tags:
              only: /^v?[0-9]+\.[0-9]+\.[0-9]+(-rc\.[0-9]+)?$/
            branches:
              ignore: /.*/
      
      - create_stage_release:
          requires:
            - deploy_staging
          filters:
            tags:
              # Stage release for: vX.Y.Z or X.Y.Z or vX.Y.Z-rc.N
              only: /^v?[0-9]+\.[0-9]+\.[0-9]+(-rc\.[0-9]+)?$/
            branches:
              ignore: /.*/
      
      # PRODUCTION RELEASE: Only for version tags without -rc or +demo
      - hold_production:
          type: approval
          requires:
            - test_compose_network
          filters:
            tags:
              only: /^v?[0-9]+\.[0-9]+\.[0-9]+$/
            branches:
              ignore: /.*/
      
      - deploy_production:
          context: production
          requires:
            - hold_production
          filters:
            tags:
              only: /^v?[0-9]+\.[0-9]+\.[0-9]+$/
      
      - run_migrations_production:
          context: production
          requires:
            - deploy_production
          filters:
            tags:
              only: /^v?[0-9]+\.[0-9]+\.[0-9]+$/
      
      - create_production_release:
          requires:
            - run_migrations_production
          filters:
            tags:
              only: /^v?[0-9]+\.[0-9]+\.[0-9]+$/
            branches:
              ignore: /.*/
      
      # DEMO RELEASE: Existing demo jobs (no GitHub release needed)
      - deploy_demo:
          context: demo
          requires:
            - test_compose_network
          filters:
            tags:
              only: /.*\+demo\.[0-9]+$/
            branches:
              ignore: /.*/
```

---

## Release Lifecycle by Tag Type

### Standard Release: `v1.2.3`

```
[tag created: v1.2.3]
  ↓
[CircleCI runs all tests]
  ↓
[deploy_staging succeeds]
  ↓
[create_stage_release: v1.2.3+stage] ← Created as draft/prerelease
  ↓
[Manual approval gate]
  ↓
[deploy_production succeeds]
  ↓
[run_migrations_production succeeds]
  ↓
[create_production_release: v1.2.3] ← Final release, marked as latest
  ↓
v1.2.3+stage release is deleted/closed
Release is now live
```

### Release Candidate: `v1.2.3-rc.1`

```
[tag created: v1.2.3-rc.1]
  ↓
[CircleCI runs all tests]
  ↓
[deploy_staging succeeds]
  ↓
[create_stage_release: v1.2.3-rc.1+stage] ← Created as draft
  ↓
[No production gate - RC testing only in staging]
Release ends here - not promoted to production
```

### Demo Release: `v1.2.3+demo.1`

```
[tag created: v1.2.3+demo.1]
  ↓
[CircleCI runs all tests]
  ↓
[deploy_demo only - no staging]
  ↓
[No GitHub release created - demo only]
```

---

## Key Characteristics

| Aspect | Design |
|--------|--------|
| **Tool Independence** | ✅ Works with release-please, manual tags, API tags, anything |
| **Release-Please Agnostic** | ✅ No integration needed; release-please unaware of release creation |
| **Failure Safe** | ✅ Release only exists if deployment succeeds |
| **Stage/Prod Separation** | ✅ Two distinct releases: `v1.2.3+stage` and `v1.2.3` |
| **Audit Trail** | ✅ Each release tied to successful CircleCI jobs |
| **Tag Pattern-Based** | ✅ Release type auto-detected from tag regex |
| **No External Triggers** | ✅ Pure pull-based: CircleCI sees tag → runs → creates release |

---

## Migration Path (Minimal)

1. **Configure release-please to skip GitHub release** in `.github/workflows/release-please.yaml`:
   - Add: `skip-github-release: true`
   - This lets release-please create the tag (triggers CircleCI) but not the release

2. **Add two new jobs** to CircleCI config: `create_stage_release`, `create_production_release`

3. **Update CircleCI workflow** to call these jobs after respective deployments succeed

4. **Test** with next release tag

5. **Verify** stage release is created after staging, prod release after production

**Result**: Same release-please behavior, but GitHub releases created by CircleCI when deployments succeed.

---

## Validation Checklist

- [ ] Stage release (`v1.2.3+stage`) created after `deploy_staging` succeeds
- [ ] Stage release is marked as draft/prerelease in GitHub
- [ ] Production release (`v1.2.3`) created after `run_migrations_production` succeeds
- [ ] Production release marked as latest
- [ ] Stage release deleted or superseded when production release created
- [ ] RC releases only get stage release (no production release)
- [ ] Demo releases don't trigger GitHub releases
- [ ] Release notes include deployment timestamp and success details

---

## Questions for Your Team

1. Should **stage releases be deleted** when production succeeds, or **kept as artifacts**?
2. Should **release notes be auto-populated** from commits between tags?
3. Should there be a **time buffer** between staging and production approval?
4. Do you want **different release notes** for stage vs production?
