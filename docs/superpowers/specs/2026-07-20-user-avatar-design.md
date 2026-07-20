# Design: Real User Avatar in Gameday Designer Header

Date: 2026-07-20
Branch: `feat/user-avatar`

## Problem

The Gameday Designer header (`gameday_designer/src/components/layout/AppHeader.tsx`) shows a
generic Bootstrap icon (`bi-person-circle`) and a hardcoded, translated "User" label, regardless
of who is logged in. This is the only spot in the codebase with a generic user-avatar
placeholder — confirmed by repo-wide search.

`UserProfile.avatar` (`gamedays/models.py:298-302`) already exists as an `ImageField`
(`upload_to="media/teammanager/avatars"`), registered in Django admin, with `MEDIA_URL`/
`MEDIA_ROOT` configured — but nothing serves or displays it today. It's a dead field.

## Scope

Explicitly **display-only**: show the avatar if a staff member has set one via Django admin;
no self-service upload UI in this pass. Users without an uploaded avatar (the common case today)
keep seeing the existing fallback icon — no initials-avatar generation.

The real username also replaces the hardcoded "User" label, since we're already fetching
per-user data for the avatar.

Out of scope: any other app (passcheck, liveticker, scorecard, journey_dashboard) — none of them
have a generic-avatar placeholder today, so there's nothing to replace there.

## Backend

Extend the existing `ConfigView` (`gameday_designer/views.py:585-593`) rather than adding a new
endpoint. It's already `IsAuthenticated`-gated, already fetched once on app mount, and its
response is memoized client-side (`designerApi.getConfig()`), so no new network round trip is
introduced.

New response shape:
```json
{
  "mock_teams": false,
  "is_staff": false,
  "username": "jdoe",
  "avatar_url": "/media/teammanager/avatars/jdoe.png"
}
```

Implementation:
- `username`: `request.user.username`.
- `avatar_url`: look up `UserProfile.objects.get(user=request.user)`, wrapped in
  `try/except UserProfile.DoesNotExist` — mirroring the existing lookup pattern already used
  in this same file (`ScheduleTemplateViewSet.get_queryset`, ~line 110-118). Return
  `profile.avatar.url` if the field has a file, else `None`. Same for the "no profile" case.

Rejected alternative: extend `accounts.UserSerializer` (used by the shared
`/accounts/auth/user/` endpoint). Rejected because that endpoint/serializer is also used by
scorecard/liveticker's login flow — widening its shape would affect apps that don't need this
data, for no benefit over extending the endpoint gameday_designer already calls.

## Frontend (`gameday_designer`)

- `src/api/designerApi.ts`: extend `getConfig()`'s return type with `username: string` and
  `avatar_url: string | null`.
- New hook `src/hooks/useCurrentUser.ts` (sibling to the existing `useIsStaff.ts`), calling
  `designerApi.getConfig()` and returning `{ username, avatarUrl }`, defaulting to
  `{ username: '', avatarUrl: null }` while loading or on fetch error (fails silently — this is
  a decorative header element, not critical path).
- `src/components/layout/AppHeader.tsx:86-89`: replace the static icon + hardcoded label with:
  - `<img>` of `avatarUrl` when set (circular, ~20px, matching the current icon's visual weight),
    with `alt={username}`.
  - Fallback to the existing `bi-person-circle` icon when `avatarUrl` is `null`.
  - Label shows `username`, falling back to the translated `ui:label.user` string when empty
    (still loading, or fetch failed).

## Testing

Backend — new test file covering `ConfigView` (currently has zero test coverage):
- No `UserProfile` for the user → `avatar_url: null`.
- `UserProfile` exists but `avatar` field is empty → `avatar_url: null`.
- `UserProfile` exists with an avatar file → `avatar_url` is the file's URL.
- Baseline coverage for the pre-existing `mock_teams`/`is_staff` fields, since the view had none.

Frontend:
- `useCurrentUser.test.ts` — mock `designerApi.getConfig` (same style as
  `useIsStaff.test.ts`), assert hook returns parsed `username`/`avatarUrl`, and defaults on
  error.
- `AppHeader.test.tsx` — update the "renders user profile placeholder" test to cover both the
  fallback state (no avatar/username loaded yet → icon + "User" label) and the loaded state
  (avatar image + real username rendered).
