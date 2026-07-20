# Real User Avatar in Gameday Designer Header Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the generic `bi-person-circle` icon and hardcoded "User" label in the Gameday Designer header with the logged-in user's real avatar (if a staff member set one via Django admin) and real username.

**Architecture:** Extend the existing, already-authenticated `ConfigView` (`gameday_designer/views.py`) with `username`/`avatar_url` fields instead of adding a new endpoint — it's already fetched once on app mount and memoized client-side. Add a `useCurrentUser` React hook that reads those fields, and wire it into `AppHeader.tsx` with a fallback to the current icon/label when no avatar is set.

**Tech Stack:** Django REST Framework (backend), React + TypeScript + Vitest (frontend), pytest (backend tests).

## Global Constraints

- Display-only: no self-service avatar upload UI in this feature. `UserProfile.avatar` stays admin-managed.
- Users without an uploaded avatar keep seeing the existing fallback icon — no initials-avatar generation.
- No new API endpoint — extend `ConfigView` (`gameday_designer/views.py:585-593`), not `accounts.UserSerializer`.
- Backend tests require the LXC test DB: `export MYSQL_HOST=$(lxc list servyy-test --format json | jq -r '.[0].state.network.eth0.addresses[] | select(.family=="inet") | .address' | head -n 1)` (see root `CLAUDE.md`).
- Frontend commands run from the `gameday_designer/` directory.
- `black .` (backend) and `npm run eslint` (frontend, zero errors) must pass before considering any task done.

---

### Task 1: Backend — `ConfigView` returns `username` and `avatar_url`

**Files:**
- Create: `gameday_designer/tests/test_config_view.py`
- Modify: `gameday_designer/views.py:585-593` (`ConfigView.get`)

**Interfaces:**
- Consumes: `gamedays.models.UserProfile` (existing model — `user` FK, `avatar` ImageField, both nullable/blank). Existing fixtures from `gameday_designer/tests/conftest.py`: `api_client`, `staff_user`, `association_user`.
- Produces: `GET /api/designer/config/` now returns `{"mock_teams": bool, "is_staff": bool, "username": str, "avatar_url": str | null}`. Task 2's frontend type must match this shape exactly.

- [ ] **Step 1: Write the failing tests**

Create `gameday_designer/tests/test_config_view.py`:

```python
"""
Tests for GET /api/designer/config/ (ConfigView).
"""

import pytest
from rest_framework import status

from gamedays.models import UserProfile


@pytest.mark.django_db
class TestConfigView:
    """Test GET /api/designer/config/."""

    def test_anonymous_cannot_get_config(self, api_client):
        response = api_client.get("/api/designer/config/")

        assert response.status_code == status.HTTP_401_UNAUTHORIZED

    def test_is_staff_true_for_staff_user(self, api_client, staff_user):
        api_client.force_authenticate(user=staff_user)
        response = api_client.get("/api/designer/config/")

        assert response.status_code == status.HTTP_200_OK
        assert response.data["is_staff"] is True

    def test_is_staff_false_for_regular_user(self, api_client, association_user):
        api_client.force_authenticate(user=association_user)
        response = api_client.get("/api/designer/config/")

        assert response.status_code == status.HTTP_200_OK
        assert response.data["is_staff"] is False

    def test_mock_teams_defaults_to_false(self, api_client, association_user):
        api_client.force_authenticate(user=association_user)
        response = api_client.get("/api/designer/config/")

        assert response.data["mock_teams"] is False

    def test_username_matches_authenticated_user(self, api_client, association_user):
        api_client.force_authenticate(user=association_user)
        response = api_client.get("/api/designer/config/")

        assert response.data["username"] == association_user.username

    def test_avatar_url_is_none_when_user_has_no_profile(self, api_client, association_user):
        api_client.force_authenticate(user=association_user)
        response = api_client.get("/api/designer/config/")

        assert response.data["avatar_url"] is None

    def test_avatar_url_is_none_when_profile_has_no_avatar_file(self, api_client, association_user):
        UserProfile.objects.create(user=association_user)
        api_client.force_authenticate(user=association_user)

        response = api_client.get("/api/designer/config/")

        assert response.data["avatar_url"] is None

    def test_avatar_url_returns_file_url_when_avatar_is_set(self, api_client, association_user):
        profile = UserProfile.objects.create(user=association_user)
        profile.avatar.name = "media/teammanager/avatars/test-avatar.png"
        profile.save()
        api_client.force_authenticate(user=association_user)

        response = api_client.get("/api/designer/config/")

        assert response.data["avatar_url"] == profile.avatar.url
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `export MYSQL_HOST=$(lxc list servyy-test --format json | jq -r '.[0].state.network.eth0.addresses[] | select(.family=="inet") | .address' | head -n 1) && pytest gameday_designer/tests/test_config_view.py -v`

Expected: `test_anonymous_cannot_get_config` and `test_is_staff_true_for_staff_user`/`test_is_staff_false_for_regular_user` PASS (existing behavior); `test_username_matches_authenticated_user` and the three `avatar_url` tests FAIL with `KeyError: 'username'` / `KeyError: 'avatar_url'`.

- [ ] **Step 3: Implement `username`/`avatar_url` in `ConfigView`**

In `gameday_designer/views.py`, replace lines 585-593:

```python
class ConfigView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        from django.conf import settings
        from gamedays.models import UserProfile

        avatar_url = None
        try:
            profile = UserProfile.objects.get(user=request.user)
            if profile.avatar:
                avatar_url = profile.avatar.url
        except UserProfile.DoesNotExist:
            pass

        return Response({
            "mock_teams": getattr(settings, "MOCK_TEAMS", False),
            "is_staff": bool(request.user and request.user.is_staff),
            "username": request.user.username,
            "avatar_url": avatar_url,
        })
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pytest gameday_designer/tests/test_config_view.py -v`
Expected: all 8 tests PASS.

- [ ] **Step 5: Format and commit**

Run: `black gameday_designer/views.py gameday_designer/tests/test_config_view.py`

```bash
git add gameday_designer/views.py gameday_designer/tests/test_config_view.py
git commit -m "feat: expose username and avatar_url from ConfigView"
```

---

### Task 2: Frontend — `designerApi` type + `useCurrentUser` hook

**Files:**
- Modify: `gameday_designer/src/api/designerApi.ts:33` (field decl), `:274-284` (`getConfig`)
- Modify: `gameday_designer/src/hooks/__tests__/useIsStaff.test.ts` (mock fixtures need the new required fields to type-check)
- Create: `gameday_designer/src/hooks/useCurrentUser.ts`
- Create: `gameday_designer/src/hooks/__tests__/useCurrentUser.test.ts`

**Interfaces:**
- Consumes: `designerApi.getConfig(): Promise<DesignerConfig>` where `DesignerConfig = { mock_teams: boolean; is_staff: boolean; username: string; avatar_url: string | null }` (produced by this task; backend shape from Task 1).
- Produces: `useCurrentUser(): { username: string; avatarUrl: string | null }`, exported from `gameday_designer/src/hooks/useCurrentUser.ts`. Task 3's `AppHeader.tsx` imports this hook directly (`import { useCurrentUser } from '../../hooks/useCurrentUser';`).

- [ ] **Step 1: Write the failing hook test**

Create `gameday_designer/src/hooks/__tests__/useCurrentUser.test.ts`:

```ts
import { renderHook, waitFor } from '@testing-library/react';
import { vi, describe, it, expect, beforeEach } from 'vitest';
import { designerApi } from '../../api/designerApi';
import { useCurrentUser } from '../useCurrentUser';

describe('useCurrentUser', () => {
  beforeEach(() => vi.restoreAllMocks());

  it('returns username and avatarUrl from config when an avatar is set', async () => {
    vi.spyOn(designerApi, 'getConfig').mockResolvedValue({
      mock_teams: false,
      is_staff: false,
      username: 'jdoe',
      avatar_url: '/media/avatars/jdoe.png',
    });

    const { result } = renderHook(() => useCurrentUser());

    await waitFor(() =>
      expect(result.current).toEqual({ username: 'jdoe', avatarUrl: '/media/avatars/jdoe.png' })
    );
  });

  it('returns a null avatarUrl when config has no avatar', async () => {
    vi.spyOn(designerApi, 'getConfig').mockResolvedValue({
      mock_teams: false,
      is_staff: false,
      username: 'jdoe',
      avatar_url: null,
    });

    const { result } = renderHook(() => useCurrentUser());

    await waitFor(() =>
      expect(result.current).toEqual({ username: 'jdoe', avatarUrl: null })
    );
  });

  it('falls back to empty defaults when the request fails', async () => {
    vi.spyOn(designerApi, 'getConfig').mockRejectedValue(new Error('network error'));

    const { result } = renderHook(() => useCurrentUser());

    await waitFor(() =>
      expect(result.current).toEqual({ username: '', avatarUrl: null })
    );
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run (from `gameday_designer/`): `npx vitest run src/hooks/__tests__/useCurrentUser.test.ts`
Expected: FAIL — `Failed to resolve import "../useCurrentUser"` (module doesn't exist yet).

- [ ] **Step 3: Extend `designerApi`'s config type**

In `gameday_designer/src/api/designerApi.ts`, add an exported interface near the top (next to `TeamRecord`, after its closing brace around line 26):

```ts
export interface DesignerConfig {
  mock_teams: boolean;
  is_staff: boolean;
  username: string;
  avatar_url: string | null;
}
```

Replace line 33:

```ts
  private configPromise: Promise<{ mock_teams: boolean; is_staff: boolean }> | null = null;
```

with:

```ts
  private configPromise: Promise<DesignerConfig> | null = null;
```

Replace lines 274-284 (`getConfig`):

```ts
  async getConfig(): Promise<DesignerConfig> {
    if (!this.configPromise) {
      this.configPromise = this.client.get<DesignerConfig>('/config/')
        .then(response => response.data)
        .catch(err => {
          this.configPromise = null;
          throw err;
        });
    }
    return this.configPromise;
  }
```

- [ ] **Step 4: Update `useIsStaff.test.ts` mocks to satisfy the new required fields**

In `gameday_designer/src/hooks/__tests__/useIsStaff.test.ts`, replace both `mockResolvedValue` calls:

```ts
  it('returns true when config.is_staff is true', async () => {
    vi.spyOn(designerApi, 'getConfig').mockResolvedValue({
      mock_teams: false,
      is_staff: true,
      username: 'staff',
      avatar_url: null,
    });
    const { result } = renderHook(() => useIsStaff());
    await waitFor(() => expect(result.current).toBe(true));
  });

  it('returns false when config.is_staff is false', async () => {
    vi.spyOn(designerApi, 'getConfig').mockResolvedValue({
      mock_teams: false,
      is_staff: false,
      username: 'regular',
      avatar_url: null,
    });
    const { result } = renderHook(() => useIsStaff());
    await waitFor(() => expect(result.current).toBe(false));
  });
```

- [ ] **Step 5: Implement `useCurrentUser`**

Create `gameday_designer/src/hooks/useCurrentUser.ts`:

```ts
import { useEffect, useState } from 'react';
import { designerApi } from '../api/designerApi';

export interface CurrentUser {
  username: string;
  avatarUrl: string | null;
}

const DEFAULT_CURRENT_USER: CurrentUser = { username: '', avatarUrl: null };

export function useCurrentUser(): CurrentUser {
  const [currentUser, setCurrentUser] = useState<CurrentUser>(DEFAULT_CURRENT_USER);

  useEffect(() => {
    designerApi.getConfig()
      .then(config => setCurrentUser({ username: config.username, avatarUrl: config.avatar_url }))
      .catch(() => setCurrentUser(DEFAULT_CURRENT_USER));
  }, []);

  return currentUser;
}
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `npx vitest run src/hooks/__tests__/useCurrentUser.test.ts src/hooks/__tests__/useIsStaff.test.ts`
Expected: all tests PASS (3 in `useCurrentUser.test.ts`, 2 in `useIsStaff.test.ts`).

- [ ] **Step 7: Lint and commit**

Run: `npm run eslint`
Expected: 0 errors.

```bash
git add gameday_designer/src/api/designerApi.ts gameday_designer/src/hooks/useCurrentUser.ts gameday_designer/src/hooks/__tests__/useCurrentUser.test.ts gameday_designer/src/hooks/__tests__/useIsStaff.test.ts
git commit -m "feat: add useCurrentUser hook backed by DesignerConfig"
```

---

### Task 3: Frontend — wire the avatar into `AppHeader`

**Files:**
- Modify: `gameday_designer/src/components/layout/AppHeader.tsx`
- Modify: `gameday_designer/src/components/layout/__tests__/AppHeader.test.tsx`

**Interfaces:**
- Consumes: `useCurrentUser(): { username: string; avatarUrl: string | null }` from Task 2 (`gameday_designer/src/hooks/useCurrentUser.ts`); `designerApi` from `gameday_designer/src/api/designerApi.ts`.
- Produces: no new exports — this is the leaf UI change.

- [ ] **Step 1: Update the failing/changing tests first**

Replace the full contents of `gameday_designer/src/components/layout/__tests__/AppHeader.test.tsx`:

```tsx
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import AppHeader from '../AppHeader';
import { GamedayProvider } from '../../../context/GamedayContext';
import { designerApi } from '../../../api/designerApi';
import i18n from '../../../i18n/testConfig';

// Mock LanguageSelector since it's tested separately
vi.mock('../../../components/LanguageSelector', () => ({
  default: () => <div data-testid="language-selector">LanguageSelector</div>,
}));

describe('AppHeader', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('en');
    vi.restoreAllMocks();
    vi.spyOn(designerApi, 'getConfig').mockResolvedValue({
      mock_teams: false,
      is_staff: false,
      username: '',
      avatar_url: null,
    });
  });

  const renderHeader = (path = '/') => {
    return render(
      <MemoryRouter initialEntries={[path]}>
        <GamedayProvider>
          <Routes>
            <Route path="*" element={<AppHeader />} />
          </Routes>
        </GamedayProvider>
      </MemoryRouter>
    );
  };

  it('renders application title', () => {
    renderHeader();
    expect(screen.getByText(/Gameday Designer/i)).toBeInTheDocument();
  });

  it('renders dashboard title via brand click', () => {
    renderHeader('/');
    expect(screen.getByText(/Gameday Designer/i)).toBeInTheDocument();
  });

  it('renders gameday name when in designer and name is provided via props', () => {
    renderHeader('/designer/1');
    expect(screen.getByText(/New Gameday/i)).toBeInTheDocument();
  });

  it('shows back button only when in designer', () => {
    renderHeader('/');
    expect(screen.queryByTitle(/Back to Dashboard/i)).not.toBeInTheDocument();

    renderHeader('/designer/1');
    expect(screen.getByTitle(/Back to Dashboard/i)).toBeInTheDocument();
  });

  it('renders language selector', () => {
    renderHeader();
    expect(screen.getByTestId('language-selector')).toBeInTheDocument();
  });

  it('shows the fallback icon and "User" label when no avatar is set', async () => {
    renderHeader();

    expect(await screen.findByText('User')).toBeInTheDocument();
    expect(screen.queryByTestId('user-avatar-image')).not.toBeInTheDocument();
  });

  it('shows the avatar image and real username once loaded', async () => {
    vi.spyOn(designerApi, 'getConfig').mockResolvedValue({
      mock_teams: false,
      is_staff: false,
      username: 'jdoe',
      avatar_url: '/media/avatars/jdoe.png',
    });

    renderHeader();

    const avatar = await screen.findByTestId('user-avatar-image');
    expect(avatar).toHaveAttribute('src', '/media/avatars/jdoe.png');
    await waitFor(() => expect(screen.getByText('jdoe')).toBeInTheDocument());
  });
});
```

- [ ] **Step 2: Run tests to verify the two new/changed tests fail**

Run (from `gameday_designer/`): `npx vitest run src/components/layout/__tests__/AppHeader.test.tsx`
Expected: `shows the fallback icon and "User" label when no avatar is set` PASSES already (fallback UI is unchanged so far); `shows the avatar image and real username once loaded` FAILS — `Unable to find an element by: [data-testid="user-avatar-image"]` (component doesn't render an avatar image yet).

- [ ] **Step 3: Wire `useCurrentUser` into `AppHeader`**

In `gameday_designer/src/components/layout/AppHeader.tsx`, add the import after the existing `GamedayContext` import (after line 7):

```tsx
import { useGamedayContext } from '../../context/GamedayContext';
import { useCurrentUser } from '../../hooks/useCurrentUser';
```

Add the hook call after line 17 (`const { gamedayName, ... } = useGamedayContext();`):

```tsx
  const { gamedayName, onOpenTemplates, toolbarProps, isLocked } = useGamedayContext();
  const { username, avatarUrl } = useCurrentUser();
```

Replace lines 86-89:

```tsx
            <div className="d-flex align-items-center text-light border-start ps-3 ms-1" style={{ height: '24px' }}>
              <i className="bi bi-person-circle me-2 fs-5"></i>
              <span className="small fw-medium">{t('ui:label.user')}</span>
            </div>
```

with:

```tsx
            <div className="d-flex align-items-center text-light border-start ps-3 ms-1" style={{ height: '24px' }}>
              {avatarUrl ? (
                <img
                  src={avatarUrl}
                  alt={username || t('ui:label.user')}
                  className="rounded-circle me-2"
                  style={{ width: '20px', height: '20px', objectFit: 'cover' }}
                  data-testid="user-avatar-image"
                />
              ) : (
                <i className="bi bi-person-circle me-2 fs-5"></i>
              )}
              <span className="small fw-medium">{username || t('ui:label.user')}</span>
            </div>
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/components/layout/__tests__/AppHeader.test.tsx`
Expected: all 7 tests PASS.

- [ ] **Step 5: Run the full frontend suite and lint**

Run: `npm run test:run`
Expected: all tests PASS (no regressions in other suites).

Run: `npm run eslint`
Expected: 0 errors.

- [ ] **Step 6: Commit**

```bash
git add gameday_designer/src/components/layout/AppHeader.tsx gameday_designer/src/components/layout/__tests__/AppHeader.test.tsx
git commit -m "feat: show real user avatar and username in gameday designer header"
```

---

## Manual Verification

After all three tasks are committed:

1. Deploy to stage per root `CLAUDE.md` (`./container/deploy.sh stage`).
2. Log into [stage.leaguesphere.app](https://stage.leaguesphere.app) as a user with no `UserProfile.avatar` set — confirm the header still shows the fallback icon and the real username (not "User" once loaded).
3. In Django admin, upload an avatar image to that user's `UserProfile`.
4. Reload the Gameday Designer — confirm the header now shows the uploaded avatar image instead of the icon.
