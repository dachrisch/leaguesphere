# Promote the Gameday Designer & Gate Writes to Staff — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Promote the React gameday designer as the recommended way to create a gameday and restrict all designer write operations to staff while keeping reads open to any authenticated user.

**Architecture:** A new `IsStaffOrReadOnly` DRF permission gates the designer's write endpoints; a new staff-only chooser page becomes the single "Spieltag erstellen" menu target and presents the designer as primary; `ConfigView` exposes `is_staff` so the React app hides write controls for non-staff; a user-facing menu entry lets non-staff open the designer read-only.

**Tech Stack:** Django 5.2, Django REST Framework, pytest / pytest-django, React + TypeScript (Vite), Vitest.

## Global Constraints

- Design spec: `docs/superpowers/specs/2026-07-04-designer-promotion-write-gating-design.md`.
- Reads (`GET`/`HEAD`/`OPTIONS`) stay open to any authenticated user; writes require `is_staff`.
- No changes to `GamedayCreateView` (`/new/`) behavior — only how it is linked.
- Frontend gating is minimal: hide the primary write controls only, no exhaustive per-control audit.
- Commit messages: Conventional Commits. End each commit body with:
  `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`
- Run Python tests from the `leaguesphere/` directory; run React tests from `gameday_designer/`.
- German UI copy, matching existing menu/label conventions.

---

### Task 1: `IsStaffOrReadOnly` permission class

**Files:**
- Modify: `gameday_designer/permissions.py`
- Test: `gameday_designer/tests/test_permissions.py`

**Interfaces:**
- Produces: `IsStaffOrReadOnly` — a `rest_framework.permissions.BasePermission` subclass. `has_permission(request, view)` returns True for `SAFE_METHODS` when authenticated, else requires `request.user.is_staff`. `has_object_permission(request, view, obj)` returns True for `SAFE_METHODS`, else requires `is_staff`.

- [ ] **Step 1: Write the failing test**

Append to `gameday_designer/tests/test_permissions.py` (fixtures `api_factory`, `staff_user`, `association_user` already exist in this file):

```python
class TestIsStaffOrReadOnly:
    """Tests for the IsStaffOrReadOnly permission."""

    def _perm(self):
        from gameday_designer.permissions import IsStaffOrReadOnly
        return IsStaffOrReadOnly()

    def test_get_allowed_for_authenticated_non_staff(self, api_factory, association_user):
        request = api_factory.get("/")
        request.user = association_user
        assert self._perm().has_permission(request, None) is True

    def test_get_denied_for_anonymous(self, api_factory):
        request = api_factory.get("/")
        request.user = AnonymousUser()
        assert self._perm().has_permission(request, None) is False

    def test_post_denied_for_non_staff(self, api_factory, association_user):
        request = api_factory.post("/")
        request.user = association_user
        assert self._perm().has_permission(request, None) is False

    def test_post_allowed_for_staff(self, api_factory, staff_user):
        request = api_factory.post("/")
        request.user = staff_user
        assert self._perm().has_permission(request, None) is True

    def test_object_write_denied_for_non_staff(self, api_factory, association_user):
        request = api_factory.delete("/")
        request.user = association_user
        assert self._perm().has_object_permission(request, None, object()) is False
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd leaguesphere && python -m pytest gameday_designer/tests/test_permissions.py::TestIsStaffOrReadOnly -v`
Expected: FAIL with `ImportError`/`cannot import name 'IsStaffOrReadOnly'`.

- [ ] **Step 3: Write minimal implementation**

Append to `gameday_designer/permissions.py`:

```python
class IsStaffOrReadOnly(permissions.BasePermission):
    """Read for any authenticated user; write requires staff."""

    def has_permission(self, request, view):
        if request.method in permissions.SAFE_METHODS:
            return bool(request.user and request.user.is_authenticated)
        return bool(request.user and request.user.is_staff)

    def has_object_permission(self, request, view, obj):
        if request.method in permissions.SAFE_METHODS:
            return True
        return bool(request.user and request.user.is_staff)
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd leaguesphere && python -m pytest gameday_designer/tests/test_permissions.py::TestIsStaffOrReadOnly -v`
Expected: PASS (5 passed).

- [ ] **Step 5: Commit**

```bash
git add gameday_designer/permissions.py gameday_designer/tests/test_permissions.py
git commit -m "feat(designer): add IsStaffOrReadOnly permission"
```

---

### Task 2: Gate `ScheduleTemplateViewSet` (CRUD + apply) to staff

**Files:**
- Modify: `gameday_designer/views.py:73` (viewset `permission_classes`), `gameday_designer/views.py:79-84` (`get_permissions`), and the import line `from gameday_designer.permissions import IsAssociationMemberOrStaff, CanApplyTemplate`
- Test: `gameday_designer/tests/test_api.py`

**Interfaces:**
- Consumes: `IsStaffOrReadOnly` from Task 1.
- Produces: template list/retrieve readable by any authenticated user; create/update/delete/apply require staff (403 otherwise).

- [ ] **Step 1: Write the failing test**

Append to `gameday_designer/tests/test_api.py` (uses shared `api_client`, `staff_user`, `association_user` fixtures from conftest). Minimal valid create payload mirrors `ScheduleTemplate` required fields:

```python
@pytest.mark.django_db
class TestTemplateWriteGating:
    URL = "/api/designer/templates/"

    PAYLOAD = {
        "name": "Gated Template",
        "description": "x",
        "num_teams": 6,
        "num_fields": 2,
        "num_groups": 1,
        "game_duration": 70,
    }

    def test_non_staff_can_list(self, api_client, association_user):
        api_client.force_authenticate(user=association_user)
        assert api_client.get(self.URL).status_code == 200

    def test_non_staff_cannot_create(self, api_client, association_user):
        api_client.force_authenticate(user=association_user)
        assert api_client.post(self.URL, self.PAYLOAD, format="json").status_code == 403

    def test_staff_can_create(self, api_client, staff_user):
        api_client.force_authenticate(user=staff_user)
        assert api_client.post(self.URL, self.PAYLOAD, format="json").status_code == 201
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd leaguesphere && python -m pytest gameday_designer/tests/test_api.py::TestTemplateWriteGating -v`
Expected: `test_non_staff_cannot_create` FAILS (returns 201, non-staff can currently create).

- [ ] **Step 3: Write minimal implementation**

In `gameday_designer/views.py`, change the import:

```python
from gameday_designer.permissions import IsStaffOrReadOnly
```

Set the viewset permission (line ~73):

```python
    permission_classes = [IsStaffOrReadOnly]
```

Replace `get_permissions` so `apply` is also staff-gated:

```python
    def get_permissions(self):
        return [IsStaffOrReadOnly()]
```

(Remove the now-unused `IsAssociationMemberOrStaff` / `CanApplyTemplate` imports. Leave the classes defined in `permissions.py` only if referenced elsewhere — verify with `grep -rn "IsAssociationMemberOrStaff\|CanApplyTemplate" --include=*.py .`; if unused, delete both classes and their tests in a later cleanup within this task.)

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd leaguesphere && python -m pytest gameday_designer/tests/test_api.py -v`
Expected: PASS. Investigate and update any pre-existing test that asserted non-staff could create/apply — those assertions become 403 by design.

- [ ] **Step 5: Commit**

```bash
git add gameday_designer/views.py gameday_designer/permissions.py gameday_designer/tests/
git commit -m "feat(designer): restrict template writes and apply to staff"
```

---

### Task 3: Gate team-creation endpoints to staff

**Files:**
- Modify: `gameday_designer/views.py` — `TeamCreationView.permission_classes` (line ~472), `TeamBulkCreationView.permission_classes` (line ~509)
- Test: `gameday_designer/tests/test_team_creation_api.py`

**Interfaces:**
- Consumes: `IsStaffOrReadOnly` from Task 1.
- Produces: `POST /api/designer/teams/` and `/teams/bulk/` require staff.

- [ ] **Step 1: Write the failing test**

Append to `gameday_designer/tests/test_team_creation_api.py`:

```python
@pytest.mark.django_db
class TestTeamCreationGating:
    def test_non_staff_cannot_create_team(self, api_client, association_user):
        api_client.force_authenticate(user=association_user)
        r = api_client.post("/api/designer/teams/", {"name": "X"}, format="json")
        assert r.status_code == 403

    def test_non_staff_cannot_bulk_create(self, api_client, association_user):
        api_client.force_authenticate(user=association_user)
        r = api_client.post("/api/designer/teams/bulk/", {"count": 3}, format="json")
        assert r.status_code == 403
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd leaguesphere && python -m pytest gameday_designer/tests/test_team_creation_api.py::TestTeamCreationGating -v`
Expected: FAIL (returns 201, `IsAuthenticated` still allows non-staff).

- [ ] **Step 3: Write minimal implementation**

In `gameday_designer/views.py`, on both `TeamCreationView` and `TeamBulkCreationView`, replace:

```python
    permission_classes = [IsAuthenticated]
```

with:

```python
    permission_classes = [IsStaffOrReadOnly]
```

Leave `LeagueTeamsView` and `ConfigView` on `IsAuthenticated` (read-only GET).

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd leaguesphere && python -m pytest gameday_designer/tests/test_team_creation_api.py -v`
Expected: PASS. Update any existing team-creation test that authenticated a non-staff user — switch it to `staff_user`.

- [ ] **Step 5: Commit**

```bash
git add gameday_designer/views.py gameday_designer/tests/test_team_creation_api.py
git commit -m "feat(designer): restrict team creation endpoints to staff"
```

---

### Task 4: `ConfigView` exposes `is_staff`

**Files:**
- Modify: `gameday_designer/views.py` — `ConfigView.get` (line ~594)
- Test: `gameday_designer/tests/test_team_creation_api.py`

**Interfaces:**
- Produces: `GET /api/designer/config/` response includes `is_staff: bool` for the requesting user (consumed by Task 8).

- [ ] **Step 1: Write the failing test**

Append to `gameday_designer/tests/test_team_creation_api.py`:

```python
@pytest.mark.django_db
class TestConfigIsStaff:
    URL = "/api/designer/config/"

    def test_staff_sees_is_staff_true(self, api_client, staff_user):
        api_client.force_authenticate(user=staff_user)
        assert api_client.get(self.URL).data["is_staff"] is True

    def test_non_staff_sees_is_staff_false(self, api_client, association_user):
        api_client.force_authenticate(user=association_user)
        assert api_client.get(self.URL).data["is_staff"] is False
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd leaguesphere && python -m pytest gameday_designer/tests/test_team_creation_api.py::TestConfigIsStaff -v`
Expected: FAIL with `KeyError: 'is_staff'`.

- [ ] **Step 3: Write minimal implementation**

In `gameday_designer/views.py`, update `ConfigView.get`:

```python
    def get(self, request):
        from django.conf import settings
        return Response({
            "mock_teams": getattr(settings, "MOCK_TEAMS", False),
            "is_staff": bool(request.user and request.user.is_staff),
        })
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd leaguesphere && python -m pytest gameday_designer/tests/test_team_creation_api.py::TestConfigIsStaff -v`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add gameday_designer/views.py gameday_designer/tests/test_team_creation_api.py
git commit -m "feat(designer): expose is_staff in config endpoint"
```

---

### Task 5: Staff-only chooser page

**Files:**
- Modify: `gamedays/constants.py`, `gamedays/urls.py`, `gamedays/views.py`
- Create: `gamedays/templates/gamedays/gameday_create_chooser.html`
- Test: `gamedays/tests/test_views.py` (or the existing gameday view test module — confirm with `ls gamedays/tests/`)

**Interfaces:**
- Consumes: `gameday_designer_app:index` reverse (`/gamedays/gameday/design/`), `LEAGUE_GAMEDAY_CREATE` reverse (`/new/`).
- Produces: URL name `LEAGUE_GAMEDAY_CREATE_CHOOSER` → `/gamedays/gameday/create/`, staff-only view `GamedayCreateChooserView`.

- [ ] **Step 1: Write the failing test**

Add to the gameday view test module (match the existing style; example using Django test client):

```python
def test_chooser_forbidden_for_non_staff(client, django_user_model):
    user = django_user_model.objects.create_user("u", password="p", is_staff=False)
    client.force_login(user)
    resp = client.get("/gamedays/gameday/create/")
    assert resp.status_code == 403

def test_chooser_renders_for_staff_with_both_links(client, django_user_model):
    user = django_user_model.objects.create_user("s", password="p", is_staff=True)
    client.force_login(user)
    resp = client.get("/gamedays/gameday/create/")
    assert resp.status_code == 200
    assert b"/gamedays/gameday/design/" in resp.content
    assert b"/gamedays/gameday/new/" in resp.content
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd leaguesphere && python -m pytest gamedays/tests/test_views.py -k chooser -v`
Expected: FAIL (404 — URL not defined).

- [ ] **Step 3: Write minimal implementation**

Add to `gamedays/constants.py`:

```python
LEAGUE_GAMEDAY_CREATE_CHOOSER = "league-gameday-create-chooser"
```

Add `GamedayCreateChooserView` to `gamedays/views.py` (imports `LoginRequiredMixin`, `UserPassesTestMixin`, `TemplateView` already available via `django.views.generic`):

```python
class GamedayCreateChooserView(LoginRequiredMixin, UserPassesTestMixin, TemplateView):
    template_name = "gamedays/gameday_create_chooser.html"

    def test_func(self):
        return self.request.user.is_staff
```

Register the URL in `gamedays/urls.py` (add the constant to the `.constants` import and the view to the `.views` import):

```python
    path("gameday/create/", GamedayCreateChooserView.as_view(), name=LEAGUE_GAMEDAY_CREATE_CHOOSER),
```

Create `gamedays/templates/gamedays/gameday_create_chooser.html`:

```html
{% extends "base.html" %}
{% load static %}
{% block content %}
<div class="content-section">
  <h3 class="mb-1">Neuen Spieltag anlegen</h3>
  <p class="text-muted mb-4">Wähle, wie du deinen Spieltag erstellen möchtest.</p>

  <a href="{% url 'gameday_designer_app:index' %}"
     class="card border-success text-decoration-none text-reset d-block mb-3">
    <div class="card-body d-flex align-items-center">
      <span class="me-3" style="font-size:2rem">🎨</span>
      <span class="flex-grow-1">
        <span class="fw-semibold">Spieltag designen
          <span class="badge bg-success ms-1">Empfohlen</span>
        </span><br>
        <span class="text-muted">Visueller Designer mit Vorlagen, Teams &amp; Zeitplan.</span>
      </span>
      <span class="text-success fs-4">&rarr;</span>
    </div>
  </a>

  <div class="text-center">
    <a href="{% url 'league-gameday-create' %}" class="text-muted small">
      …oder das klassische Formular verwenden &rarr;
    </a>
  </div>
</div>
{% endblock %}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd leaguesphere && python -m pytest gamedays/tests/test_views.py -k chooser -v`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add gamedays/constants.py gamedays/urls.py gamedays/views.py gamedays/templates/gamedays/gameday_create_chooser.html gamedays/tests/
git commit -m "feat(gamedays): add staff-only create chooser page promoting the designer"
```

---

### Task 6: Menu restructure + non-staff view-only link

**Files:**
- Modify: `gamedays/menu.py`, `gameday_designer/menu.py`
- Test: create/extend a menu test (confirm existing pattern with `grep -rn "get_menu_items" --include=*.py .`; e.g. `gameday_designer/tests/test_menu.py`)

**Interfaces:**
- Consumes: `LEAGUE_GAMEDAY_CREATE_CHOOSER` from Task 5, `gameday_designer_app:index`.
- Produces: staff "Orga" menu shows a single `Spieltag erstellen` → chooser and no BETA `designen` entry; authenticated non-staff see `Spieltag ansehen` → `/design/`.

- [ ] **Step 1: Write the failing test**

Create `gameday_designer/tests/test_menu.py` (uses `RequestFactory`; adapt fixtures to conftest):

```python
import pytest
from django.contrib.auth.models import User, AnonymousUser
from django.test import RequestFactory

from gamedays.menu import GamedaysMenuAdmin
from gameday_designer.menu import Gameday_designerMenuOrgaEntry


@pytest.fixture
def rf():
    return RequestFactory()

@pytest.mark.django_db
def test_orga_erstellen_points_to_chooser(rf):
    req = rf.get("/")
    req.user = User.objects.create_user("s", is_staff=True)
    items = GamedaysMenuAdmin().get_menu_items(req)
    labels = [i["name"] for i in items]
    assert any("Spieltag erstellen" in n for n in labels)
    assert not any("designen" in n for n in labels)
    erstellen = next(i for i in items if "Spieltag erstellen" in i["name"])
    assert erstellen["url"] == "/gamedays/gameday/create/"

@pytest.mark.django_db
def test_designer_orga_entry_no_longer_lists_designen(rf):
    req = rf.get("/")
    req.user = User.objects.create_user("s2", is_staff=True)
    items = Gameday_designerMenuOrgaEntry().get_menu_items(req)
    assert not any("designen" in i["name"] for i in items)
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd leaguesphere && python -m pytest gameday_designer/tests/test_menu.py -v`
Expected: FAIL (`erstellen` still reverses `/new/`; `designen` entry still present).

- [ ] **Step 3: Write minimal implementation**

In `gamedays/menu.py`, change the create item to target the chooser:

```python
from gamedays.constants import LEAGUE_GAMEDAY_CREATE_CHOOSER
...
            MenuItem.create(
                name="Spieltag erstellen",
                url=LEAGUE_GAMEDAY_CREATE_CHOOSER,
            ),
```

In `gameday_designer/menu.py`, remove the `BETA Spieltag designen` `MenuItem` from `Gameday_designerMenuOrgaEntry.get_menu_items` (keep `📊 Live Status`).

Add a new menu class in `gameday_designer/menu.py` for the non-staff view-only link. Placement: confirm which user-facing menu group non-staff already see by inspecting `get_name()` across `*/menu.py` and how `base.html` renders empty groups; attach to an existing user-visible group so no empty dropdown appears. Example (adjust `get_name` to the chosen user-facing group):

```python
class Gameday_designerViewOnlyEntry(BaseMenu):
    def get_name(self):
        return "Spieltage"  # confirm: an existing user-facing group

    def get_menu_items(self, request):
        if not request.user.is_authenticated or request.user.is_staff:
            return []
        return [
            MenuItem.create(
                name="Spieltag ansehen",
                url="gameday_designer_app:index",
            ),
        ]
```

Add a test asserting the non-staff link appears and is absent for staff, mirroring Step 1.

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd leaguesphere && python -m pytest gameday_designer/tests/test_menu.py -v`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add gamedays/menu.py gameday_designer/menu.py gameday_designer/tests/test_menu.py
git commit -m "feat(menu): collapse create entry to chooser and add non-staff view-only designer link"
```

---

### Task 7: React read-only gating for non-staff

**Files:**
- Modify: `gameday_designer/src/api/designerApi.ts:273-275` (`getConfig` return type)
- Create: `gameday_designer/src/hooks/useIsStaff.ts`
- Modify: components hosting the write controls (find via `grep -rn "applyTemplate\|createTemplate\|updateTemplate\|deleteTemplate\|createTeam\|createTeamsBulk" gameday_designer/src --include=*.tsx`)
- Test: `gameday_designer/src/hooks/__tests__/useIsStaff.test.ts` and one component test per gated control

**Interfaces:**
- Consumes: `GET /config/` `is_staff` field from Task 4.
- Produces: `useIsStaff(): boolean` hook; write controls hidden/disabled when `false`.

- [ ] **Step 1: Write the failing test**

Create `gameday_designer/src/hooks/__tests__/useIsStaff.test.ts`:

```ts
import { renderHook, waitFor } from '@testing-library/react';
import { vi, describe, it, expect, beforeEach } from 'vitest';
import { designerApi } from '../../api/designerApi';
import { useIsStaff } from '../useIsStaff';

describe('useIsStaff', () => {
  beforeEach(() => vi.restoreAllMocks());

  it('returns true when config.is_staff is true', async () => {
    vi.spyOn(designerApi, 'getConfig').mockResolvedValue({ mock_teams: false, is_staff: true });
    const { result } = renderHook(() => useIsStaff());
    await waitFor(() => expect(result.current).toBe(true));
  });

  it('returns false when config.is_staff is false', async () => {
    vi.spyOn(designerApi, 'getConfig').mockResolvedValue({ mock_teams: false, is_staff: false });
    const { result } = renderHook(() => useIsStaff());
    await waitFor(() => expect(result.current).toBe(false));
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd gameday_designer && npx vitest run src/hooks/__tests__/useIsStaff.test.ts`
Expected: FAIL (module `../useIsStaff` not found; `getConfig` type lacks `is_staff`).

- [ ] **Step 3: Write minimal implementation**

Update `getConfig` return type in `gameday_designer/src/api/designerApi.ts`:

```ts
  async getConfig(): Promise<{ mock_teams: boolean; is_staff: boolean }> {
    const response = await this.client.get<{ mock_teams: boolean; is_staff: boolean }>('/config/');
    return response.data;
  }
```

Create `gameday_designer/src/hooks/useIsStaff.ts`:

```ts
import { useEffect, useState } from 'react';
import { designerApi } from '../api/designerApi';

export function useIsStaff(): boolean {
  const [isStaff, setIsStaff] = useState(false);
  useEffect(() => {
    designerApi.getConfig().then(c => setIsStaff(c.is_staff)).catch(() => setIsStaff(false));
  }, []);
  return isStaff;
}
```

Also update the existing `getConfig` consumer `src/components/modals/TemplateLibraryModal/TeamPickerStep.tsx:33` if TypeScript now flags the wider type (it should still compile — `mock_teams` unchanged).

- [ ] **Step 4: Run test to verify it passes**

Run: `cd gameday_designer && npx vitest run src/hooks/__tests__/useIsStaff.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add gameday_designer/src/api/designerApi.ts gameday_designer/src/hooks/useIsStaff.ts gameday_designer/src/hooks/__tests__/useIsStaff.test.ts
git commit -m "feat(designer): add useIsStaff hook backed by config endpoint"
```

- [ ] **Step 6: Gate the write controls**

For each component that renders a trigger for `createTemplate`/`updateTemplate`/`deleteTemplate`/`applyTemplate`/`createTeam`/`createTeamsBulk` (enumerated via the grep above), call `const isStaff = useIsStaff();` and conditionally render/`disabled={!isStaff}` the control. Write a component test per control asserting it is absent (or disabled) when `getConfig` resolves `is_staff: false`, mirroring the existing `TeamPickerStep.test.tsx` mock pattern (`vi.mocked(designerApi.getConfig).mockResolvedValue({ mock_teams: true, is_staff: false })`). Commit:

```bash
git commit -am "feat(designer): hide write controls for non-staff users"
```

---

### Task 8: Full-suite verification

**Files:** none (verification only)

- [ ] **Step 1: Run the designer + gamedays Python suites**

Run: `cd leaguesphere && python -m pytest gameday_designer gamedays -q`
Expected: all pass. Fix any pre-existing test whose assumption changed (non-staff writes now 403).

- [ ] **Step 2: Run the React suite**

Run: `cd gameday_designer && npx vitest run`
Expected: all pass.

- [ ] **Step 3: Commit any fixups**

```bash
git commit -am "test: align existing tests with staff-gated designer writes"
```

---

## Self-Review

**Spec coverage:**
- §1 Menu restructure → Task 6. ✔
- §2 Chooser page → Task 5. ✔
- §3 Backend write-gating (permission, viewset CRUD+apply, team endpoints, reads unchanged) → Tasks 1, 2, 3. ✔
- §4 Frontend read-only (`is_staff` in config, hide write controls) → Tasks 4, 7. ✔
- §5 Non-staff view-only link → Task 6. ✔
- Testing section → per-task tests + Task 8. ✔

**Placeholder scan:** Two spec-sanctioned verifications remain (unused-permission cleanup in Task 2; user-facing menu-group choice in Task 6) — both are explicit verification steps with a concrete command, not deferred work. React write-control gating (Task 7 Step 6) enumerates its targets by grep rather than guessing component names, with a concrete per-control test pattern.

**Type consistency:** `is_staff` (snake_case) is the JSON field from `ConfigView` (Task 4) consumed by `getConfig`/`useIsStaff` (Task 7). `IsStaffOrReadOnly` naming consistent across Tasks 1–3. `LEAGUE_GAMEDAY_CREATE_CHOOSER` consistent across Tasks 5–6.
