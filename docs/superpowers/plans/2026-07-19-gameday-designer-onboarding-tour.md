# Gameday Designer Onboarding Tours Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add two `react-joyride` onboarding tours to `gameday_designer` (manual schedule build; save-as-template nudge on publish), tracked via the app's existing `JourneyEvent` pipeline, and widen template ownership permissions so non-staff users can save/manage their own templates.

**Architecture:** A generic `<DesignerTour>` wrapper around `react-joyride` fires `trackEvent()` calls on lifecycle events; a `useTourSeen(tourId)` hook derives "already seen" from the existing `/api/journey/events/` endpoint (extended with an `event_name__in` filter) rather than a new table. Tour B's target action ("Save current as template") is currently staff-only both in the UI and via `IsStaffOrReadOnly` on `ScheduleTemplateViewSet`; this plan replaces that with per-action permissions so any authenticated user can create/update/delete/clone their **own** templates (PRIVATE sharing only — ASSOCIATION/GLOBAL stay staff-only), while list/retrieve/apply/validate/preview/usage keep today's behavior.

**Tech Stack:** React 19, TypeScript, react-bootstrap, react-router-dom, i18next, Vitest + Testing Library (frontend); Django REST Framework, pytest-django (backend).

## Global Constraints

- Library: `react-joyride` (MIT), not Shepherd.js (AGPL-3.0, requires a commercial license for revenue-generating use).
- No new backend tables/migrations for tour "seen" state — derive it from `JourneyEvent.event_name` via the existing endpoint.
- Event names follow this app's existing snake_case/past-tense convention (`gameday_published`, `template_saved`): `gd_tour_<tourId>_started`, `gd_tour_<tourId>_step_completed`, `gd_tour_<tourId>_completed`, `gd_tour_<tourId>_skipped`.
- Tour A (`manual_build`) teaches the manual build path only (field → stage → team → game) — not the Templates/generate shortcut.
- Tour B (`save_template`) is a single-step nudge, fired right after a successful publish.
- Copy goes through `useTypedTranslation`, both `de` and `en` locale files (`src/i18n/locales/{de,en}/ui.json`).
- **Out of scope, explicitly not touched:** the "Apply to Gameday" action (`TemplatePreview.tsx` — generate a schedule from a template) stays staff-only, both in the frontend `isStaff &&` gate and in the backend `apply` action's permission. Only the *save/update/delete/clone your own template* surface is widened. Do not remove the `isStaff &&` gate around the "Apply to Gameday" button.
- `created_by`/`updated_by` on `ScheduleTemplate` are already read-only, server-set fields (`gameday_designer/serializers.py:215`) — never make them client-writable.

---

### Task 1: Backend — filter `JourneyEvent`s by `event_name`

**Files:**
- Modify: `journey/views.py:61-71` (`JourneyEventViewSet.get_queryset`)
- Test: `journey/tests.py` (append to `JourneyAPITests`)

**Interfaces:**
- Produces: `GET /api/journey/events/?event_name=<name>` and `GET /api/journey/events/?event_name__in=<name1>,<name2>` — both scoped to the requesting user's own events (existing behavior, unchanged for non-staff/staff split).

- [ ] **Step 1: Write the failing tests**

Append to `journey/tests.py`, inside `class JourneyAPITests(APITestCase):`:

```python
    def test_filter_events_by_event_name(self):
        journey = Journey.objects.create(user=self.user)
        JourneyEvent.objects.create(journey=journey, event_name='gd_tour_manual_build_completed')
        JourneyEvent.objects.create(journey=journey, event_name='gameday_published')

        self.client.credentials(HTTP_AUTHORIZATION=f'Token {self.token}')
        response = self.client.get('/api/journey/events/?event_name=gd_tour_manual_build_completed')
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertEqual(len(data), 1)
        self.assertEqual(data[0]['event_name'], 'gd_tour_manual_build_completed')

    def test_filter_events_by_event_name_in(self):
        journey = Journey.objects.create(user=self.user)
        JourneyEvent.objects.create(journey=journey, event_name='gd_tour_manual_build_completed')
        JourneyEvent.objects.create(journey=journey, event_name='gd_tour_manual_build_skipped')
        JourneyEvent.objects.create(journey=journey, event_name='gameday_published')

        self.client.credentials(HTTP_AUTHORIZATION=f'Token {self.token}')
        response = self.client.get(
            '/api/journey/events/?event_name__in=gd_tour_manual_build_completed,gd_tour_manual_build_skipped'
        )
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertEqual(len(data), 2)
        names = {e['event_name'] for e in data}
        self.assertEqual(names, {'gd_tour_manual_build_completed', 'gd_tour_manual_build_skipped'})

    def test_filter_events_by_event_name_scoped_to_requesting_user(self):
        other_user = User.objects.create_user(username='otheruser', password='pass')
        other_journey = Journey.objects.create(user=other_user)
        JourneyEvent.objects.create(journey=other_journey, event_name='gd_tour_manual_build_completed')

        self.client.credentials(HTTP_AUTHORIZATION=f'Token {self.token}')
        response = self.client.get('/api/journey/events/?event_name=gd_tour_manual_build_completed')
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json(), [])
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd leaguesphere && python manage.py test journey.tests.JourneyAPITests.test_filter_events_by_event_name journey.tests.JourneyAPITests.test_filter_events_by_event_name_in journey.tests.JourneyAPITests.test_filter_events_by_event_name_scoped_to_requesting_user -v 2`
Expected: FAIL — all events returned, no `event_name` filtering applied yet.

- [ ] **Step 3: Implement the filter**

In `journey/views.py`, replace the `get_queryset` method of `JourneyEventViewSet` (currently lines 61-71):

```python
    def get_queryset(self):
        """Filter events by authenticated user and optionally by journey/event_name."""
        if self.request.user.is_staff:
            qs = JourneyEvent.objects.all()
        else:
            qs = JourneyEvent.objects.filter(journey__user=self.request.user)

        journey_id = self.request.query_params.get('journey')
        if journey_id:
            qs = qs.filter(journey_id=journey_id)

        event_name = self.request.query_params.get('event_name')
        if event_name:
            qs = qs.filter(event_name=event_name)

        event_name_in = self.request.query_params.get('event_name__in')
        if event_name_in:
            qs = qs.filter(event_name__in=event_name_in.split(','))

        return qs.order_by('created_at')
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd leaguesphere && python manage.py test journey.tests.JourneyAPITests -v 2`
Expected: PASS — all `JourneyAPITests` including the three new tests.

- [ ] **Step 5: Commit**

```bash
git add journey/views.py journey/tests.py
git commit -m "feat(journey): filter JourneyEvents by event_name/event_name__in"
```

---

### Task 2: Backend — widen `ScheduleTemplate` write permissions to owners

**Files:**
- Modify: `gameday_designer/permissions.py`
- Modify: `gameday_designer/views.py:55-78` (`ScheduleTemplateViewSet`), `gameday_designer/views.py:353-403` (`save_from_designer`)
- Modify: `gameday_designer/serializers.py:179-268` (`ScheduleTemplateDetailSerializer`)
- Test: `gameday_designer/tests/test_permissions.py`

**Interfaces:**
- Produces: `IsOwnerOrStaff` permission class (`gameday_designer/permissions.py`) — object-level: staff always allowed to write; non-staff allowed only when `obj.created_by_id == request.user.id`.
- Produces: `ScheduleTemplateViewSet.get_permissions()` — routes `create`/`save_from_designer`/`clone` to `IsAuthenticated`, `update`/`partial_update`/`destroy` to `IsOwnerOrStaff`, everything else (`list`/`retrieve`/`apply`/`validate`/`preview`/`usage`) unchanged via `IsStaffOrReadOnly`.
- Produces: non-staff `POST`/`PUT`/`PATCH` with `sharing` in `{ASSOCIATION, GLOBAL}` is rejected with `400`.

- [ ] **Step 1: Write the failing tests**

Add to `gameday_designer/tests/test_permissions.py` (new import + new test classes, appended after the existing `TestIsStaffOrReadOnly` class):

```python
@pytest.mark.django_db
class TestIsOwnerOrStaff:
    """Tests for the IsOwnerOrStaff permission (update/delete of ScheduleTemplate)."""

    def _perm(self):
        from gameday_designer.permissions import IsOwnerOrStaff
        return IsOwnerOrStaff()

    def test_has_permission_requires_authentication(self, api_factory):
        request = api_factory.patch("/")
        request.user = AnonymousUser()
        assert self._perm().has_permission(request, None) is False

    def test_has_permission_allows_any_authenticated_user(self, api_factory, association_user):
        request = api_factory.patch("/")
        request.user = association_user
        assert self._perm().has_permission(request, None) is True

    def test_object_permission_allows_owner(self, api_factory, association_user, association_template):
        request = api_factory.delete("/")
        request.user = association_user
        assert self._perm().has_object_permission(request, None, association_template) is True

    def test_object_permission_denies_non_owner_non_staff(self, api_factory, other_user, association_template):
        request = api_factory.delete("/")
        request.user = other_user
        assert self._perm().has_object_permission(request, None, association_template) is False

    def test_object_permission_allows_staff_regardless_of_ownership(self, api_factory, staff_user, association_template):
        request = api_factory.delete("/")
        request.user = staff_user
        assert self._perm().has_object_permission(request, None, association_template) is True


@pytest.mark.django_db
class TestScheduleTemplateViewSetOwnership:
    """API-level tests for non-staff template CRUD."""

    def _client_as(self, user):
        from rest_framework.test import APIClient
        client = APIClient()
        client.force_authenticate(user=user)
        return client

    def _payload(self, **overrides):
        payload = {
            "name": "My Template",
            "num_teams": 6,
            "num_fields": 2,
            "num_groups": 1,
            "game_duration": 60,
            "sharing": "PRIVATE",
            "slots": [],
        }
        payload.update(overrides)
        return payload

    def test_non_staff_can_create_private_template(self, association_user):
        client = self._client_as(association_user)
        response = client.post("/api/designer/templates/", self._payload(), format="json")
        assert response.status_code == 201
        assert response.data["sharing"] == "PRIVATE"
        assert response.data["created_by"] == association_user.id

    def test_non_staff_cannot_create_global_template(self, association_user):
        client = self._client_as(association_user)
        response = client.post(
            "/api/designer/templates/", self._payload(sharing="GLOBAL"), format="json"
        )
        assert response.status_code == 400

    def test_non_staff_can_update_own_template(self, association_user, association_template):
        client = self._client_as(association_user)
        response = client.patch(
            f"/api/designer/templates/{association_template.id}/",
            {"name": "Renamed"},
            format="json",
        )
        assert response.status_code == 200
        association_template.refresh_from_db()
        assert association_template.name == "Renamed"

    def test_non_staff_cannot_update_others_template(self, other_user, association_template):
        client = self._client_as(other_user)
        response = client.patch(
            f"/api/designer/templates/{association_template.id}/",
            {"name": "Hijacked"},
            format="json",
        )
        assert response.status_code == 403

    def test_non_staff_can_delete_own_template(self, association_user, association_template):
        client = self._client_as(association_user)
        response = client.delete(f"/api/designer/templates/{association_template.id}/")
        assert response.status_code == 204

    def test_non_staff_cannot_delete_others_template(self, other_user, global_template):
        client = self._client_as(other_user)
        response = client.delete(f"/api/designer/templates/{global_template.id}/")
        assert response.status_code == 403

    def test_non_staff_cannot_upgrade_own_template_to_association(self, association_user, association_template):
        client = self._client_as(association_user)
        response = client.patch(
            f"/api/designer/templates/{association_template.id}/",
            {"sharing": "ASSOCIATION"},
            format="json",
        )
        assert response.status_code == 400
```

Note: `association_template` (owned by `association_user`, sharing=`ASSOCIATION`) and `global_template` (owned by `staff_user`) already exist as fixtures in this file. Confirm the router prefix for these URLs by checking `gameday_designer/urls.py` before running — adjust the literal paths above (`/api/designer/templates/`) to match if the project mounts it elsewhere; the exact prefix isn't visible from `views.py` alone, so grep `gameday_designer/urls.py` and the project's root `urls.py` for how `ScheduleTemplateViewSet` is registered.

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd leaguesphere && python -m pytest gameday_designer/tests/test_permissions.py -v`
Expected: FAIL — `IsOwnerOrStaff` doesn't exist yet (`ImportError`); the API-level tests fail with `403`/`404` for non-staff writes.

- [ ] **Step 3: Add the `IsOwnerOrStaff` permission**

In `gameday_designer/permissions.py`, append after `IsStaffOrReadOnly`:

```python
class IsOwnerOrStaff(permissions.BasePermission):
    """Any authenticated user may attempt the request; write access to an
    existing object is restricted to its creator or staff."""

    def has_permission(self, request, view):
        return bool(request.user and request.user.is_authenticated)

    def has_object_permission(self, request, view, obj):
        if request.user.is_staff:
            return True
        return obj.created_by_id == request.user.id
```

- [ ] **Step 4: Route actions through `get_permissions()`**

In `gameday_designer/views.py`, replace the `get_permissions` method of `ScheduleTemplateViewSet` (currently lines 76-77: `def get_permissions(self): return [IsStaffOrReadOnly()]`):

```python
    def get_permissions(self):
        if self.action in ("create", "save_from_designer", "clone"):
            return [IsAuthenticated()]
        if self.action in ("update", "partial_update", "destroy"):
            return [IsOwnerOrStaff()]
        return [IsStaffOrReadOnly()]
```

`IsAuthenticated` is already imported at the top of this file (`from rest_framework.permissions import IsAuthenticated`, current line 11 — it's already used by `LeagueTeamsView`/`ConfigView`) — do not add a second `from rest_framework import permissions` import; use the existing direct import, matching this file's established style. Add `IsOwnerOrStaff` to the existing `gameday_designer.permissions` import (current line 39: `from gameday_designer.permissions import IsStaffOrReadOnly` → `from gameday_designer.permissions import IsStaffOrReadOnly, IsOwnerOrStaff`).

- [ ] **Step 5: Add sharing-tier validation in the serializer**

In `gameday_designer/serializers.py`, inside `ScheduleTemplateDetailSerializer` (after `get_updated_by_username`, before `create`, i.e. after line 233):

```python
    def validate_sharing(self, value):
        request = self.context.get("request")
        user = getattr(request, "user", None)
        if value != ScheduleTemplate.SHARING_PRIVATE and not (user and user.is_staff):
            raise serializers.ValidationError(
                "Only staff can set sharing to association or global."
            )
        return value
```

- [ ] **Step 6: Add the same check in `save_from_designer`** (it builds the object directly, bypassing the serializer)

In `gameday_designer/views.py`, in `save_from_designer` (currently lines 376-382), after the existing sharing-enum-normalization block:

```python
        sharing = data.get("sharing", ScheduleTemplate.SHARING_PRIVATE)
        if sharing not in (
            ScheduleTemplate.SHARING_PRIVATE,
            ScheduleTemplate.SHARING_ASSOCIATION,
            ScheduleTemplate.SHARING_GLOBAL,
        ):
            sharing = ScheduleTemplate.SHARING_PRIVATE

        if sharing != ScheduleTemplate.SHARING_PRIVATE and not request.user.is_staff:
            return Response(
                {"error": "Only staff can save templates as association or global."},
                status=status.HTTP_400_BAD_REQUEST,
            )
```

(This replaces the existing 6-line normalization block at 376-382 with the version above, which adds the new staff check at the end — keep everything else in `save_from_designer` unchanged.)

- [ ] **Step 7: Run tests to verify they pass**

Run: `cd leaguesphere && python -m pytest gameday_designer/tests/test_permissions.py -v`
Expected: PASS — all tests in the file, including the pre-existing `TestIsStaffOrReadOnly` class (unchanged behavior) and the two new classes.

Also run the full existing suite for this app to check nothing else regressed:
Run: `cd leaguesphere && python -m pytest gameday_designer/ -v`
Expected: PASS

- [ ] **Step 8: Commit**

```bash
git add gameday_designer/permissions.py gameday_designer/views.py gameday_designer/serializers.py gameday_designer/tests/test_permissions.py
git commit -m "feat(gameday_designer): let users save/update/delete their own templates"
```

---

### Task 3: Frontend — add `react-joyride` and the `useTourSeen` hook

**Files:**
- Modify: `gameday_designer/package.json` (add dependency)
- Create: `gameday_designer/src/onboarding/useTourSeen.ts`
- Test: `gameday_designer/src/onboarding/__tests__/useTourSeen.test.ts`

**Interfaces:**
- Produces: `useTourSeen(tourId: string): { seen: boolean; loading: boolean; markSeen: () => void }` — `seen` is `true` once a `gd_tour_<tourId>_completed` or `gd_tour_<tourId>_skipped` `JourneyEvent` exists for the current user; `markSeen()` flips local state immediately (used right after a tour finishes, so it doesn't need to wait for a refetch).

- [ ] **Step 1: Add the dependency**

```bash
cd leaguesphere/gameday_designer && npm install react-joyride@3.2.0
```

- [ ] **Step 2: Write the failing test**

Create `gameday_designer/src/onboarding/__tests__/useTourSeen.test.ts`:

```typescript
import { renderHook, waitFor, act } from '@testing-library/react';
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import { useTourSeen } from '../useTourSeen';

describe('useTourSeen', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('starts loading and requests the completed/skipped events for the tour', async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => [],
    });

    const { result } = renderHook(() => useTourSeen('manual_build'));
    expect(result.current.loading).toBe(true);

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.seen).toBe(false);
    expect(global.fetch).toHaveBeenCalledWith(
      '/api/journey/events/?event_name__in=gd_tour_manual_build_completed,gd_tour_manual_build_skipped',
      expect.objectContaining({ credentials: 'include' })
    );
  });

  it('returns seen=true when a matching event already exists', async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => [{ id: 1, event_name: 'gd_tour_manual_build_completed', metadata: {}, created_at: '2026-07-19T00:00:00Z' }],
    });

    const { result } = renderHook(() => useTourSeen('manual_build'));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.seen).toBe(true);
  });

  it('treats a failed request as not-seen', async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: false, json: async () => [] });

    const { result } = renderHook(() => useTourSeen('save_template'));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.seen).toBe(false);
  });

  it('markSeen flips seen to true immediately without a refetch', async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: true, json: async () => [] });

    const { result } = renderHook(() => useTourSeen('manual_build'));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.seen).toBe(false);

    act(() => result.current.markSeen());
    expect(result.current.seen).toBe(true);
  });
});
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `cd leaguesphere/gameday_designer && npx vitest run src/onboarding/__tests__/useTourSeen.test.ts`
Expected: FAIL — `Cannot find module '../useTourSeen'`

- [ ] **Step 4: Implement the hook**

Create `gameday_designer/src/onboarding/useTourSeen.ts`:

```typescript
import { useCallback, useEffect, useState } from 'react';

export interface TourSeenState {
  seen: boolean;
  loading: boolean;
  markSeen: () => void;
}

interface JourneyEventDto {
  id: number;
  event_name: string;
  metadata: Record<string, unknown>;
  created_at: string;
}

export function useTourSeen(tourId: string): TourSeenState {
  const [seen, setSeen] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);

    const eventNames = [`gd_tour_${tourId}_completed`, `gd_tour_${tourId}_skipped`].join(',');

    fetch(`/api/journey/events/?event_name__in=${eventNames}`, { credentials: 'include' })
      .then((res) => (res.ok ? (res.json() as Promise<JourneyEventDto[]>) : []))
      .then((events) => {
        if (!cancelled) setSeen(events.length > 0);
      })
      .catch(() => {
        if (!cancelled) setSeen(false);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [tourId]);

  const markSeen = useCallback(() => setSeen(true), []);

  return { seen, loading, markSeen };
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `cd leaguesphere/gameday_designer && npx vitest run src/onboarding/__tests__/useTourSeen.test.ts`
Expected: PASS — all 4 tests.

- [ ] **Step 6: Commit**

```bash
git add gameday_designer/package.json gameday_designer/package-lock.json gameday_designer/src/onboarding/useTourSeen.ts gameday_designer/src/onboarding/__tests__/useTourSeen.test.ts
git commit -m "feat(gameday_designer): add react-joyride and useTourSeen hook"
```

---

### Task 4: Frontend — generic `DesignerTour` wrapper

**Files:**
- Create: `gameday_designer/src/onboarding/DesignerTour.tsx`
- Test: `gameday_designer/src/onboarding/__tests__/DesignerTour.test.tsx`

**Interfaces:**
- Consumes: `trackEvent(eventName: string, metadata?: Record<string, unknown>): void` from `gameday_designer/src/trackEvent.ts` (existing).
- Produces: `<DesignerTour tourId={string} steps={Step[]} run={boolean} onFinish={() => void} />` — a thin wrapper over `react-joyride`'s `<Joyride>`. Fires `gd_tour_<tourId>_step_completed` after each step, and `gd_tour_<tourId>_completed` / `gd_tour_<tourId>_skipped` (calling `onFinish` in both cases) when the tour ends. Does **not** fire the `_started` event itself — the caller fires that when it flips `run` to `true` (so "started" always precedes any step/finish event even if `<Joyride>` mounts and fires asynchronously).

- [ ] **Step 1: Write the failing test**

Create `gameday_designer/src/onboarding/__tests__/DesignerTour.test.tsx`:

```tsx
import { render } from '@testing-library/react';
import { vi, describe, it, expect, beforeEach } from 'vitest';
import DesignerTour from '../DesignerTour';
import { trackEvent } from '../../trackEvent';

vi.mock('../../trackEvent', () => ({ trackEvent: vi.fn() }));

let capturedCallback: ((data: unknown) => void) | undefined;

vi.mock('react-joyride', () => ({
  __esModule: true,
  default: (props: { callback: (data: unknown) => void }) => {
    capturedCallback = props.callback;
    return null;
  },
  STATUS: { FINISHED: 'finished', SKIPPED: 'skipped', RUNNING: 'running' },
}));

describe('DesignerTour', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    capturedCallback = undefined;
  });

  it('tracks a step_completed event on step:after', () => {
    render(<DesignerTour tourId="manual_build" steps={[]} run onFinish={vi.fn()} />);
    capturedCallback?.({ type: 'step:after', status: 'running', index: 2 });

    expect(trackEvent).toHaveBeenCalledWith('gd_tour_manual_build_step_completed', { step_index: 2 });
  });

  it('tracks completed and calls onFinish when status is FINISHED', () => {
    const onFinish = vi.fn();
    render(<DesignerTour tourId="manual_build" steps={[]} run onFinish={onFinish} />);
    capturedCallback?.({ type: 'tour:end', status: 'finished', index: 4 });

    expect(trackEvent).toHaveBeenCalledWith('gd_tour_manual_build_completed', {});
    expect(onFinish).toHaveBeenCalled();
  });

  it('tracks skipped and calls onFinish when status is SKIPPED', () => {
    const onFinish = vi.fn();
    render(<DesignerTour tourId="save_template" steps={[]} run onFinish={onFinish} />);
    capturedCallback?.({ type: 'tour:end', status: 'skipped', index: 0 });

    expect(trackEvent).toHaveBeenCalledWith('gd_tour_save_template_skipped', { step_index: 0 });
    expect(onFinish).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd leaguesphere/gameday_designer && npx vitest run src/onboarding/__tests__/DesignerTour.test.tsx`
Expected: FAIL — `Cannot find module '../DesignerTour'`

- [ ] **Step 3: Implement the component**

Create `gameday_designer/src/onboarding/DesignerTour.tsx`:

```tsx
import React, { useCallback } from 'react';
import Joyride, { CallBackProps, STATUS, Step } from 'react-joyride';
import { trackEvent } from '../trackEvent';

export interface DesignerTourProps {
  tourId: string;
  steps: Step[];
  run: boolean;
  onFinish: () => void;
}

const DesignerTour: React.FC<DesignerTourProps> = ({ tourId, steps, run, onFinish }) => {
  const handleCallback = useCallback(
    (data: CallBackProps) => {
      const { status, type, index } = data;

      if (type === 'step:after') {
        trackEvent(`gd_tour_${tourId}_step_completed`, { step_index: index });
        return;
      }

      if (status === STATUS.FINISHED) {
        trackEvent(`gd_tour_${tourId}_completed`, {});
        onFinish();
      } else if (status === STATUS.SKIPPED) {
        trackEvent(`gd_tour_${tourId}_skipped`, { step_index: index });
        onFinish();
      }
    },
    [tourId, onFinish]
  );

  return (
    <Joyride
      steps={steps}
      run={run}
      continuous
      showSkipButton
      showProgress
      callback={handleCallback}
      styles={{ options: { zIndex: 10000 } }}
    />
  );
};

export default DesignerTour;
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd leaguesphere/gameday_designer && npx vitest run src/onboarding/__tests__/DesignerTour.test.tsx`
Expected: PASS — all 3 tests.

- [ ] **Step 5: Commit**

```bash
git add gameday_designer/src/onboarding/DesignerTour.tsx gameday_designer/src/onboarding/__tests__/DesignerTour.test.tsx
git commit -m "feat(gameday_designer): add DesignerTour joyride wrapper"
```

---

### Task 5: Frontend — anchor `data-testid`s for the manual-build steps

**Files:**
- Modify: `gameday_designer/src/components/list/FieldSection.tsx:202-212`
- Modify: `gameday_designer/src/components/list/StageSection.tsx:287-297`
- Modify: `gameday_designer/src/components/list/TeamGroupCard.tsx:225-235`
- Test: existing test files for these three components (extend, don't create new ones — check `src/components/list/__tests__/` or co-located `__tests__` folders referenced by each component's existing tests first)

**Interfaces:**
- Produces: `[data-testid="add-stage-button"]` (always-rendered header button in `FieldSection`, not the empty-state duplicate), `[data-testid="add-game-button"]` (always-rendered header button in `StageSection`), `[data-testid="add-team-button"]` (always-rendered header button in `TeamGroupCard`). Each of these components renders a *second*, empty-state-only button with the same label — do not tag that one, since two elements sharing a `data-testid` breaks a single-match `document.querySelector` (what `react-joyride` uses for `target`).

- [ ] **Step 1: Write the failing tests**

In `gameday_designer/src/components/list/__tests__/FieldSection.test.tsx`, add inside the top-level `describe('FieldSection', ...)` block, alongside the existing `'Add Stage button is in the header'` test (which already establishes this exact render shape and the `.field-section__header` container to scope the query):

```typescript
  it('exposes a stable data-testid on the header add-stage button for tour anchoring', () => {
    const { container } = render(
      <FieldSection
        field={sampleField}
        stages={[]}
        allNodes={[sampleField]}
        edges={[]}
        onUpdate={vi.fn()}
        onDelete={vi.fn()}
        onAddStage={vi.fn()}
        onSelectNode={vi.fn()}
        selectedNodeId={null}
        onAssignTeam={vi.fn()}
        onAddGame={vi.fn()}
        highlightedSourceGameId={null}
        onDynamicReferenceClick={vi.fn()}
        onAddGameToGameEdge={vi.fn()}
        onRemoveGameToGameEdge={vi.fn()}
        onNotify={vi.fn()}
        isExpanded={true}
        expandedStageIds={new Set()}
      />
    );

    const header = container.querySelector('.field-section__header');
    expect(header?.querySelector('[data-testid="add-stage-button"]')).toBeInTheDocument();
  });
```

In `gameday_designer/src/components/list/__tests__/StageSection.test.tsx`, add using the file's existing `createDefaultProps`/`renderStage` helpers and `sampleStage` fixture:

```typescript
  it('exposes a stable data-testid on the header add-game button for tour anchoring', () => {
    renderStage(createDefaultProps({ stage: sampleStage, allNodes: [sampleStage] }));
    expect(screen.getByTestId('add-game-button')).toBeInTheDocument();
  });
```

In `gameday_designer/src/components/list/__tests__/TeamGroupCard.test.tsx`, add using the file's existing `getDefaultProps()` helper:

```typescript
  it('exposes a stable data-testid on the header add-team button for tour anchoring', () => {
    render(<TeamGroupCard {...getDefaultProps()} />);
    expect(screen.getByTestId('add-team-button')).toBeInTheDocument();
  });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd leaguesphere/gameday_designer && npx vitest run -t "tour anchoring"`
Expected: FAIL — testid not found in any of the three.

- [ ] **Step 3: Add the testids**

In `FieldSection.tsx`, the header "Add Stage" button (lines 202-212) — add `data-testid="add-stage-button"`:

```tsx
        {!readOnly && (
          <button
            className="btn btn-sm btn-outline-primary btn-adaptive me-2"
            onClick={handleAddStage}
            aria-label={t('ui:button.addStage')}
            title={t('ui:tooltip.addStage')}
            data-testid="add-stage-button"
          >
            <i className={`bi ${ICONS.ADD} me-2`}></i>
            <span className="btn-label-adaptive">{t('ui:button.addStage')}</span>
          </button>
        )}
```

In `StageSection.tsx`, the header "Add Game" button (lines 287-297) — add `data-testid="add-game-button"`:

```tsx
        {!readOnly && (
          <button
            className="btn btn-sm btn-outline-primary btn-adaptive me-2"
            onClick={handleAddGame}
            aria-label={t('ui:button.addGame')}
            title={t('ui:tooltip.addGame')}
            data-testid="add-game-button"
          >
            <i className={`bi ${ICONS.ADD} me-2`}></i>
            <span className="btn-label-adaptive">{t('ui:button.addGame')}</span>
          </button>
        )}
```

In `TeamGroupCard.tsx`, the header "Add Team" button (lines 225-235) — add `data-testid="add-team-button"`:

```tsx
              <button
                className="btn btn-sm btn-outline-primary btn-adaptive"
                onClick={(e) => {
                  e.stopPropagation();
                  onShowTeamSelection(group.id, 'group');
                }}
                title={t('ui:tooltip.addTeamToGroup')}
                data-testid="add-team-button"
              >
                <i className={`bi ${ICONS.ADD} me-2`}></i>
                <span className="btn-label-adaptive">{t('ui:button.addTeam')}</span>
              </button>
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd leaguesphere/gameday_designer && npx vitest run -t "tour anchoring"`
Expected: PASS — all 3.

Also run each component's full existing test file to confirm no regression from the added attribute:
Run: `cd leaguesphere/gameday_designer && npx vitest run src/components/list`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add gameday_designer/src/components/list/FieldSection.tsx gameday_designer/src/components/list/StageSection.tsx gameday_designer/src/components/list/TeamGroupCard.tsx
git commit -m "test(gameday_designer): add stable data-testids for onboarding tour anchors"
```

---

### Task 6: Frontend — Tour A (manual build) wired into `ListDesignerApp`

**Files:**
- Create: `gameday_designer/src/onboarding/tours/manualBuildTour.ts`
- Modify: `gameday_designer/src/components/ListDesignerApp.tsx`
- Modify: `gameday_designer/src/i18n/locales/en/ui.json`, `gameday_designer/src/i18n/locales/de/ui.json`
- Test: `gameday_designer/src/components/__tests__/ListDesignerApp.test.tsx` (extend existing file — confirm exact path with `find gameday_designer/src -iname "ListDesignerApp.test*"`)

**Interfaces:**
- Consumes: `useTourSeen('manual_build')` (Task 3), `<DesignerTour tourId run steps onFinish>` (Task 4), `trackEvent` (existing), `data-testid`s from Task 5.
- Produces: `getManualBuildTourSteps(t: TFunction): Step[]` exported from `manualBuildTour.ts`.

- [ ] **Step 1: Add i18n copy**

In `gameday_designer/src/i18n/locales/en/ui.json`, inside the top-level object add a new `"tour"` key (sibling to `"button"`, `"hint"`, etc.):

```json
  "tour": {
    "manualBuild": {
      "welcomeTitle": "Welcome to the Gameday Designer",
      "welcomeBody": "Let's build your first schedule. This quick tour shows you the basics.",
      "addFieldBody": "Start here: add a field where games will be played.",
      "addStageBody": "Add a stage within the field — stages group games together, e.g. a round or a bracket.",
      "addTeamBody": "Build your team pool so you can assign teams to games.",
      "addGameBody": "Add a game to the stage. You can assign teams to it once it's created.",
      "toolbarBody": "Your changes autosave. Use undo/redo here if you make a mistake."
    },
    "saveTemplate": {
      "body": "Did you know you can save this schedule as a template, to reuse it for future gamedays?"
    }
  },
```

Add the equivalent `de` translations to `gameday_designer/src/i18n/locales/de/ui.json` in the same shape (translate the five `manualBuild` body strings and the one `saveTemplate.body` string to German; keep the same keys).

- [ ] **Step 2: Write the step-definitions module**

Create `gameday_designer/src/onboarding/tours/manualBuildTour.ts`:

```typescript
import type { Step } from 'react-joyride';
import type { TFunction } from 'i18next';

export function getManualBuildTourSteps(t: TFunction): Step[] {
  return [
    {
      target: 'body',
      placement: 'center',
      title: t('ui:tour.manualBuild.welcomeTitle'),
      content: t('ui:tour.manualBuild.welcomeBody'),
    },
    {
      target: '[data-testid="add-field-button"]',
      content: t('ui:tour.manualBuild.addFieldBody'),
    },
    {
      target: '[data-testid="add-stage-button"]',
      content: t('ui:tour.manualBuild.addStageBody'),
    },
    {
      target: '[data-testid="add-team-button"]',
      content: t('ui:tour.manualBuild.addTeamBody'),
    },
    {
      target: '[data-testid="add-game-button"]',
      content: t('ui:tour.manualBuild.addGameBody'),
    },
    {
      target: '[data-testid="flow-toolbar"]',
      content: t('ui:tour.manualBuild.toolbarBody'),
    },
  ];
}
```

- [ ] **Step 3: Write the failing test for the trigger effect**

In `gameday_designer/src/components/__tests__/ListDesignerApp.test.tsx`, add two new `vi.mock` calls alongside the existing ones near the top of the file (after the existing `vi.mock('../../trackEvent', ...)` block):

```typescript
vi.mock('../../onboarding/useTourSeen', () => ({
  useTourSeen: vi.fn(),
}));

vi.mock('../../onboarding/DesignerTour', () => ({
  __esModule: true,
  default: ({ run, tourId }: { run: boolean; tourId: string }) =>
    run ? <div data-testid={`tour-running-${tourId}`} /> : null,
}));
```

Add the import near the file's other imports:

```typescript
import { useTourSeen } from '../../onboarding/useTourSeen';
```

Add a new `describe` block, using the file's existing `renderApp()` helper and `Mock` type import (both already present in this file):

```typescript
describe('ListDesignerApp manual-build tour', () => {
  beforeEach(() => {
    (useTourSeen as Mock).mockReturnValue({ seen: true, loading: false, markSeen: vi.fn() });
  });

  it('runs the manual_build tour when unseen', async () => {
    (useTourSeen as Mock).mockImplementation((tourId: string) =>
      tourId === 'manual_build'
        ? { seen: false, loading: false, markSeen: vi.fn() }
        : { seen: true, loading: false, markSeen: vi.fn() }
    );

    renderApp();

    expect(await screen.findByTestId('tour-running-manual_build')).toBeInTheDocument();
  });

  it('does not run the manual_build tour when already seen', async () => {
    (useTourSeen as Mock).mockReturnValue({ seen: true, loading: false, markSeen: vi.fn() });

    renderApp();
    await new Promise(resolve => setTimeout(resolve, 0));

    expect(screen.queryByTestId('tour-running-manual_build')).not.toBeInTheDocument();
  });

  it('does not run the tour while the seen-check is still loading', async () => {
    (useTourSeen as Mock).mockReturnValue({ seen: false, loading: true, markSeen: vi.fn() });

    renderApp();
    await new Promise(resolve => setTimeout(resolve, 0));

    expect(screen.queryByTestId('tour-running-manual_build')).not.toBeInTheDocument();
  });
});
```

Note: `renderApp()` is declared inside the outer `describe('ListDesignerApp', ...)` block (current line 190) — either move the new `describe('ListDesignerApp manual-build tour', ...)` block to be nested inside the existing outer one, or hoist `renderApp` (and `defaultFlowState`/`defaultMockReturn`/mock setup) so it's reachable from a sibling top-level `describe`. Nesting inside the existing outer `describe` is the smaller change and matches how `describe('ListDesignerApp - Event Tracking', ...)` (line 377) already does it.

- [ ] **Step 4: Run the test to verify it fails**

Run: `cd leaguesphere/gameday_designer && npx vitest run src/components/__tests__/ListDesignerApp.test.tsx -t "manual-build tour"`
Expected: FAIL — `ListDesignerApp` doesn't render `DesignerTour` yet.

- [ ] **Step 5: Wire the tour into `ListDesignerApp.tsx`**

Add imports near the top of `ListDesignerApp.tsx` (alongside the existing imports):

```tsx
import DesignerTour from '../onboarding/DesignerTour';
import { useTourSeen } from '../onboarding/useTourSeen';
import { getManualBuildTourSteps } from '../onboarding/tours/manualBuildTour';
```

Inside the `ListDesignerApp` component, after the existing `const flowState = useFlowState();` line (line 68), add:

```tsx
  const manualBuildTour = useTourSeen('manual_build');
  const [runManualBuildTour, setRunManualBuildTour] = useState(false);

  useEffect(() => {
    if (!manualBuildTour.loading && !manualBuildTour.seen) {
      trackEvent('gd_tour_manual_build_started', { gameday_id: id });
      setRunManualBuildTour(true);
    }
  }, [manualBuildTour.loading, manualBuildTour.seen, id]);

  const handleManualBuildTourFinish = useCallback(() => {
    setRunManualBuildTour(false);
    manualBuildTour.markSeen();
  }, [manualBuildTour]);
```

Near the end of the JSX, alongside the other modals (e.g. right before the closing `</div>` that wraps `PublishConfirmationModal`, `DeleteGamedayConfirmModal`, etc. — around line 548), add:

```tsx
      <DesignerTour
        tourId="manual_build"
        steps={getManualBuildTourSteps(t)}
        run={runManualBuildTour}
        onFinish={handleManualBuildTourFinish}
      />
```

- [ ] **Step 6: Run the test to verify it passes**

Run: `cd leaguesphere/gameday_designer && npx vitest run src/components/__tests__/ListDesignerApp.test.tsx -t "manual-build tour"`
Expected: PASS — all 3 new tests.

Run the full file to confirm no regressions:
Run: `cd leaguesphere/gameday_designer && npx vitest run src/components/__tests__/ListDesignerApp.test.tsx`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add gameday_designer/src/onboarding/tours/manualBuildTour.ts gameday_designer/src/components/ListDesignerApp.tsx gameday_designer/src/i18n/locales/en/ui.json gameday_designer/src/i18n/locales/de/ui.json gameday_designer/src/components/__tests__/ListDesignerApp.test.tsx
git commit -m "feat(gameday_designer): auto-start manual-build onboarding tour for first-time users"
```

---

### Task 7: Frontend — "?" replay button for Tour A

**Files:**
- Modify: `gameday_designer/src/context/GamedayContext.tsx`
- Modify: `gameday_designer/src/components/layout/AppHeader.tsx`
- Modify: `gameday_designer/src/components/ListDesignerApp.tsx`
- Modify: `gameday_designer/src/i18n/locales/en/ui.json`, `gameday_designer/src/i18n/locales/de/ui.json`
- Test: `gameday_designer/src/components/__tests__/ListDesignerApp.test.tsx`, `AppHeader`'s existing test file (find with `find gameday_designer/src -iname "AppHeader.test*"`)

**Interfaces:**
- Produces: `GamedayContextType.onReplayTour: (() => void) | null` and `setOnReplayTour`, mirroring the existing `onOpenTemplates`/`setOnOpenTemplates` pair exactly (`GamedayContext.tsx:8-9`).
- Produces: `[data-testid="replay-tour-button"]` in `AppHeader`, visible whenever `isEditor` and `onReplayTour` is set (same condition shape as the existing Templates button).

- [ ] **Step 1: Add i18n copy**

Add to `gameday_designer/src/i18n/locales/en/ui.json`, inside `"button"`:

```json
    "replayTour": "Replay Tour",
```

Add German equivalent to `de/ui.json`'s `"button"` block (e.g. `"replayTour": "Tour wiederholen"`).

- [ ] **Step 2: Write the failing test for `AppHeader`**

`AppHeader.test.tsx` renders through the real `GamedayProvider` (not a mocked context), so setting `onReplayTour` requires a small harness component that calls the real setter on mount. Add this harness and two new tests to `gameday_designer/src/components/layout/__tests__/AppHeader.test.tsx`, plus a `userEvent` import:

```typescript
import userEvent from '@testing-library/user-event';
import { useEffect } from 'react';
import { useGamedayContext } from '../../../context/GamedayContext';
```

```typescript
const SetOnReplayTour: React.FC<{ handler: (() => void) | null }> = ({ handler }) => {
  const { setOnReplayTour } = useGamedayContext();
  useEffect(() => {
    setOnReplayTour(handler ? () => handler : null);
    return () => setOnReplayTour(null);
  }, [handler, setOnReplayTour]);
  return null;
};
```

```typescript
it('renders the replay-tour button when onReplayTour is set and calls it on click', async () => {
  const onReplayTour = vi.fn();
  render(
    <MemoryRouter initialEntries={['/designer/1']}>
      <GamedayProvider>
        <SetOnReplayTour handler={onReplayTour} />
        <Routes>
          <Route path="*" element={<AppHeader />} />
        </Routes>
      </GamedayProvider>
    </MemoryRouter>
  );

  const button = await screen.findByTestId('replay-tour-button');
  await userEvent.click(button);
  expect(onReplayTour).toHaveBeenCalled();
});

it('does not render the replay-tour button when onReplayTour is null', () => {
  render(
    <MemoryRouter initialEntries={['/designer/1']}>
      <GamedayProvider>
        <SetOnReplayTour handler={null} />
        <Routes>
          <Route path="*" element={<AppHeader />} />
        </Routes>
      </GamedayProvider>
    </MemoryRouter>
  );
  expect(screen.queryByTestId('replay-tour-button')).not.toBeInTheDocument();
});
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `cd leaguesphere/gameday_designer && npx vitest run -t "replay-tour"`
Expected: FAIL — no such testid rendered yet.

- [ ] **Step 4: Add `onReplayTour` to `GamedayContext`**

In `GamedayContext.tsx`, mirror the existing `onOpenTemplates` plumbing exactly. Add to the `GamedayContextType` interface (after `setOnOpenTemplates: (handler: (() => void) | null) => void;` at line 9):

```typescript
  onReplayTour: (() => void) | null;
  setOnReplayTour: (handler: (() => void) | null) => void;
```

Add state + setter inside `GamedayProvider` (after the `onOpenTemplates` state at line 44):

```typescript
  const [onReplayTour, setOnReplayTourInternal] = useState<(() => void) | null>(null);
```

Add the callback wrapper (after `setOnOpenTemplates` at line 51):

```typescript
  const setOnReplayTour = useCallback((handler: (() => void) | null) => setOnReplayTourInternal(handler), []);
```

Add both to the `value` object and its dependency array (extend the existing `useMemo` at lines 59-73):

```typescript
  const value = useMemo(() => ({
    gamedayName,
    setGamedayName: setGamedayNameCb,
    currentUserId,
    onOpenTemplates,
    setOnOpenTemplates,
    onReplayTour,
    setOnReplayTour,
    toolbarProps,
    setToolbarProps,
    isLocked,
    setIsLocked: setIsLockedCb,
    resultsMode,
    setResultsMode,
    gameResults,
    setGameResults
  }), [gamedayName, setGamedayNameCb, currentUserId, onOpenTemplates, setOnOpenTemplates, onReplayTour, setOnReplayTour, toolbarProps, setToolbarProps, isLocked, setIsLockedCb, resultsMode, gameResults, setGameResults]);
```

- [ ] **Step 5: Render the button in `AppHeader.tsx`**

In `AppHeader.tsx`, destructure `onReplayTour` from context (extend the existing line `const { gamedayName, onOpenTemplates, toolbarProps, isLocked } = useGamedayContext();` at line 17):

```tsx
  const { gamedayName, onOpenTemplates, onReplayTour, toolbarProps, isLocked } = useGamedayContext();
```

Add the button in the `Nav` block, right after the existing Templates button block (after the `)}` closing the `{isEditor && onOpenTemplates && (...)}` block, currently ending at line 74):

```tsx
            {isEditor && onReplayTour && (
              <Button
                variant="outline-light"
                onClick={onReplayTour}
                size="sm"
                data-testid="replay-tour-button"
                title={t('ui:button.replayTour')}
              >
                <i className="bi bi-question-circle"></i>
              </Button>
            )}
```

- [ ] **Step 6: Wire it up from `ListDesignerApp.tsx`**

In `ListDesignerApp.tsx`, destructure `setOnReplayTour` from `useGamedayContext()` (extend the existing destructure at lines 43-53) and register/unregister it the same way `setOnOpenTemplates` is already registered (mirror the existing effect at lines 136-139):

```tsx
  useEffect(() => {
    setOnReplayTour(() => () => {
      trackEvent('gd_tour_manual_build_started', { gameday_id: id });
      setRunManualBuildTour(true);
    });
    return () => setOnReplayTour(null);
  }, [setOnReplayTour, id]);
```

(Place this effect after the `handleManualBuildTourFinish` definition from Task 6, so `setRunManualBuildTour` is already in scope.)

- [ ] **Step 7: Run tests to verify they pass**

Run: `cd leaguesphere/gameday_designer && npx vitest run -t "replay-tour"`
Expected: PASS — both `AppHeader` tests.

Run the full affected files:
Run: `cd leaguesphere/gameday_designer && npx vitest run src/components/layout src/context src/components/__tests__/ListDesignerApp.test.tsx`
Expected: PASS

- [ ] **Step 8: Commit**

```bash
git add gameday_designer/src/context/GamedayContext.tsx gameday_designer/src/components/layout/AppHeader.tsx gameday_designer/src/components/ListDesignerApp.tsx gameday_designer/src/i18n/locales/en/ui.json gameday_designer/src/i18n/locales/de/ui.json
git commit -m "feat(gameday_designer): add replay-tour button to header"
```

---

### Task 8: Frontend — unlock Templates when published; widen save-template UI

**Files:**
- Modify: `gameday_designer/src/components/layout/AppHeader.tsx`
- Modify: `gameday_designer/src/components/modals/TemplateLibraryModal.tsx`
- Modify: `gameday_designer/src/components/modals/TemplateLibraryModal/SaveTemplateSheet.tsx`
- Modify: `gameday_designer/src/components/ListDesignerApp.tsx` (prop threading)
- Test: existing test files for `AppHeader`, `TemplateLibraryModal`, `SaveTemplateSheet` (find with `find gameday_designer/src -iname "TemplateLibraryModal.test*" -o -iname "SaveTemplateSheet.test*"`)

**Interfaces:**
- Produces: `TemplateLibraryModalProps.isLocked?: boolean` — when `true`, the "Apply to Gameday" flow (`handleApply`/team-picker step) stays reachable only for staff (unchanged — see Global Constraints), and `onGenerateFromBuiltin`/`onGenerateFromSavedTemplate` are not invoked; "Save current as template" stays enabled.
- Produces: `[data-testid="save-current-as-template-button"]` on the existing "Save current as template" button, now rendered for **any** authenticated user (the `isStaff &&` gate is removed — Task 2 made the backend action available to any user for `PRIVATE` sharing).
- Produces: `SaveTemplateSheetProps.isStaff?: boolean` (default `false`) — when falsy, only the `PRIVATE` visibility option is shown (matches the backend's `validate_sharing`).

- [ ] **Step 1: Write the failing tests**

**`AppHeader.test.tsx`** — add, reusing the `SetOnReplayTour`-style harness pattern from Task 7 (a small mount-effect component), since `isLocked` also comes from the real `GamedayProvider`:

```typescript
const SetIsLocked: React.FC<{ locked: boolean; onOpenTemplates: () => void }> = ({ locked, onOpenTemplates }) => {
  const { setIsLocked, setOnOpenTemplates } = useGamedayContext();
  useEffect(() => {
    setIsLocked(locked);
    setOnOpenTemplates(() => onOpenTemplates);
    return () => setOnOpenTemplates(null);
  }, [locked, onOpenTemplates, setIsLocked, setOnOpenTemplates]);
  return null;
};

it('keeps the Templates button enabled when the gameday is locked', async () => {
  render(
    <MemoryRouter initialEntries={['/designer/1']}>
      <GamedayProvider>
        <SetIsLocked locked onOpenTemplates={vi.fn()} />
        <Routes>
          <Route path="*" element={<AppHeader />} />
        </Routes>
      </GamedayProvider>
    </MemoryRouter>
  );

  const button = await screen.findByTestId('open-template-library-button');
  expect(button).not.toBeDisabled();
});
```

(`useGamedayContext` and `useEffect` are already imported per Task 7, Step 2 — reuse those imports rather than duplicating them.)

**`TemplateLibraryModal.test.tsx`** — this file already has a test asserting today's (soon to be wrong) behavior:

```typescript
  it('hides "Save current as template" button for non-staff', async () => {
    vi.mocked(designerApi.getConfig).mockResolvedValue({ mock_teams: false, is_staff: false });
    render(<TemplateLibraryModal show onHide={vi.fn()} gamedayId={1} currentUserId={1} />);
    await waitFor(() => {
      expect(designerApi.getConfig).toHaveBeenCalled();
    });
    expect(screen.queryByRole('button', { name: /save current/i })).not.toBeInTheDocument();
  });
```

Replace it (same file, same location) with the new expected behavior:

```typescript
  it('shows "Save current as template" button for non-staff too', async () => {
    vi.mocked(designerApi.getConfig).mockResolvedValue({ mock_teams: false, is_staff: false });
    render(<TemplateLibraryModal show onHide={vi.fn()} gamedayId={1} currentUserId={1} />);
    await waitFor(() => {
      expect(designerApi.getConfig).toHaveBeenCalled();
    });
    expect(screen.getByTestId('save-current-as-template-button')).toBeInTheDocument();
  });
```

The adjacent `'shows "Save current as template" button in titlebar for staff'` test (same file) stays as-is — still true under the new code — but strengthen its assertion to use the new testid instead of role/name matching, for consistency:

```typescript
  it('shows "Save current as template" button in titlebar for staff', async () => {
    render(<TemplateLibraryModal show onHide={vi.fn()} gamedayId={1} currentUserId={1} />);
    await waitFor(() => {
      expect(screen.getByTestId('save-current-as-template-button')).toBeInTheDocument();
    });
  });
```

Add two more tests to `TemplateLibraryModal.test.tsx` that drive the full generate flow (select a builtin template → team-picker → confirm) to prove the `isLocked` guard in `handleTeamConfirm` (Step 4 above) actually blocks generation, with a positive control so the test would fail if the wiring were ever removed rather than passing vacuously. Uses the smallest builtin template (`F6-2-2`, `teamCount.min: 6`) and mocks `designerApi.getLeagueTeams` to return exactly 6 teams:

```typescript
  it('calls onGenerateFromBuiltin when a template is applied and isLocked is false', async () => {
    vi.mocked(designerApi.getConfig).mockResolvedValue({ mock_teams: false, is_staff: true });
    vi.mocked(designerApi.getLeagueTeams).mockResolvedValue(
      Array.from({ length: 6 }, (_, i) => ({ id: i + 1, name: `Team ${i + 1}` }))
    );
    const onGenerateFromBuiltin = vi.fn();

    render(
      <TemplateLibraryModal
        show
        onHide={vi.fn()}
        gamedayId={1}
        currentUserId={1}
        isLocked={false}
        onGenerateFromBuiltin={onGenerateFromBuiltin}
      />
    );

    (await screen.findByTestId('builtin-template-F6-2-2')).click();
    (await screen.findByTestId('apply-template-button')).click();

    for (let i = 1; i <= 6; i++) {
      (await screen.findByText(`Team ${i}`)).click();
    }
    (await screen.findByRole('button', { name: /apply to gameday/i })).click();

    await waitFor(() => {
      expect(onGenerateFromBuiltin).toHaveBeenCalled();
    });
  });

  it('does not call onGenerateFromBuiltin when isLocked is true', async () => {
    vi.mocked(designerApi.getConfig).mockResolvedValue({ mock_teams: false, is_staff: true });
    vi.mocked(designerApi.getLeagueTeams).mockResolvedValue(
      Array.from({ length: 6 }, (_, i) => ({ id: i + 1, name: `Team ${i + 1}` }))
    );
    const onGenerateFromBuiltin = vi.fn();

    render(
      <TemplateLibraryModal
        show
        onHide={vi.fn()}
        gamedayId={1}
        currentUserId={1}
        isLocked={true}
        onGenerateFromBuiltin={onGenerateFromBuiltin}
      />
    );

    (await screen.findByTestId('builtin-template-F6-2-2')).click();
    (await screen.findByTestId('apply-template-button')).click();

    for (let i = 1; i <= 6; i++) {
      (await screen.findByText(`Team ${i}`)).click();
    }
    (await screen.findByRole('button', { name: /apply to gameday/i })).click();

    // Give any (incorrect) async call a chance to fire before asserting its absence.
    await new Promise(resolve => setTimeout(resolve, 50));
    expect(onGenerateFromBuiltin).not.toHaveBeenCalled();
  });
```

**`SaveTemplateSheet.test.tsx`** — this file's existing tests don't pass an `isStaff` prop at all. Making `isStaff` optional (default `false` — see Step 7 below) keeps tests 1 and 3 compiling and passing unchanged. Test 2 (`'calls onSave with name, description and sharing on submit'`) clicks `sharing-option-association`, which will stop rendering for non-staff under the new filtering — update that one existing test to pass `isStaff`:

```typescript
  it('calls onSave with name, description and sharing on submit', () => {
    const onSave = vi.fn();
    render(<SaveTemplateSheet show onHide={vi.fn()} onSave={onSave} isStaff />);
    fireEvent.change(screen.getByPlaceholderText(/template name/i), { target: { value: 'My Format' } });
    fireEvent.click(screen.getByTestId('sharing-option-association'));
    fireEvent.click(screen.getByRole('button', { name: /save template/i }));
    expect(onSave).toHaveBeenCalledWith({ name: 'My Format', description: '', sharing: 'ASSOCIATION' });
  });
```

Add two new tests to the same file:

```typescript
  it('only shows the Personal sharing option for non-staff users', () => {
    render(<SaveTemplateSheet show onHide={vi.fn()} onSave={vi.fn()} isStaff={false} />);
    expect(screen.getByTestId('sharing-option-private')).toBeInTheDocument();
    expect(screen.queryByTestId('sharing-option-association')).not.toBeInTheDocument();
    expect(screen.queryByTestId('sharing-option-global')).not.toBeInTheDocument();
  });

  it('shows all three sharing options for staff users', () => {
    render(<SaveTemplateSheet show onHide={vi.fn()} onSave={vi.fn()} isStaff />);
    expect(screen.getByTestId('sharing-option-private')).toBeInTheDocument();
    expect(screen.getByTestId('sharing-option-association')).toBeInTheDocument();
    expect(screen.getByTestId('sharing-option-global')).toBeInTheDocument();
  });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd leaguesphere/gameday_designer && npx vitest run -t "Templates button" -t "Save current as template" -t "sharing option" -t "onGenerateFromBuiltin"`
Expected: FAIL — button still disabled when locked; still `isStaff`-gated; `SaveTemplateSheet` always renders all three options.

- [ ] **Step 3: `AppHeader.tsx` — stop disabling Templates when locked**

Remove `disabled={isLocked}` from the Templates `Button` (currently line 69 in the block at lines 63-74):

```tsx
            {isEditor && onOpenTemplates && (
              <Button
                variant="primary"
                onClick={onOpenTemplates}
                size="sm"
                className="btn-adaptive fw-bold shadow-sm"
                data-testid="open-template-library-button"
              >
                📚 Templates
              </Button>
            )}
```

- [ ] **Step 4: Thread `isLocked` into `TemplateLibraryModal`**

In `ListDesignerApp.tsx`, add `isLocked={isLocked}` to the existing `<TemplateLibraryModal ... />` usage (the `isLocked` variable already exists in this component at line 119).

In `TemplateLibraryModal.tsx`, add `isLocked` to the props interface (after `onNotify` in `TemplateLibraryModalProps`, line 43):

```typescript
  isLocked?: boolean;
```

Destructure it in the component signature (line 46-48):

```tsx
const TemplateLibraryModal: React.FC<TemplateLibraryModalProps> = ({
  show, onHide, gamedayId, currentUserId, isLocked,
  onGenerateFromBuiltin, onGenerateFromSavedTemplate, onSaveTemplate, onNotify,
}) => {
```

Guard the generate call in `handleTeamConfirm` (currently lines 109-144) — wrap the body in an early return so a locked gameday can't be mutated even if this modal is somehow reached while locked:

```tsx
  const handleTeamConfirm = useCallback(async (selectedTeams: GlobalTeam[]) => {
    if (!selected || isLocked) return;
    // ...rest of the existing function body is unchanged
```

This guard is exercised by the two new `TemplateLibraryModal.test.tsx` tests added in Step 1 above (positive control with `isLocked={false}`, and the actual guard check with `isLocked={true}`). It's also defense-in-depth: even without it, `ListDesignerApp.tsx`'s existing autosave effect (`if (isLocked) return;`, current line ~208) already refuses to persist any local state change while locked, so a locked gameday can't actually be mutated server-side either way.

- [ ] **Step 5: Remove the `isStaff` gate on "Save current as template"**

In `TemplateLibraryModal.tsx`, the button at lines 240-244:

```tsx
                <Button size="sm" variant="success" onClick={() => setShowSave(true)} data-testid="save-current-as-template-button">
                  <i className="bi bi-download me-2"></i>Save current as template
                </Button>
```

(Drop the `{isStaff && (...)}` wrapper — keep `isStaff` in the component; it's still used to gate the "Apply to Gameday" button in `TemplatePreview`, which stays untouched.)

- [ ] **Step 6: Pass `isStaff` into `SaveTemplateSheet`**

In `TemplateLibraryModal.tsx`, the `<SaveTemplateSheet ... />` usage (lines 307-311) — add `isStaff={isStaff}`:

```tsx
      <SaveTemplateSheet
        show={showSave}
        onHide={() => setShowSave(false)}
        onSave={handleSave}
        isStaff={isStaff}
      />
```

- [ ] **Step 7: Filter sharing options in `SaveTemplateSheet.tsx`**

Add `isStaff?: boolean` to `SaveTemplateSheetProps` (line 4-8) — optional, defaulting to `false` (fail-closed: an omitted `isStaff` shows only the safe PRIVATE option), so the existing tests that don't pass it (tests 1 and 3, per Step 1 above) keep compiling and passing unchanged:

```typescript
interface SaveTemplateSheetProps {
  show: boolean;
  onHide: () => void;
  onSave: (data: { name: string; description: string; sharing: 'PRIVATE' | 'ASSOCIATION' | 'GLOBAL' }) => void;
  isStaff?: boolean;
}
```

Destructure it with a default and filter the rendered options (component signature at line 16, and the render at lines 66-80):

```tsx
const SaveTemplateSheet: React.FC<SaveTemplateSheetProps> = ({ show, onHide, onSave, isStaff = false }) => {
  // ...unchanged state...

  const visibleScopeOptions = isStaff ? SCOPE_OPTIONS : SCOPE_OPTIONS.filter(opt => opt.value === 'PRIVATE');

  // ...in the JSX, replace `SCOPE_OPTIONS.map(...)` with `visibleScopeOptions.map(...)`
```

- [ ] **Step 8: Run tests to verify they pass**

Run: `cd leaguesphere/gameday_designer && npx vitest run -t "Templates button" -t "Save current as template" -t "sharing option" -t "onGenerateFromBuiltin"`
Expected: PASS — all 5 new tests.

Run the full affected files:
Run: `cd leaguesphere/gameday_designer && npx vitest run src/components/layout src/components/modals`
Expected: PASS

- [ ] **Step 9: Commit**

```bash
git add gameday_designer/src/components/layout/AppHeader.tsx gameday_designer/src/components/modals/TemplateLibraryModal.tsx gameday_designer/src/components/modals/TemplateLibraryModal/SaveTemplateSheet.tsx gameday_designer/src/components/ListDesignerApp.tsx
git commit -m "feat(gameday_designer): keep Templates reachable when locked; open save-as-template to all users"
```

---

### Task 9: Frontend — Tour B (save-as-template nudge) on publish

**Files:**
- Create: `gameday_designer/src/onboarding/tours/saveTemplateTour.ts`
- Modify: `gameday_designer/src/components/ListDesignerApp.tsx`
- Test: `gameday_designer/src/components/__tests__/ListDesignerApp.test.tsx`

**Interfaces:**
- Consumes: `useTourSeen('save_template')` (Task 3), `<DesignerTour>` (Task 4), `[data-testid="open-template-library-button"]` (existing, now always enabled per Task 8).
- Produces: `getSaveTemplateTourSteps(t: TFunction): Step[]` — single-step tour.

- [ ] **Step 1: Write the step-definitions module**

Create `gameday_designer/src/onboarding/tours/saveTemplateTour.ts`:

```typescript
import type { Step } from 'react-joyride';
import type { TFunction } from 'i18next';

export function getSaveTemplateTourSteps(t: TFunction): Step[] {
  return [
    {
      target: '[data-testid="open-template-library-button"]',
      content: t('ui:tour.saveTemplate.body'),
    },
  ];
}
```

(The `ui:tour.saveTemplate.body` key was already added to both locale files in Task 6, Step 1.)

- [ ] **Step 2: Write the failing test**

Unlike the existing `'tracks gameday_published with correct game and stage counts'` test (current lines 447-514, which simulates the call rather than driving the UI), drive this one through the real `PublishConfirmationModal`. `ListCanvas` is not mocked in this file, and `GamedayMetadataAccordion.tsx` already renders an always-visible (not gated behind the collapsed accordion) `data-testid="publish-schedule-button"` when `metadata.status === 'DRAFT' && !readOnly` — both true under `defaultMockReturn` (`status: 'DRAFT'`) and `isLocked` being false by default. The default `defaultMockReturn.validation` is `{ isValid: true, errors: [], warnings: [], issueCount: 0 }` (current lines 157-162), so `PublishConfirmationModal`'s confirm button (text `t('modal:publishConfirmation.confirm')` = "Publish Now" in `en/modal.json`) is enabled without any extra setup. Reuse the `useTourSeen`/`DesignerTour` mocks from Task 6. Add this as a new test in the same `describe('ListDesignerApp - Event Tracking', ...)` block, immediately after the existing publish test:

```typescript
    it('starts the save_template tour after a successful publish, when unseen', async () => {
      const { trackEvent } = await import('../../trackEvent');
      (useTourSeen as Mock).mockImplementation((tourId: string) =>
        tourId === 'save_template'
          ? { seen: false, loading: false, markSeen: vi.fn() }
          : { seen: true, loading: false, markSeen: vi.fn() }
      );

      renderApp();
      await new Promise(resolve => setTimeout(resolve, 50));
      vi.clearAllMocks();
      (useTourSeen as Mock).mockImplementation((tourId: string) =>
        tourId === 'save_template'
          ? { seen: false, loading: false, markSeen: vi.fn() }
          : { seen: true, loading: false, markSeen: vi.fn() }
      );

      const publishButton = await screen.findByTestId('publish-schedule-button');
      await act(async () => {
        publishButton.click();
      });

      const confirmButton = await screen.findByRole('button', { name: /publish now/i });
      await act(async () => {
        confirmButton.click();
      });

      await waitFor(() => {
        expect(trackEvent).toHaveBeenCalledWith(
          'gd_tour_save_template_started',
          expect.objectContaining({ gameday_id: '1' })
        );
      });
      expect(await screen.findByTestId('tour-running-save_template')).toBeInTheDocument();
    });
```

This drives `handleConfirmPublish` for real: clicking `publish-schedule-button` opens the modal, clicking "Publish Now" invokes the actual handler, which calls the mocked `gamedayApi.publish`, fires `trackEvent('gameday_published', ...)`, and then (once Step 4 below is implemented) the new tour-trigger logic. Add `waitFor` to this file's existing `@testing-library/react` import (`render, screen, act` → `render, screen, act, waitFor`) if it isn't already imported.

- [ ] **Step 3: Run the test to verify it fails**

Run: `cd leaguesphere/gameday_designer && npx vitest run src/components/__tests__/ListDesignerApp.test.tsx -t "save_template tour"`
Expected: FAIL — `handleConfirmPublish` doesn't start Tour B yet.

- [ ] **Step 4: Wire it into `handleConfirmPublish`**

Add the import to `ListDesignerApp.tsx`:

```tsx
import { getSaveTemplateTourSteps } from '../onboarding/tours/saveTemplateTour';
```

Add the hook and run-state, alongside the Task 6 additions:

```tsx
  const saveTemplateTour = useTourSeen('save_template');
  const [runSaveTemplateTour, setRunSaveTemplateTour] = useState(false);

  const handleSaveTemplateTourFinish = useCallback(() => {
    setRunSaveTemplateTour(false);
    saveTemplateTour.markSeen();
  }, [saveTemplateTour]);
```

In `handleConfirmPublish` (currently lines 389-410), right after the existing `trackEvent('gameday_published', {...})` call:

```tsx
      trackEvent('gameday_published', {
        gameday_id: id,
        game_count: gameCount,
        stage_count: stageCount,
      });

      if (!saveTemplateTour.loading && !saveTemplateTour.seen) {
        trackEvent('gd_tour_save_template_started', { gameday_id: id });
        setRunSaveTemplateTour(true);
      }
```

Add `saveTemplateTour.loading` and `saveTemplateTour.seen` to `handleConfirmPublish`'s dependency array (it's a `useCallback` — extend the existing deps list at line 410).

Add the second `<DesignerTour>` instance in the JSX, next to the Task 6 one:

```tsx
      <DesignerTour
        tourId="save_template"
        steps={getSaveTemplateTourSteps(t)}
        run={runSaveTemplateTour}
        onFinish={handleSaveTemplateTourFinish}
      />
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `cd leaguesphere/gameday_designer && npx vitest run src/components/__tests__/ListDesignerApp.test.tsx -t "save_template tour"`
Expected: PASS.

Run the full file and the full frontend suite to confirm no regressions:
Run: `cd leaguesphere/gameday_designer && npx vitest run src/components/__tests__/ListDesignerApp.test.tsx`
Expected: PASS

Run: `cd leaguesphere/gameday_designer && npm run test`
Expected: PASS (full suite)

- [ ] **Step 6: Commit**

```bash
git add gameday_designer/src/onboarding/tours/saveTemplateTour.ts gameday_designer/src/components/ListDesignerApp.tsx gameday_designer/src/components/__tests__/ListDesignerApp.test.tsx
git commit -m "feat(gameday_designer): nudge first-time publishers to save their schedule as a template"
```

---

## Manual verification (after all tasks)

1. `cd leaguesphere/gameday_designer && npm run build` — confirm the app still builds.
2. `cd leaguesphere && python manage.py test journey gameday_designer` — full backend suite.
3. In a browser, as a fresh non-staff user: create a gameday, land on `/designer/:id`, confirm Tour A auto-starts and each step's target element highlights correctly (field → stage → team → game → toolbar).
4. Click the "?" button after finishing/skipping the tour; confirm it replays.
5. Build a minimal schedule and publish it; confirm Tour B fires, the Templates button is enabled, and "Save current as template" succeeds with only "Personal" visibility offered.
6. As a staff user, repeat step 5 and confirm all three visibility options are offered and a GLOBAL/ASSOCIATION save succeeds.
7. Reload the designer page as the same non-staff user; confirm neither tour auto-starts again (seen-state persisted).
