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
- **Automatic Deployment**: `./container/deploy.sh stage` pushes an RC tag; CircleCI pushes the `:staging` images to Docker Hub and `watchtower-dev` swaps the staging containers within ~5 minutes (health-check gated, `blue-green`). Nothing is run on the host.
- **Manual Trigger**: Use `./container/deploy.sh stage` to manually trigger a staging update.
- **Host swap fallback**: a manual `docker compose -f deployed/docker-compose.staging.yaml pull && up -d` is only for rollbacks or a wedged Watchtower — see [deployed/README.md](../../../deployed/README.md).
- **Validation Requirement**: All changes MUST be validated on staging before merging into the `master` branch.

## 🚀 Release Management
**All release workflow and version management is documented in the [Contributor Guide § Maintenance](../guides/contributor-guide.md#-maintenance).** This is the authoritative source for the release-please automation process.

### Summary for Infrastructure Operators
- **Standard path**: Developers use conventional commits → release-please auto-creates version bumps
- **Manual approval**: After release PR merges, CircleCI runs `hold_production` — auto-approved when no game is active or scheduled within 4 hours, manual approval in CircleCI otherwise
- **Host swap**: `watchtower-prod` pulls `:latest` within two hours (health-check gated, `blue-green` for backend/frontend); the pipeline being green does not mean prod is live yet
- **Version sync**: Finalize job automatically syncs all version files — do NOT edit manually
- **RC testing**: Use `./container/deploy.sh stage` for optional release candidate testing on staging
