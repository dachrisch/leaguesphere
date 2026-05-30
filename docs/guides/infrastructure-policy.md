# Infrastructure and Deployment Policy

This document defines the mandatory protocols for managing LeagueSphere's infrastructure and production environments.

## 🚨 Critical Safety Rule
**NEVER EDIT FILES DIRECTLY ON PRODUCTION SERVERS.**
Direct manual modification (SSH + vi/nano) is strictly forbidden to ensure consistency and reproducibility through Ansible.

## 🛠 Infrastructure Management (Ansible)
All server configurations are managed via Ansible playbooks located in `infrastructure/container/`.

### Deployment Protocol
1. **Develop Fix**: Modify the appropriate Ansible playbooks or Docker configurations.
2. **Test First**: Deploy to `servyy-test.lxd` (`10.185.182.207`) using the Ansible test inventory.
3. **Validate**: Thoroughly verify all configurations and services on the test host.
4. **Production**: Only deploy to the production host (`lehel.xyz`) AFTER successful verification in the test environment.

## 📦 Staging Environment
Staging provides a near-production environment for final validation before a release.

- **URL**: [https://stage.leaguesphere.app](https://stage.leaguesphere.app)
- **Automatic Deployment**: CI/CD pipelines push successful `:staging` images to the staging host.
- **Manual Trigger**: Use `./container/deploy.sh stage` to manually trigger a staging update.
- **Validation Requirement**: All changes MUST be validated on staging before merging into the `master` branch.

## 🚀 Release Management
LeagueSphere uses **release-please** for fully automated semantic versioning based on conventional commits. All development workflow and version management is documented in the **[Contributor Guide § Maintenance](contributor-guide.md#-maintenance)**.

### Automated Version Bumping (via Conventional Commits)
- `fix: ...` commits → Patch bump (3.21.0 → 3.21.1)
- `feat: ...` commits → Minor bump (3.21.0 → 3.22.0)
- `BREAKING CHANGE:` in body → Major bump (3.21.0 → 4.0.0)

### Standard Release Workflow (Automatic)
**Most common path** — just merge your PR:

1. **Development**: Use conventional commits on your feature branch
2. **Merge to master**: Create PR with `feat:`, `fix:`, or `BREAKING CHANGE:` commits
3. **Auto Release**: After merge, release-please automatically:
   - Creates a release PR with version bump and changelog
   - Auto-merges patch-only releases
   - Waits for manual merge on minor/major
4. **Finalize**: After release PR merge, finalize job:
   - Syncs versions across all files
   - Commits and pushes `uv.lock` updates
5. **Deploy**: CircleCI builds and waits for manual approval on `hold_production` job
6. **Verify**: All CI checks GREEN and production site functional

### Manual/Staging Workflow (Optional)
For release candidate testing before production:

```bash
./container/deploy.sh stage minor   # Create RC: 3.21.0 → 3.22.0-rc.1
# Test on staging.leaguesphere.app
./container/deploy.sh minor         # Finalize: 3.22.0-rc.1 → 3.22.0
```

**Do NOT use `./container/deploy.sh major|minor|patch` for normal releases** — release-please handles this automatically.

### Version Files (Auto-Synced)
DO NOT manually edit version numbers. They are automatically synchronized by the finalize job across:
- `pyproject.toml` (backend version)
- `league_manager/__init__.py`
- All `package.json` files (frontend apps)
- `uv.lock`
