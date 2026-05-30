# LeagueSphere ![GitHub Tag](https://img.shields.io/github/v/tag/dachrisch/leaguesphere)

[![Website](https://img.shields.io/website?url=https%3A%2F%2Fleaguesphere.app&style=for-the-badge)](https://leaguesphere.app)
[![CircleCI](https://dl.circleci.com/status-badge/img/gh/dachrisch/leaguesphere/tree/master.svg?style=shield)](https://dl.circleci.com/status-badge/redirect/gh/dachrisch/leaguesphere/tree/master)
![Last Commit](https://img.shields.io/github/last-commit/dachrisch/leaguesphere?style=for-the-badge)
[![codecov](https://img.shields.io/codecov/c/github/dachrisch/leaguesphere?style=for-the-badge)](https://codecov.io/gh/dachrisch/leaguesphere)

## Documentation

The project uses a structured documentation approach in the `docs/` directory for clarity and accessibility.

**Primary Resource:**
- **[Contributor Guide](docs/guides/contributor-guide.md)**: Build, Test, Code Style, and Safety Guidelines.

**Specialized Guides:**
- **Setup Guide**: `docs/guides/setup-guide.md` (Local environment configuration).
- **Gemini CLI Guide**: `GEMINI.md`.
- **Claude Code Guide**: `CLAUDE.md`.
- **General Agent Guide**: `AGENTS.md`.

**Directory Structure:**
- `docs/arch/`: Architectural Decision Records (ADR) and system design.
- `docs/features/`: Feature-specific documentation (Current and History).
- `docs/guides/`: Setup, onboarding, and contributor guides.
- `docs/plans/`: Historical and current implementation plans.
- `docs/reports/`: Verification reports, summaries, and performance analysis.
- `docs/testing/`: Test scenarios and testing strategies.

## Installation


This project uses [uv](https://docs.astral.sh/uv/) for package management.

```bash
uv sync --extra test  # Install with test dependencies
```

## Development & Deployment

For comprehensive development guidelines, see **[Contributor Guide](docs/guides/contributor-guide.md)** — the authoritative source for all developers.

**Quick reference:**
```bash
# Install & run
uv sync --extra test
python manage.py runserver

# Test & verify
pytest                                    # Backend tests
npm run test:run                         # Frontend tests (from app dir)
black .                                   # Format backend
npm run eslint                           # Lint frontend

# Migrations
python manage.py makemigrations
python manage.py migrate

# Static files
python manage.py collectstatic
```

See the **[docs/guides/](docs/guides/)** directory for:
- **[Contributor Guide](docs/guides/contributor-guide.md)** — Build, test, release workflow
- **[Coding Standards](docs/guides/coding-standards.md)** — Code rules and linting standards
- **[Infrastructure Policy](docs/guides/infrastructure-policy.md)** — Deployment safety protocols
- **[Setup Guide](docs/guides/setup-guide.md)** — Local environment configuration
