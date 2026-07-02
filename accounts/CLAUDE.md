# accounts/ — CLAUDE.md

> Module guide. For repo-wide commands, testing setup, and deployment policy see the [root CLAUDE.md](../CLAUDE.md).

## Purpose
Authentication and account management. Provides the REST login/logout/registration flow and
issues the **Knox tokens** that every API client (all the React apps) authenticates with.

## Role in the system
The auth entrypoint for the whole platform. Frontend apps obtain a Knox token here and send it
on subsequent `/api/` calls. It has **no models of its own** — it builds on Django's `User` and
`django-rest-knox`; user-adjacent domain data (`UserProfile`, `Person`, permissions) lives in
[gamedays](../gamedays/CLAUDE.md).

## Key files
- `api.py` — DRF endpoints for login, logout, and current-user info.
- `serializers.py` — user/token serialization.
- `urls.py` — routes below.

## Routes (`urls.py`)
- `knox-auth/` — Knox token auth endpoint.
- `auth/register/`, `auth/login/`, `auth/logout/`, `auth/user/`.

## Conventions & gotchas
- Auth is **token-based (Knox)**, not session cookies — new authenticated endpoints elsewhere
  should expect the Knox `Authorization: Token ...` header.
- Global auth/DRF config lives in [league_manager](../league_manager/CLAUDE.md)`/settings/`, not here.
- Keep permission/role logic aligned with `Permissions`/`UserPermissions` in gamedays.

## Tests
```bash
cd leaguesphere && pytest accounts/tests/test_views.py -v
```
