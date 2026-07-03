# Promote the Gameday Designer & Gate Writes to Staff

**Date:** 2026-07-04
**Status:** Approved (design)

## Problem

Staff currently reach two sibling entries in the "Orga" menu:

- `Spieltag erstellen` → `/gamedays/gameday/new/` — the classic Django form (`GamedayCreateView`, staff-gated).
- `BETA Spieltag designen` → `/gamedays/gameday/design/` — the React gameday designer.

Presenting them as equals, with the designer tagged **BETA**, signals that the designer is "not the safe default" and gives staff no reason to switch. We want to nudge staff toward the designer.

Separately, the designer's access model is inconsistent: the `/design/` page is only `@login_required`, and several write endpoints allow any authenticated user (`IsAuthenticated` / `IsAssociationMemberOrStaff` / `CanApplyTemplate`) to create templates, apply templates, and create teams. We want **writes restricted to staff** while **any authenticated user can view** templates, teams, and gameday details.

## Goals

1. Promote the designer as the recommended way to create a gameday (menu + interstitial chooser).
2. Gate all designer *write* operations to staff; keep *reads* open to any authenticated user.
3. Give non-staff a clean read-only experience and a way to reach the designer in view mode.

## Non-Goals

- No changes to the classic form (`GamedayCreateView`) itself, beyond how it is linked.
- No hard redirect / retirement of the classic form, and no analytics-driven rollout escalation (a possible later tier).
- No full per-control read-only audit of the React app — only the primary write controls are gated (see §4).

## Design

### 1. Menu restructure — collapse to one entry

- `gamedays/menu.py`: the `Spieltag erstellen` item reverses the **new chooser URL** (`LEAGUE_GAMEDAY_CREATE_CHOOSER`) instead of `LEAGUE_GAMEDAY_CREATE`.
- `gameday_designer/menu.py`: **remove** the `BETA Spieltag designen` Orga entry (its promotion moves onto the chooser page). Keep the `📊 Live Status` entry for staff.
- Resulting staff "Orga" dropdown: `Spieltag erstellen` (→ chooser), `📊 Live Status`, `Backend`. No duplicate entry, no BETA badge.

### 2. Chooser page (the interstitial)

- New view `GamedayCreateChooserView` in `gamedays/views.py`: `LoginRequiredMixin` + `UserPassesTestMixin` with `test_func → request.user.is_staff` (creating a gameday is staff-only via either path).
- URL: `path("gameday/create/", GamedayCreateChooserView.as_view(), name=LEAGUE_GAMEDAY_CREATE_CHOOSER)` in `gamedays/urls.py`; constant `LEAGUE_GAMEDAY_CREATE_CHOOSER` in `gamedays/constants.py`.
- Template `gamedays/templates/gamedays/gameday_create_chooser.html`:
  - **Primary card** → `/design/` (reverse `gameday_designer_app:index`): large, labelled "Empfohlen", describes the visual designer.
  - **Secondary link** → `/new/` (reverse `LEAGUE_GAMEDAY_CREATE`): small, de-emphasized "…oder das klassische Formular verwenden".
- Follows the existing form template's Bootstrap styling.

### 3. Backend write-gating

New permission class `IsStaffOrReadOnly` in `gameday_designer/permissions.py`:

```python
class IsStaffOrReadOnly(permissions.BasePermission):
    def has_permission(self, request, view):
        if request.method in permissions.SAFE_METHODS:
            return bool(request.user and request.user.is_authenticated)
        return bool(request.user and request.user.is_staff)

    def has_object_permission(self, request, view, obj):
        if request.method in permissions.SAFE_METHODS:
            return True
        return bool(request.user and request.user.is_staff)
```

Applied as follows in `gameday_designer/views.py`:

| Endpoint | Today | After |
|---|---|---|
| `ScheduleTemplateViewSet` (list/retrieve) | `IsAssociationMemberOrStaff` | `IsStaffOrReadOnly` — read open, create/update/delete staff-only |
| `ScheduleTemplateViewSet` `apply` action | `CanApplyTemplate` (any authenticated) | staff-only (`IsStaffOrReadOnly`; POST ⇒ staff) |
| `TeamCreationView` (POST) | `IsAuthenticated` | `IsStaffOrReadOnly` ⇒ staff-only |
| `TeamBulkCreationView` (POST) | `IsAuthenticated` | `IsStaffOrReadOnly` ⇒ staff-only |
| `LeagueTeamsView` (GET) | `IsAuthenticated` | unchanged (read) |
| `ConfigView` (GET) | `IsAuthenticated` | unchanged (read; extended — see §4) |

Consequence: non-staff association members lose the template create/edit ability that `IsAssociationMemberOrStaff` grants today. This is intended. The now-unused `CanApplyTemplate` (and, if no longer referenced, `IsAssociationMemberOrStaff`) are removed or left only if still used elsewhere — confirm during implementation.

### 4. Frontend read-only awareness (minimal)

- `ConfigView` GET response gains `is_staff: request.user.is_staff`.
- The React app reads `config.is_staff` and hides/disables the **primary write controls** when false: save/update template, apply template, create team / bulk create. This gives non-staff a clean view-only experience instead of clicking into 403s.
- Scope is deliberately minimal — top-level write actions only, not an exhaustive per-control audit.

### 5. Non-staff view-only link

- A `BaseMenu` entry `Spieltag ansehen` → `/design/` (reverse `gameday_designer_app:index`), shown to authenticated **non-staff** users only.
- Placed in a **user-facing** menu group (not the staff "Orga" dropdown). Exact group is confirmed during implementation by inspecting which menu groups non-staff users already see; it must not cause an otherwise-empty dropdown to appear for non-staff.

## Testing (TDD)

- **Permissions:** for each write endpoint — staff → 2xx, non-staff authenticated → 403, anonymous → 401/403; for each read endpoint — non-staff authenticated → 200.
- **Chooser view:** renders for staff (200), forbidden for non-staff (403), and the rendered HTML links to both `/design/` and `/new/`.
- **Menus:** staff "Orga" has a single `Spieltag erstellen` entry pointing at the chooser and no BETA/`designen` entry; non-staff see the `Spieltag ansehen` view-only entry.
- **Config:** `ConfigView` includes `is_staff` reflecting the requesting user.
- **Frontend:** the designer hides the gated write controls when `config.is_staff` is false (component/interaction test consistent with existing React test setup).

## Files Touched

- `gamedays/constants.py`, `gamedays/urls.py`, `gamedays/views.py`, `gamedays/menu.py`
- `gamedays/templates/gamedays/gameday_create_chooser.html` (new)
- `gameday_designer/permissions.py`, `gameday_designer/views.py`, `gameday_designer/menu.py`
- React source under `gameday_designer/src/` (config-driven read-only gating)
- Corresponding tests in `gamedays/` and `gameday_designer/`
