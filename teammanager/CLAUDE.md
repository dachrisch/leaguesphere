# teammanager/ — CLAUDE.md

> Module guide. For repo-wide commands, testing setup, and deployment policy see the [root CLAUDE.md](../CLAUDE.md).

## Purpose
The management UI for **teams, clubs, users, and player rosters** — CRUD screens for registering
teams, editing rosters, handling player transfers, and viewing achievements.

## Role in the system
A view/forms layer over domain models owned by [gamedays](../gamedays/CLAUDE.md) — `teammanager`
has **no `models.py` of its own** and imports `gamedays.models` (`Team`, `Person`, etc.). It is the
primary human-facing entry point for team data that scheduling and scoring then consume.

## Key files
- `views.py` — the CRUD views (imports `gamedays.models`).
- `forms.py` — team/user/player forms.
- `urls.py` — routes below.

## Routes (`urls.py`)
Team CRUD: `addteam/`, `team/<id>`, `editteam/<id>`, `deleteteam/<id>`.
User CRUD: `createuser/<team_id>`, `edituser/<user_id>`, `deleteuser/<user_id>`.
Players: `playerdetail/<player_id>`, `uploadplayers/<team_id>` (bulk upload), `achievements/`.

## Conventions & gotchas
- **Do not add domain models here** — teams/persons are defined in gamedays; add fields there.
- `uploadplayers/` does bulk roster import; validate against gamedays' `Team` relationships.
- Player eligibility rules for gamedays are enforced in [passcheck](../passcheck/CLAUDE.md), not here.

## Tests
```bash
cd leaguesphere && pytest teammanager
```
