# LeagueSphere Contributor Guide

Welcome! This guide is the **central source of truth** for all contributors, developers, and autonomous agents working on LeagueSphere.

## 📁 Essential Documentation

- **[System Architecture](@docs/arch/architecture-overview.md)**: High-level overview of the backend and frontend stack.
- **[Coding Standards](@docs/guides/coding-standards.md)**: Rules for Python, TypeScript, and CSS.
- **[Infrastructure Policy](@docs/guides/infrastructure-policy.md)**: Mandatory deployment and server management protocols.
- **[Setup Guide](@docs/guides/setup-guide.md)**: Instructions for local development environment configuration.

## 📂 Project Structure Overview

- `accounts/`: User authentication and token management.
- `gamedays/`: Core tournament and scheduling logic.
- `gameday_designer/`: Visual scheduling tool (React).
- `passcheck/`: Player eligibility verification (React).
- `liveticker/`: Real-time fan updates (React).
- `scorecard/`: On-field results entry (React).
- `container/`: Infrastructure, Dockerfiles, and deployment scripts.

Refer to the **[Project README](@README.md)** for a full directory list.

## 🏗 Build, Lint & Test Commands

### Backend (Python/Django)
- **Install Dependencies**: `uv sync --extra test`
- **Database Migrations**: `python manage.py migrate`
- **Format/Lint**: `black .`
- **Run All Tests**:
  ```bash
  # Requires LXC test DB
  ./container/spinup_test_db.sh
  export MYSQL_HOST=$(lxc list servyy-test --format json | jq -r '.[0].state.network.eth0.addresses[] | select(.family=="inet") | .address' | head -n 1)
  pytest
  ```

### Frontend (React/TypeScript)
*Commands for any app (e.g., `passcheck/`, `gameday_designer/`)*:
- **Install**: `npm install`
- **Build**: `npm run build`
- **Run Tests**: `npm run test:run`
- **Lint**: `npm run eslint`

## ✅ Code Quality Requirements (MANDATORY)

**All code MUST meet these requirements before pushing to remote:**

| Requirement | Backend | Frontend | Enforcement |
|---|---|---|---|
| **Tests** | ✅ pytest | ✅ vitest | CI blocks merge without tests |
| **Code Format** | ✅ `black .` | ⚠️ Optional | Manual review |
| **Linting** | ⚠️ Optional | ✅ `npm run eslint` (ZERO errors) | **CI BLOCKS MERGE** on any error |
| **Type Safety** | Type hints | No `any` types | **CI BLOCKS MERGE** on violations |
| **Security** | Input validation | Secure randomness | Code review enforcement |

See **[Coding Standards](coding-standards.md)** for detailed rules, examples, and linting requirements.

## 🎨 Core Development Workflow

### 1. Test-Driven Development (TDD)
We strictly follow the **RED -> GREEN -> REFACTOR** cycle. All code changes MUST be accompanied by relevant tests.

### 2. Git & Branching Protocol
- **No Direct Commits to Master**: Always use a feature branch.
- **Conventional Commits**: Format messages as `feat:`, `fix:`, `refactor:`, etc.
- **Pull Requests (PR)**:
  - Create PRs in **origin** (`dachrisch/leaguesphere`).
  - Use `gh pr create --repo dachrisch/leaguesphere --base master --title "..." --body "..."` for non-interactive creation.
  - At least **90% patch coverage** is required for PRs.

### 3. Verification & Completion — MANDATORY CHECKS
Before reporting a task as finished, you MUST pass all of the following:

1.  **Run Full Test Suite**: Ensure ALL tests (backend & frontend) are green.
    ```bash
    # Backend
    pytest
    
    # Frontend (in each app directory)
    npm run test:run
    ```

2.  **Code Quality & Linting**: Pass all checks before pushing.
    - **Backend**: `black .` — Code MUST be black-formatted
    - **Frontend**: `npm run eslint` — Code MUST pass ESLint with ZERO errors
    - **Details**: See **[Coding Standards § Linting Standards](coding-standards.md#-linting-standards)** for all enforced rules and examples

3.  **Staging Validation**: Verify the fix on [stage.leaguesphere.app](https://stage.leaguesphere.app).

4.  **Production Approval**: Manually approve the `hold_production` job in the CircleCI dashboard to complete the deployment.

## 🛠 Maintenance

### Version Management (Automated via release-please)
LeagueSphere uses **release-please** for fully automated semantic versioning. **You don't need to manually manage versions** — just merge your PR with conventional commits.

**Conventional Commits** trigger automatic version bumps:
- `fix:` → Patch bump (e.g., 3.21.0 → 3.21.1)
- `feat:` → Minor bump (e.g., 3.21.0 → 3.22.0)
- `BREAKING CHANGE:` in commit body → Major bump (e.g., 3.21.0 → 4.0.0)

**Standard Release Process** (most common):
1. **Merge PR** to master with conventional commits
2. **release-please** automatically creates a release PR with version bump + changelog
3. **Auto-merge or manual merge** depending on release type:
   - Patch releases: Auto-merge (no action needed)
   - Minor/major: Manual merge required (for safety)
4. **Finalize job** syncs versions across all files:
   - `pyproject.toml`, `league_manager/__init__.py`
   - All `package.json` files (frontend apps)
   - `uv.lock`
5. **CircleCI deployment** proceeds to `hold_production` awaiting manual approval

**Optional: Manual/Staging Release** (for RC testing):
```bash
# Create release candidate
./container/deploy.sh stage minor          # 3.21.0 → 3.22.0-rc.1

# Test on staging.leaguesphere.app, then finalize
./container/deploy.sh minor                # 3.22.0-rc.1 → 3.22.0
```

**⚠️ Important**: 
- Do NOT manually edit version files — they are automatically synchronized
- Do NOT use `./container/deploy.sh major|minor|patch` for normal releases — only for manual/RC workflows
- The finalize job automatically handles version sync after PR merge

### Feature Documentation
- Document progress in `docs/features/current/` for in-progress features
- Move completed features to `docs/features/history/` after release
- Include problem statement, solution approach, and test results
