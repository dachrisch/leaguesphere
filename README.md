# LeagueSphere ![GitHub Tag](https://img.shields.io/github/v/tag/dachrisch/leaguesphere)

[![License: AGPL v3](https://img.shields.io/badge/License-AGPL_v3-blue.svg)](https://www.gnu.org/licenses/agpl-3.0)
[![Website](https://img.shields.io/website?url=https%3A%2F%2Fleaguesphere.app&style=for-the-badge)](https://leaguesphere.app)
[![CircleCI](https://dl.circleci.com/status-badge/img/gh/dachrisch/leaguesphere/tree/master.svg?style=shield)](https://dl.circleci.com/status-badge/redirect/gh/dachrisch/leaguesphere/tree/master)
![Last Commit](https://img.shields.io/github/last-commit/dachrisch/leaguesphere?style=for-the-badge)
[![codecov](https://img.shields.io/codecov/c/github/dachrisch/leaguesphere?style=for-the-badge)](https://codecov.io/gh/dachrisch/leaguesphere)

## Documentation

The project uses a structured documentation approach in the `docs/` directory for clarity and accessibility.

**Primary Resource:**
- **[Contributor Guide](docs/topics/guides/contributor-guide.md)**: Build, Test, Code Style, and Safety Guidelines.

**Specialized Guides:**
- **Setup Guide**: `docs/topics/guides/setup-guide.md` (Local environment configuration).
- **Gemini CLI Guide**: `GEMINI.md`.
- **Claude Code Guide**: `CLAUDE.md`.
- **General Agent Guide**: `AGENTS.md`.

**Directory Structure:**
- `docs/topics/architecture/`: Architectural Decision Records (ADR) and system design.
- `docs/features/`: Feature-specific documentation (Current and History).
- `docs/guides/`: Setup, onboarding, and contributor guides.
- `docs/plans/`: Historical and current implementation plans.
- `docs/reports/`: Verification reports, summaries, and performance analysis.
- `docs/topics/testing/`: Test scenarios and testing strategies.

## Installation


This project uses [uv](https://docs.astral.sh/uv/) for package management.

```bash
uv sync --extra test  # Install with test dependencies
```

## Licence

LeagueSphere is **[AGPL-3.0-or-later](LICENSE)**.

- **Self-hosting is free, forever.** Any league, club or association may run
  LeagueSphere without paying, asking or registering anything.
- **Commercial use is allowed.** Hosting, support and customisation may be
  sold.
- **One condition:** if you run a *modified* LeagueSphere as a network
  service, publish the source of the version your users are using (AGPL §13).
  Improvements then come back to everyone instead of disappearing into a
  private fork.

**Releases up to and including v4.43.x remain CC0-1.0.** That dedication is
irrevocable — those releases stay public domain, with no copyleft obligation.
The new licence governs the current release and future commits only.

The code licence does not grant the LeagueSphere name or logo; see
[TRADEMARKS.md](TRADEMARKS.md). The plain-language explainer, including a
compliance checklist for commercial hosts, is
[docs/topics/guides/licensing.md](docs/topics/guides/licensing.md); contribution
rules and the required DCO sign-off are in [CONTRIBUTING.md](CONTRIBUTING.md).

## Development & Deployment

For comprehensive development guidelines, see **[Contributor Guide](docs/topics/guides/contributor-guide.md)** — the authoritative source for all developers.

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
- **[Contributor Guide](docs/topics/guides/contributor-guide.md)** — Build, test, release workflow
- **[Coding Standards](docs/topics/guides/coding-standards.md)** — Code rules and linting standards
- **[Infrastructure Policy](docs/topics/deployment/infrastructure-policy.md)** — Deployment safety protocols
- **[Setup Guide](docs/topics/guides/setup-guide.md)** — Local environment configuration
