# User Journey Tracking — Design Spec

**Date:** 2026-04-26
**Status:** Approved

## Context

LeagueSphere has no visibility into how admin/league managers actually use the platform. We want to capture named action events (e.g. "gameday_created", "template_applied") from the React frontends and group them into discrete journeys so that an admin can see both aggregate usage patterns and individual user journeys over time.

## Scope

- **Who is tracked:** Admin and league manager users only (not public/fans or team managers)
- **What is tracked:** Explicit named action events posted from React frontends — not page views
- **Where admin views it:** A separate custom React dashboard at `/journeys/`

## Architecture

Three pieces:

1. **Django `journey` app** — stores events and journeys, exposes REST endpoints
2. **`trackEvent` utility** — small shared function added to existing React apps
3. **`journey_dashboard` React app** — read-only dashboard served at `/journeys/`

## Data Model

```python
# journey/models.py

class Journey(models.Model):
    user       = models.ForeignKey(User, on_delete=models.CASCADE)
    started_at = models.DateTimeField(auto_now_add=True)
    ended_at   = models.DateTimeField(null=True, blank=True)  # null = active

class JourneyEvent(models.Model):
    journey    = models.ForeignKey(Journey, on_delete=models.CASCADE)
    event_name = models.CharField(max_length=100)   # e.g. "gameday_created"
    metadata   = models.JSONField(default=dict)      # optional context, e.g. {"template_id": 5}
    created_at = models.DateTimeField(auto_now_add=True)
```

## Journey Boundary Rules

A new `Journey` is created when:
1. **Login** — hooked into Knox `AuthToken` post-save signal; closes any open journey for that user first
2. **Inactivity** — when a new event arrives and the last event on the active journey was > 30 minutes ago; the server closes the current journey and opens a new one before recording the event

**Logout** sets `ended_at` on the active journey (hooked into Knox token deletion signal).

The 30-minute threshold lives in `settings.py` as `JOURNEY_INACTIVITY_MINUTES = 30`.

## Backend API

All endpoints require Knox token authentication.

| Method | Path | Purpose |
|--------|------|---------|
| `POST` | `/api/journey/events/` | Record an event (React → backend). Handles journey boundary logic. |
| `GET` | `/api/journey/events/?journey=<id>` | Fetch events for one journey (dashboard timeline). |
| `GET` | `/api/journey/journeys/?user=<id>&from=<date>` | List journeys for a user (dashboard). |
| `GET` | `/api/journey/stats/` | Aggregate counts per event_name (last 7 days). |

## Frontend Event Tracking

A small utility added to each React app (copy-paste, not a shared package — keeps it simple):

```typescript
// trackEvent.ts
export function trackEvent(eventName: string, metadata: Record<string, unknown> = {}) {
  const token = localStorage.getItem('authToken');
  if (!token) return;
  fetch('/api/journey/events/', {
    method: 'POST',
    headers: { 'Authorization': `Token ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ event_name: eventName, metadata }),
  });
  // fire-and-forget — tracking loss is acceptable
}
```

Example call sites:
- `gameday_designer` — `trackEvent('template_applied', { template_id })`
- `passcheck` — `trackEvent('playerlist_verified')`
- `scorecard` — `trackEvent('score_submitted', { game_id })`

## Dashboard App (`journey_dashboard`)

New Vite/React/TypeScript app following the same structure as `gameday_designer/`.

Django serves it via a `TemplateView` at `/journeys/` pointing to the built `index.html`.

**Single scrollable page — three sections:**

1. **Summary cards** — events today, active users this week, distinct event types
2. **Top actions table** — event names ranked by count, with a date-range filter (last 7 / 30 / 90 days)
3. **User timeline** — dropdown to select a user, lists their journeys, shows events in chronological order with timestamps and metadata

Auth: if no `authToken` in localStorage, redirect to `/accounts/auth/login/`.

## Files to Create

- `journey/` — new Django app
  - `journey/models.py`
  - `journey/serializers.py`
  - `journey/views.py`
  - `journey/urls.py`
  - `journey/signals.py` — Knox login/logout hooks
  - `journey/apps.py`
  - `journey/migrations/`
  - `journey/admin.py`
- `journey_dashboard/` — new Vite React app
  - `journey_dashboard/src/App.tsx`
  - `journey_dashboard/src/trackEvent.ts`
  - `journey_dashboard/src/components/SummaryCards.tsx`
  - `journey_dashboard/src/components/TopActionsTable.tsx`
  - `journey_dashboard/src/components/UserTimeline.tsx`
  - `journey_dashboard/templates/journey_dashboard/index.html`

## Files to Modify

- `league_manager/settings/base.py` — add `journey` to `INSTALLED_APPS`, add `JOURNEY_INACTIVITY_MINUTES = 30`
- `league_manager/urls.py` — add `/api/journey/` and `/journeys/` routes
- Existing React apps (`gameday_designer`, `passcheck`, `scorecard`) — add `trackEvent` utility and instrument key actions

## Verification

1. Start dev server, log in as admin
2. Perform actions in `gameday_designer` (apply a template) — confirm `JourneyEvent` row created in DB
3. Wait 30+ minutes (or set threshold to 1 min for testing), perform another action — confirm a new `Journey` was created
4. Log out and back in — confirm new `Journey` created
5. Open `/journeys/` — verify summary cards show counts, top actions table populates, user timeline shows the test user's journey
6. Run `python manage.py test journey` — unit tests for boundary logic
