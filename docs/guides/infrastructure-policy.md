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

### Release Workflow
1. **Development**: Use conventional commits on your feature branch
2. **Release PR**: Merge to master → release-please automatically creates a PR with version bump + changelog
3. **Automerge**: Patch-only releases auto-merge; minor/major require manual approval
4. **Staging (Optional)**: For RC testing before release:
   ```bash
   ./container/deploy.sh stage minor  # Create RC: 3.21.0 → 3.22.0-rc.1
   ```
5. **Production**: CircleCI builds, tests, and waits for manual approval
   ```bash
   ./container/deploy.sh minor  # Finalize RC: 3.22.0-rc.1 → 3.22.0
   ```
6. **Manual Approval (Required)**: Visit CircleCI dashboard and approve the `hold_production` job
7. **Verify**: Ensure all CI checks are GREEN and the production site is functional

### Version Files (Auto-Synced)
DO NOT manually edit version numbers. They are automatically synchronized by the finalize job across:
- `pyproject.toml` (backend version)
- `league_manager/__init__.py`
- All `package.json` files (frontend apps)
- `uv.lock`
