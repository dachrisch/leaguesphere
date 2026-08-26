---
name: deploy-to-staging
description: Use when the user wants to deploy the current branch to the staging environment. Triggers on keywords like "deploy to stage", "push to staging", "release to staging", "deploy rc".
---

# Deploy to Staging

Triggers the GitHub Actions `deploy.yaml` workflow to deploy to staging.

## Prerequisites

- `gh` CLI must be authenticated (`gh auth status`)
- The current branch must be pushed to origin
- The workflow runs ON the current branch (not master)

## Steps

1. Ensure the current branch is pushed:
   ```bash
   git push
   ```

2. Trigger the staging deploy workflow:
   ```bash
   gh workflow run deploy.yaml -f environment=staging -f bump_type=patch
   ```

3. The workflow will:
   - Compute the next `-rc.N` version
   - Bump version files (`league_manager/__init__.py`, `pyproject.toml`, package.json files)
   - Commit, tag, and push the version bump
   - Print a summary with the new version

4. Return the Actions URL to the user for monitoring.

## Version Bumping

- If current version is `X.Y.Z`, new version becomes `X.Y.(Z+1)-rc.1`
- If current version is already `X.Y.Z-rc.N`, it bumps to `X.Y.Z-rc.(N+1)`
- Use `bump_type=minor` or `bump_type=major` to override the default patch bump

## Post-Deploy

After the workflow completes, the tag (e.g. `v4.19.5-rc.1`) will trigger CircleCI
to build and deploy to the staging server at `leaguesphere_stage.staging-app`.