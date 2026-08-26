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
**All release workflow and version management is documented in the [Contributor Guide § Maintenance](contributor-guide.md#-maintenance).** This is the authoritative source for the release-please automation process.

### Summary for Infrastructure Operators
- **Standard path**: Developers use conventional commits → release-please auto-creates version bumps
- **Manual approval**: After release PR merges, CircleCI waits at `hold_production` job (manual approval required)
- **Version sync**: Finalize job automatically syncs all version files — do NOT edit manually
- **RC testing**: Use `./container/deploy.sh stage` for optional release candidate testing on staging
