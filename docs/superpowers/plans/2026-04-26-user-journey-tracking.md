# User Journey Tracking Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Track admin/league manager action events from React frontends, group them into journeys (sessions), and provide an admin dashboard to view aggregate usage stats and per-user timelines.

**Architecture:** New Django `journey` app stores `Journey` and `JourneyEvent` models, hooked into Knox auth signals. React apps post named action events via a simple `trackEvent` utility. A new `journey_dashboard` React app reads the data back via REST endpoints and displays summaries + user timelines.

**Tech Stack:** Django 6.0, DRF 3.17, Knox tokens, React 18, Vite, JSON for metadata storage

---

## File Structure

### Django Backend (`journey` app)
- **Create:** `journey/models.py` — `Journey`, `JourneyEvent` models
- **Create:** `journey/serializers.py` — DRF serializers for events and journeys
- **Create:** `journey/views.py` — `JourneyEventViewSet`, stats endpoint
- **Create:** `journey/urls.py` — API routes under `/api/journey/`
- **Create:** `journey/signals.py` — Knox login/logout signal handlers
- **Create:** `journey/apps.py` — AppConfig with signal registration
- **Create:** `journey/admin.py` — Django admin views
- **Create:** `journey/migrations/0001_initial.py` — database schema
- **Modify:** `league_manager/settings/base.py` — add `journey` to `INSTALLED_APPS`, add `JOURNEY_INACTIVITY_MINUTES`
- **Modify:** `league_manager/urls.py` — include journey API routes
- **Create:** `journey/tests.py` — unit + integration tests

### React Dashboard (`journey_dashboard` app)
- **Create:** `journey_dashboard/` — new Vite project (same structure as gameday_designer)
- **Create:** `journey_dashboard/src/App.tsx` — main dashboard component
- **Create:** `journey_dashboard/src/components/SummaryCards.tsx` — stats cards
- **Create:** `journey_dashboard/src/components/TopActionsTable.tsx` — event frequency table
- **Create:** `journey_dashboard/src/components/UserTimeline.tsx` — user selector + timeline
- **Create:** `journey_dashboard/src/utils/api.ts` — API client (fetch journeys, events, stats)
- **Create:** `journey_dashboard/src/types.ts` — TypeScript types for Journey, JourneyEvent
- **Create:** `journey_dashboard/templates/journey_dashboard/index.html` — Django template (served by TemplateView)
- **Create:** `journey_dashboard/package.json` — Vite config (copied from gameday_designer)

### Frontend Event Tracking
- **Create:** `journey_dashboard/src/trackEvent.ts` — shared tracking utility (will be copy-pasted into each app)
- **Modify:** `gameday_designer/src/trackEvent.ts` — create and import the utility
- **Modify:** `gameday_designer/src/[key files]` — add trackEvent calls on key actions
- **Modify:** `passcheck/src/trackEvent.ts` — create and import
- **Modify:** `passcheck/src/[key files]` — add trackEvent calls
- **Modify:** `scorecard/src/trackEvent.ts` — create and import
- **Modify:** `scorecard/src/[key files]` — add trackEvent calls

### Django Views & Routing
- **Modify:** `league_manager/urls.py` — add `/journeys/` TemplateView route
- **Create:** `journey/views.py` — add `JourneyDashboardView` (TemplateView)

---

## Tasks

### Task 1: Create Journey app and models

**Files:**
- Create: `journey/models.py`
- Create: `journey/apps.py`

- [ ] **Step 1: Create journey app directory and __init__.py**

```bash
mkdir -p journey
touch journey/__init__.py
```

- [ ] **Step 2: Write journey/apps.py**

```python
from django.apps import AppConfig

class JourneyConfig(AppConfig):
    default_auto_field = 'django.db.models.BigAutoField'
    name = 'journey'

    def ready(self):
        import journey.signals
```

- [ ] **Step 3: Write journey/models.py with Journey and JourneyEvent**

```python
from django.db import models
from django.contrib.auth.models import User

class Journey(models.Model):
    user = models.ForeignKey(User, on_delete=models.CASCADE)
    started_at = models.DateTimeField(auto_now_add=True)
    ended_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ['-started_at']

    def __str__(self):
        return f"{self.user.username} - {self.started_at}"

class JourneyEvent(models.Model):
    journey = models.ForeignKey(Journey, on_delete=models.CASCADE, related_name='events')
    event_name = models.CharField(max_length=100)
    metadata = models.JSONField(default=dict)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['created_at']
        indexes = [
            models.Index(fields=['journey', 'created_at']),
            models.Index(fields=['event_name', 'created_at']),
        ]

    def __str__(self):
        return f"{self.event_name} @ {self.created_at}"
```

- [ ] **Step 4: Commit**

```bash
git add journey/__init__.py journey/apps.py journey/models.py
git commit -m "feat: create journey app with models"
```

---

### Task 2: Create initial migration

**Files:**
- Create: `journey/migrations/0001_initial.py`

- [ ] **Step 1: Run makemigrations**

```bash
cd /home/cda/dev/leaguesphere
python manage.py makemigrations journey
```

Expected output: `Migrations for 'journey': journey/migrations/0001_initial.py`

- [ ] **Step 2: Verify migration file was created**

```bash
ls -la journey/migrations/
```

Expected: `0001_initial.py` should exist

- [ ] **Step 3: Commit**

```bash
git add journey/migrations/0001_initial.py
git commit -m "feat: add initial journey migration"
```

---

### Task 3: Create DRF serializers

**Files:**
- Create: `journey/serializers.py`

- [ ] **Step 1: Write journey/serializers.py**

```python
from rest_framework import serializers
from .models import Journey, JourneyEvent

class JourneyEventSerializer(serializers.ModelSerializer):
    class Meta:
        model = JourneyEvent
        fields = ['id', 'event_name', 'metadata', 'created_at']
        read_only_fields = ['id', 'created_at']

class JourneySerializer(serializers.ModelSerializer):
    events = JourneyEventSerializer(many=True, read_only=True)

    class Meta:
        model = Journey
        fields = ['id', 'user', 'started_at', 'ended_at', 'events']
        read_only_fields = ['id', 'started_at', 'ended_at']
```

- [ ] **Step 2: Commit**

```bash
git add journey/serializers.py
git commit -m "feat: add DRF serializers for journey models"
```

---

### Task 4: Create DRF ViewSets and stats endpoint

**Files:**
- Create: `journey/views.py`

- [ ] **Step 1: Write journey/views.py with ViewSets and stats**

```python
from rest_framework import viewsets, permissions, status
from rest_framework.decorators import action
from rest_framework.response import Response
from django.utils import timezone
from datetime import timedelta
from django.db.models import Count

from .models import Journey, JourneyEvent
from .serializers import JourneySerializer, JourneyEventSerializer

class JourneyEventViewSet(viewsets.ModelViewSet):
    serializer_class = JourneyEventSerializer
    permission_classes = [permissions.IsAuthenticated]
    queryset = JourneyEvent.objects.all()

    def create(self, request, *args, **kwargs):
        """Create event and handle journey boundaries (login/inactivity)."""
        user = request.user
        event_name = request.data.get('event_name')
        metadata = request.data.get('metadata', {})

        # Get or create active journey
        journey = self._get_or_create_journey(user)

        # Create event
        event = JourneyEvent.objects.create(
            journey=journey,
            event_name=event_name,
            metadata=metadata
        )

        serializer = self.get_serializer(event)
        return Response(serializer.data, status=status.HTTP_201_CREATED)

    def _get_or_create_journey(self, user):
        """Get active journey or create new one if inactive."""
        from django.conf import settings
        
        inactivity_minutes = getattr(settings, 'JOURNEY_INACTIVITY_MINUTES', 30)
        inactivity_threshold = timezone.now() - timedelta(minutes=inactivity_minutes)

        # Get the most recent journey
        active_journey = Journey.objects.filter(user=user, ended_at__isnull=True).first()

        if active_journey:
            # Check if the last event was recent
            last_event = active_journey.events.order_by('-created_at').first()
            if last_event and last_event.created_at < inactivity_threshold:
                # Journey is inactive, close it and create new one
                active_journey.ended_at = timezone.now()
                active_journey.save()
                return Journey.objects.create(user=user)
            return active_journey
        else:
            # No active journey, create one
            return Journey.objects.create(user=user)

    def get_queryset(self):
        """Filter events by user and optional journey."""
        qs = JourneyEvent.objects.filter(journey__user=self.request.user)
        journey_id = self.request.query_params.get('journey')
        if journey_id:
            qs = qs.filter(journey_id=journey_id)
        return qs.order_by('-created_at')

    @action(detail=False, methods=['get'])
    def stats(self, request):
        """Return aggregate event counts for the last 7 days."""
        seven_days_ago = timezone.now() - timedelta(days=7)
        events = JourneyEvent.objects.filter(
            journey__user=request.user,
            created_at__gte=seven_days_ago
        )
        stats = events.values('event_name').annotate(count=Count('id')).order_by('-count')
        return Response({
            'stats': list(stats),
            'total_events': events.count(),
            'unique_event_types': len(list(stats)),
        })

class JourneyViewSet(viewsets.ModelViewSet):
    serializer_class = JourneySerializer
    permission_classes = [permissions.IsAuthenticated]
    queryset = Journey.objects.all()

    def get_queryset(self):
        """Filter journeys by authenticated user."""
        return Journey.objects.filter(user=self.request.user).order_by('-started_at')
```

- [ ] **Step 2: Commit**

```bash
git add journey/views.py
git commit -m "feat: add DRF ViewSets for journeys and events"
```

---

### Task 5: Create URL routing for journey API

**Files:**
- Create: `journey/urls.py`

- [ ] **Step 1: Write journey/urls.py with DRF router**

```python
from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import JourneyEventViewSet, JourneyViewSet

router = DefaultRouter()
router.register(r'events', JourneyEventViewSet, basename='event')
router.register(r'journeys', JourneyViewSet, basename='journey')

urlpatterns = [
    path('', include(router.urls)),
]
```

- [ ] **Step 2: Commit**

```bash
git add journey/urls.py
git commit -m "feat: add journey API routes"
```

---

### Task 6: Add journey to INSTALLED_APPS and settings

**Files:**
- Modify: `league_manager/settings/base.py`

- [ ] **Step 1: Read the current INSTALLED_APPS in settings/base.py**

```bash
grep -A 20 "INSTALLED_APPS = \[" league_manager/settings/base.py | head -30
```

- [ ] **Step 2: Add journey to INSTALLED_APPS (before any test apps)**

Find the line `INSTALLED_APPS = [` and add `'journey.apps.JourneyConfig',` after `'league_manager',`. Example:

```python
INSTALLED_APPS = [
    'django.contrib.admin',
    'django.contrib.auth',
    # ... other apps ...
    'league_manager',
    'journey.apps.JourneyConfig',
    'gamedays',
    # ... rest of apps ...
]
```

- [ ] **Step 3: Add JOURNEY_INACTIVITY_MINUTES setting at the end of base.py**

Add this line near the end of the file (before any environment-specific overrides):

```python
JOURNEY_INACTIVITY_MINUTES = int(os.environ.get('JOURNEY_INACTIVITY_MINUTES', 30))
```

- [ ] **Step 4: Verify the settings file is valid**

```bash
python manage.py check
```

Expected: `System check identified no issues (0 silenced).`

- [ ] **Step 5: Commit**

```bash
git add league_manager/settings/base.py
git commit -m "feat: add journey to INSTALLED_APPS and settings"
```

---

### Task 7: Include journey URLs in main URLconf

**Files:**
- Modify: `league_manager/urls.py`

- [ ] **Step 1: Read current league_manager/urls.py to find where to add the route**

```bash
cat league_manager/urls.py
```

- [ ] **Step 2: Add journey API path to urlpatterns**

Find the line with `urlpatterns = [` and add this after the existing API paths:

```python
path('api/journey/', include('journey.urls')),
```

Full example of what it might look like:

```python
urlpatterns = [
    path('admin/', admin.site.urls),
    path('api/', include('gamedays.urls')),
    path('api/journey/', include('journey.urls')),
    path('api/designer/', include('gameday_designer.urls')),
    # ... other paths ...
]
```

- [ ] **Step 3: Verify URLs are valid**

```bash
python manage.py check
```

- [ ] **Step 4: Commit**

```bash
git add league_manager/urls.py
git commit -m "feat: wire up journey API routes"
```

---

### Task 8: Create Django signals for Knox login/logout

**Files:**
- Create: `journey/signals.py`

- [ ] **Step 1: Write journey/signals.py to hook into Knox signals**

```python
from django.dispatch import receiver
from django.utils import timezone
from rest_framework_knox.signals import user_logged_in, user_logged_out
from .models import Journey

@receiver(user_logged_in)
def on_user_logged_in(sender, user, auth_token, **kwargs):
    """Create a new journey when user logs in."""
    # Close any open journey (shouldn't happen but be safe)
    open_journey = Journey.objects.filter(user=user, ended_at__isnull=True).first()
    if open_journey:
        open_journey.ended_at = timezone.now()
        open_journey.save()
    
    # Create new journey
    Journey.objects.create(user=user)

@receiver(user_logged_out)
def on_user_logged_out(sender, user, auth_token, **kwargs):
    """Close active journey when user logs out."""
    open_journey = Journey.objects.filter(user=user, ended_at__isnull=True).first()
    if open_journey:
        open_journey.ended_at = timezone.now()
        open_journey.save()
```

- [ ] **Step 2: Commit**

```bash
git add journey/signals.py
git commit -m "feat: add Knox signal handlers for journey lifecycle"
```

---

### Task 9: Create Django admin views

**Files:**
- Create: `journey/admin.py`

- [ ] **Step 1: Write journey/admin.py**

```python
from django.contrib import admin
from .models import Journey, JourneyEvent

@admin.register(Journey)
class JourneyAdmin(admin.ModelAdmin):
    list_display = ['user', 'started_at', 'ended_at', 'event_count']
    list_filter = ['started_at', 'user']
    search_fields = ['user__username', 'user__email']
    readonly_fields = ['started_at', 'ended_at']

    def event_count(self, obj):
        return obj.events.count()
    event_count.short_description = 'Events'

@admin.register(JourneyEvent)
class JourneyEventAdmin(admin.ModelAdmin):
    list_display = ['event_name', 'journey', 'created_at']
    list_filter = ['event_name', 'created_at']
    search_fields = ['journey__user__username', 'event_name']
    readonly_fields = ['created_at', 'metadata']
```

- [ ] **Step 2: Commit**

```bash
git add journey/admin.py
git commit -m "feat: add journey Django admin views"
```

---

### Task 10: Run migrations and test backend

**Files:**
- (No new files)

- [ ] **Step 1: Run migrations**

```bash
python manage.py migrate journey
```

Expected: `Applying journey.0001_initial... OK`

- [ ] **Step 2: Test the API endpoint manually via shell**

```bash
python manage.py shell
```

Then in the shell:

```python
from django.contrib.auth.models import User
from journey.models import Journey, JourneyEvent

# Get a test user (or create one)
user = User.objects.first()

# Create a journey manually to test
j = Journey.objects.create(user=user)
print(f"Created journey: {j}")

# Create an event
e = JourneyEvent.objects.create(
    journey=j,
    event_name='test_event',
    metadata={'test': True}
)
print(f"Created event: {e}")

# Verify
print(f"Journey has {j.events.count()} events")
```

Expected: No errors, events created successfully

- [ ] **Step 3: Exit shell**

```python
exit()
```

- [ ] **Step 4: Commit (no changes, but good checkpoint)**

```bash
git status
# Should show clean working tree
```

---

### Task 11: Create trackEvent utility for React apps

**Files:**
- Create: `journey_dashboard/src/trackEvent.ts`

- [ ] **Step 1: Write journey_dashboard/src/trackEvent.ts**

```typescript
/**
 * Track a user journey event by posting to the backend.
 * Call this utility in React apps whenever a user performs a key action.
 * 
 * Example:
 *   trackEvent('gameday_created', { gameday_id: 123 })
 */
export function trackEvent(
  eventName: string,
  metadata: Record<string, unknown> = {}
): void {
  const token = localStorage.getItem('authToken');
  if (!token) {
    console.warn('trackEvent: No authToken found in localStorage');
    return;
  }

  fetch('/api/journey/events/', {
    method: 'POST',
    headers: {
      'Authorization': `Token ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      event_name: eventName,
      metadata,
    }),
  }).catch((err) => {
    // Silently fail — tracking loss is acceptable
    console.error('trackEvent error:', err);
  });
}
```

- [ ] **Step 2: Commit**

```bash
git add journey_dashboard/src/trackEvent.ts
git commit -m "feat: create trackEvent utility"
```

---

### Task 12: Create types file for React dashboard

**Files:**
- Create: `journey_dashboard/src/types.ts`

- [ ] **Step 1: Write journey_dashboard/src/types.ts**

```typescript
export interface JourneyEvent {
  id: number;
  event_name: string;
  metadata: Record<string, unknown>;
  created_at: string;
}

export interface Journey {
  id: number;
  user: number;
  started_at: string;
  ended_at: string | null;
  events: JourneyEvent[];
}

export interface JourneyStats {
  event_name: string;
  count: number;
}

export interface StatsResponse {
  stats: JourneyStats[];
  total_events: number;
  unique_event_types: number;
}
```

- [ ] **Step 2: Commit**

```bash
git add journey_dashboard/src/types.ts
git commit -m "feat: add TypeScript types for journey data"
```

---

### Task 13: Create API client for dashboard

**Files:**
- Create: `journey_dashboard/src/utils/api.ts`

- [ ] **Step 1: Create utils directory**

```bash
mkdir -p journey_dashboard/src/utils
```

- [ ] **Step 2: Write journey_dashboard/src/utils/api.ts**

```typescript
import { Journey, JourneyEvent, StatsResponse } from '../types';

const BASE_URL = '/api/journey';

function getAuthHeader(): HeadersInit {
  const token = localStorage.getItem('authToken');
  return {
    'Authorization': `Token ${token}`,
    'Content-Type': 'application/json',
  };
}

export async function fetchJourneys(userId?: number): Promise<Journey[]> {
  const url = userId ? `${BASE_URL}/journeys/?user=${userId}` : `${BASE_URL}/journeys/`;
  const res = await fetch(url, { headers: getAuthHeader() });
  if (!res.ok) throw new Error(`Failed to fetch journeys: ${res.statusText}`);
  const data = await res.json();
  return data.results || [];
}

export async function fetchEvents(journeyId: number): Promise<JourneyEvent[]> {
  const url = `${BASE_URL}/events/?journey=${journeyId}`;
  const res = await fetch(url, { headers: getAuthHeader() });
  if (!res.ok) throw new Error(`Failed to fetch events: ${res.statusText}`);
  const data = await res.json();
  return data.results || [];
}

export async function fetchStats(): Promise<StatsResponse> {
  const url = `${BASE_URL}/events/stats/`;
  const res = await fetch(url, { headers: getAuthHeader() });
  if (!res.ok) throw new Error(`Failed to fetch stats: ${res.statusText}`);
  return res.json();
}

export async function recordEvent(
  eventName: string,
  metadata?: Record<string, unknown>
): Promise<JourneyEvent> {
  const url = `${BASE_URL}/events/`;
  const res = await fetch(url, {
    method: 'POST',
    headers: getAuthHeader(),
    body: JSON.stringify({ event_name: eventName, metadata: metadata || {} }),
  });
  if (!res.ok) throw new Error(`Failed to record event: ${res.statusText}`);
  return res.json();
}
```

- [ ] **Step 3: Commit**

```bash
git add journey_dashboard/src/utils/api.ts
git commit -m "feat: add API client for journey dashboard"
```

---

### Task 14: Create dashboard components

**Files:**
- Create: `journey_dashboard/src/components/SummaryCards.tsx`
- Create: `journey_dashboard/src/components/TopActionsTable.tsx`
- Create: `journey_dashboard/src/components/UserTimeline.tsx`

- [ ] **Step 1: Create components directory**

```bash
mkdir -p journey_dashboard/src/components
```

- [ ] **Step 2: Write SummaryCards.tsx**

```typescript
import React from 'react';
import { StatsResponse } from '../types';

interface SummaryCardsProps {
  stats: StatsResponse | null;
  loading: boolean;
}

export const SummaryCards: React.FC<SummaryCardsProps> = ({ stats, loading }) => {
  if (loading) return <div>Loading...</div>;
  if (!stats) return null;

  return (
    <div className="summary-cards" style={{ display: 'flex', gap: '16px', marginBottom: '24px' }}>
      <div className="card" style={cardStyle}>
        <div className="card-value" style={{ fontSize: '24px', fontWeight: 'bold', color: '#1a73e8' }}>
          {stats.total_events}
        </div>
        <div className="card-label">Events Today</div>
      </div>
      <div className="card" style={cardStyle}>
        <div className="card-value" style={{ fontSize: '24px', fontWeight: 'bold', color: '#1a73e8' }}>
          {stats.unique_event_types}
        </div>
        <div className="card-label">Event Types</div>
      </div>
    </div>
  );
};

const cardStyle = {
  padding: '16px',
  border: '1px solid #e0e0e0',
  borderRadius: '8px',
  flex: 1,
  backgroundColor: '#f9f9f9',
};
```

- [ ] **Step 3: Write TopActionsTable.tsx**

```typescript
import React, { useState } from 'react';
import { StatsResponse } from '../types';

interface TopActionsTableProps {
  stats: StatsResponse | null;
  loading: boolean;
}

export const TopActionsTable: React.FC<TopActionsTableProps> = ({ stats, loading }) => {
  const [range, setRange] = useState('7d');

  if (loading) return <div>Loading...</div>;
  if (!stats) return null;

  return (
    <div className="top-actions-table" style={{ marginBottom: '24px' }}>
      <div style={{ marginBottom: '12px' }}>
        <h3>Top Actions (last {range === '7d' ? '7 days' : '30 days'})</h3>
        <select value={range} onChange={(e) => setRange(e.target.value)}>
          <option value="7d">Last 7 days</option>
          <option value="30d">Last 30 days</option>
        </select>
      </div>
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr style={{ borderBottom: '2px solid #ccc' }}>
            <th style={{ textAlign: 'left', padding: '8px' }}>Action</th>
            <th style={{ textAlign: 'right', padding: '8px' }}>Count</th>
          </tr>
        </thead>
        <tbody>
          {stats.stats.map((stat) => (
            <tr key={stat.event_name} style={{ borderBottom: '1px solid #eee' }}>
              <td style={{ padding: '8px' }}>{stat.event_name}</td>
              <td style={{ textAlign: 'right', padding: '8px', fontWeight: 'bold' }}>{stat.count}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};
```

- [ ] **Step 4: Write UserTimeline.tsx**

```typescript
import React, { useState, useEffect } from 'react';
import { Journey, JourneyEvent } from '../types';
import { fetchJourneys, fetchEvents } from '../utils/api';

export const UserTimeline: React.FC = () => {
  const [journeys, setJourneys] = useState<Journey[]>([]);
  const [selectedJourneyId, setSelectedJourneyId] = useState<number | null>(null);
  const [events, setEvents] = useState<JourneyEvent[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadJourneys = async () => {
      try {
        setLoading(true);
        const data = await fetchJourneys();
        setJourneys(data);
        if (data.length > 0) {
          setSelectedJourneyId(data[0].id);
        }
      } catch (err) {
        console.error('Failed to load journeys:', err);
      } finally {
        setLoading(false);
      }
    };
    loadJourneys();
  }, []);

  useEffect(() => {
    if (selectedJourneyId) {
      const loadEvents = async () => {
        try {
          const data = await fetchEvents(selectedJourneyId);
          setEvents(data);
        } catch (err) {
          console.error('Failed to load events:', err);
        }
      };
      loadEvents();
    }
  }, [selectedJourneyId]);

  if (loading) return <div>Loading...</div>;

  return (
    <div className="user-timeline">
      <h3>Journey Timeline</h3>
      <select
        value={selectedJourneyId || ''}
        onChange={(e) => setSelectedJourneyId(Number(e.target.value))}
      >
        {journeys.map((j) => (
          <option key={j.id} value={j.id}>
            {j.started_at} to {j.ended_at || 'active'}
          </option>
        ))}
      </select>

      <div style={{ marginTop: '16px' }}>
        {events.length === 0 ? (
          <p>No events in this journey</p>
        ) : (
          <div style={{ borderLeft: '2px solid #1a73e8', paddingLeft: '16px' }}>
            {events.map((event) => (
              <div key={event.id} style={{ marginBottom: '16px', paddingBottom: '8px' }}>
                <div style={{ fontWeight: 'bold', color: '#1a73e8' }}>
                  {event.event_name}
                </div>
                <div style={{ fontSize: '12px', color: '#888' }}>
                  {new Date(event.created_at).toLocaleString()}
                </div>
                {Object.keys(event.metadata).length > 0 && (
                  <div style={{ fontSize: '12px', color: '#666', marginTop: '4px' }}>
                    {JSON.stringify(event.metadata)}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
```

- [ ] **Step 5: Commit**

```bash
git add journey_dashboard/src/components/
git commit -m "feat: create dashboard components (SummaryCards, TopActionsTable, UserTimeline)"
```

---

### Task 15: Create main App.tsx and Django template

**Files:**
- Create: `journey_dashboard/src/App.tsx`
- Create: `journey_dashboard/templates/journey_dashboard/index.html`
- Create: `journey_dashboard/src/main.tsx`
- Create: `journey_dashboard/src/index.css`

- [ ] **Step 1: Write journey_dashboard/src/App.tsx**

```typescript
import React, { useState, useEffect } from 'react';
import { SummaryCards } from './components/SummaryCards';
import { TopActionsTable } from './components/TopActionsTable';
import { UserTimeline } from './components/UserTimeline';
import { fetchStats } from './utils/api';
import { StatsResponse } from './types';
import './index.css';

function App() {
  const [stats, setStats] = useState<StatsResponse | null>(null);
  const [loading, setLoading] = useState(true);

  // Check auth
  useEffect(() => {
    const token = localStorage.getItem('authToken');
    if (!token) {
      window.location.href = '/accounts/auth/login/';
      return;
    }
  }, []);

  // Load stats
  useEffect(() => {
    const loadStats = async () => {
      try {
        setLoading(true);
        const data = await fetchStats();
        setStats(data);
      } catch (err) {
        console.error('Failed to load stats:', err);
      } finally {
        setLoading(false);
      }
    };
    loadStats();
  }, []);

  return (
    <div className="app" style={{ maxWidth: '1200px', margin: '0 auto', padding: '24px' }}>
      <h1>User Journey Dashboard</h1>
      <p style={{ color: '#666', marginBottom: '24px' }}>
        Track admin user actions and engagement patterns.
      </p>

      <SummaryCards stats={stats} loading={loading} />
      <TopActionsTable stats={stats} loading={loading} />
      <UserTimeline />
    </div>
  );
}

export default App;
```

- [ ] **Step 2: Write journey_dashboard/src/index.css**

```css
* {
  box-sizing: border-box;
}

body {
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', 'Oxygen',
    'Ubuntu', 'Cantarell', 'Fira Sans', 'Droid Sans', 'Helvetica Neue',
    sans-serif;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
  background: #f5f5f5;
}

.app {
  background: white;
  border-radius: 8px;
  padding: 24px;
}

h1 {
  margin-top: 0;
  color: #202124;
}

h3 {
  color: #202124;
  margin-top: 0;
}

select, input {
  padding: 8px;
  border: 1px solid #ccc;
  border-radius: 4px;
  font-size: 14px;
}

select:focus, input:focus {
  outline: none;
  border-color: #1a73e8;
}

table {
  font-size: 14px;
}

table th {
  background: #f9f9f9;
  font-weight: 600;
}

table td {
  vertical-align: top;
}
```

- [ ] **Step 3: Write journey_dashboard/src/main.tsx**

```typescript
import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.tsx'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
```

- [ ] **Step 4: Create templates directory and write index.html**

```bash
mkdir -p journey_dashboard/templates/journey_dashboard
```

```html
<!-- journey_dashboard/templates/journey_dashboard/index.html -->
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <link rel="icon" type="image/svg+xml" href="/vite.svg" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Journey Dashboard - LeagueSphere</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/static/journey_dashboard/main.js"></script>
  </body>
</html>
```

- [ ] **Step 5: Commit**

```bash
git add journey_dashboard/src/App.tsx journey_dashboard/src/main.tsx journey_dashboard/src/index.css journey_dashboard/templates/
git commit -m "feat: create journey dashboard main app and template"
```

---

### Task 16: Create journey_dashboard Vite config

**Files:**
- Create: `journey_dashboard/package.json`
- Create: `journey_dashboard/vite.config.ts`
- Create: `journey_dashboard/tsconfig.json`

- [ ] **Step 1: Copy gameday_designer package.json and modify for journey_dashboard**

```bash
cp gameday_designer/package.json journey_dashboard/package.json
```

Then edit the following fields:

```json
{
  "name": "journey_dashboard",
  "version": "1.0.0"
}
```

- [ ] **Step 2: Create vite.config.ts**

```typescript
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
  plugins: [react()],
  build: {
    outDir: '../league_manager/static/journey_dashboard',
    emptyOutDir: true,
  },
  server: {
    proxy: {
      '/api': 'http://localhost:8000',
      '/accounts': 'http://localhost:8000',
    },
  },
})
```

- [ ] **Step 3: Copy tsconfig.json from gameday_designer**

```bash
cp gameday_designer/tsconfig.json journey_dashboard/
```

- [ ] **Step 4: Install dependencies**

```bash
cd journey_dashboard
npm install
cd ..
```

- [ ] **Step 5: Build the dashboard**

```bash
cd journey_dashboard
npm run build
cd ..
```

Expected: Built files appear in `league_manager/static/journey_dashboard/`

- [ ] **Step 6: Commit**

```bash
git add journey_dashboard/package.json journey_dashboard/vite.config.ts journey_dashboard/tsconfig.json
git commit -m "feat: add journey_dashboard Vite config and build setup"
```

---

### Task 17: Create TemplateView for serving dashboard

**Files:**
- Modify: `journey/views.py` (add TemplateView)
- Modify: `journey/urls.py` (add dashboard route)
- Modify: `league_manager/urls.py` (add /journeys/ route)

- [ ] **Step 1: Add JourneyDashboardView to journey/views.py**

Add this to the end of the file:

```python
from django.views.generic import TemplateView
from django.contrib.auth.mixins import LoginRequiredMixin

class JourneyDashboardView(LoginRequiredMixin, TemplateView):
    template_name = 'journey_dashboard/index.html'
    login_url = '/accounts/auth/login/'
```

- [ ] **Step 2: Update journey/urls.py to include the dashboard route**

Add this line to the top:

```python
from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import JourneyEventViewSet, JourneyViewSet, JourneyDashboardView
```

Add this to urlpatterns:

```python
urlpatterns = [
    path('', include(router.urls)),
    path('dashboard/', JourneyDashboardView.as_view(), name='dashboard'),
]
```

- [ ] **Step 3: Update league_manager/urls.py to route /journeys/ to dashboard**

Add this path to urlpatterns:

```python
path('journeys/', include('journey.urls')),
```

- [ ] **Step 4: Test that the view loads (don't test the rendered page yet)**

```bash
python manage.py check
```

Expected: `System check identified no issues (0 silenced).`

- [ ] **Step 5: Commit**

```bash
git add journey/views.py journey/urls.py league_manager/urls.py
git commit -m "feat: add dashboard TemplateView and routing"
```

---

### Task 18: Instrument gameday_designer with event tracking

**Files:**
- Create: `gameday_designer/src/trackEvent.ts` (copy from journey_dashboard)
- Modify: `gameday_designer/src/[key action files]` — add trackEvent calls

- [ ] **Step 1: Copy trackEvent utility to gameday_designer**

```bash
cp journey_dashboard/src/trackEvent.ts gameday_designer/src/
```

- [ ] **Step 2: Find where templates are applied in gameday_designer**

```bash
grep -r "apply\|submit" gameday_designer/src --include="*.tsx" | grep -i template
```

Look for components handling template application.

- [ ] **Step 3: Add trackEvent import and call to template apply handler**

In the component that handles template submission (typically a form or button handler), add:

```typescript
import { trackEvent } from './trackEvent';

// In the form submission handler:
const handleSubmit = async (data) => {
  // existing code...
  trackEvent('template_applied', { 
    template_id: data.templateId,
    // add other relevant metadata
  });
};
```

- [ ] **Step 4: Add trackEvent calls for other key actions in gameday_designer**

Look for:
- Saving/creating a gameday
- Publishing a schedule
- Deleting a template

And add trackEvent calls for each. Example:

```typescript
trackEvent('gameday_created', { gameday_id: response.id });
```

- [ ] **Step 5: Commit**

```bash
git add gameday_designer/src/trackEvent.ts gameday_designer/src/[modified files]
git commit -m "feat: instrument gameday_designer with event tracking"
```

---

### Task 19: Instrument passcheck with event tracking

**Files:**
- Create: `passcheck/src/trackEvent.ts`
- Modify: `passcheck/src/[key action files]`

- [ ] **Step 1: Copy trackEvent utility**

```bash
cp journey_dashboard/src/trackEvent.ts passcheck/src/
```

- [ ] **Step 2: Find key actions in passcheck (likely player list verification)**

```bash
grep -r "verify\|submit\|approve" passcheck/src --include="*.tsx"
```

- [ ] **Step 3: Add trackEvent calls**

Common actions to track:
- `trackEvent('playerlist_verified')`
- `trackEvent('player_checked_in')`
- `trackEvent('verification_submitted')`

- [ ] **Step 4: Commit**

```bash
git add passcheck/src/trackEvent.ts passcheck/src/[modified files]
git commit -m "feat: instrument passcheck with event tracking"
```

---

### Task 20: Instrument scorecard with event tracking

**Files:**
- Create: `scorecard/src/trackEvent.ts`
- Modify: `scorecard/src/[key action files]`

- [ ] **Step 1: Copy trackEvent utility**

```bash
cp journey_dashboard/src/trackEvent.ts scorecard/src/
```

- [ ] **Step 2: Find key actions in scorecard**

```bash
grep -r "score\|submit\|save" scorecard/src --include="*.tsx" | head -20
```

- [ ] **Step 3: Add trackEvent calls**

Common actions:
- `trackEvent('score_submitted', { game_id })`
- `trackEvent('possession_recorded')`
- `trackEvent('half_completed')`

- [ ] **Step 4: Commit**

```bash
git add scorecard/src/trackEvent.ts scorecard/src/[modified files]
git commit -m "feat: instrument scorecard with event tracking"
```

---

### Task 21: Write backend tests

**Files:**
- Create: `journey/tests.py`

- [ ] **Step 1: Write journey/tests.py with models and signals tests**

```python
from django.test import TestCase, Client
from django.contrib.auth.models import User
from django.utils import timezone
from datetime import timedelta
from rest_framework.test import APITestCase
from rest_framework_knox.models import AuthToken
from .models import Journey, JourneyEvent

class JourneyModelTests(TestCase):
    def setUp(self):
        self.user = User.objects.create_user(username='testuser', password='pass')

    def test_create_journey(self):
        journey = Journey.objects.create(user=self.user)
        self.assertEqual(journey.user, self.user)
        self.assertIsNone(journey.ended_at)

    def test_journey_event_creation(self):
        journey = Journey.objects.create(user=self.user)
        event = JourneyEvent.objects.create(
            journey=journey,
            event_name='test_event',
            metadata={'key': 'value'}
        )
        self.assertEqual(event.journey, journey)
        self.assertEqual(event.event_name, 'test_event')
        self.assertIn(event, journey.events.all())

class JourneyAPITests(APITestCase):
    def setUp(self):
        self.user = User.objects.create_user(username='testuser', password='pass')
        self.token = AuthToken.objects.create(self.user)[1]

    def test_create_event(self):
        journey = Journey.objects.create(user=self.user)
        self.client.credentials(HTTP_AUTHORIZATION=f'Token {self.token}')
        response = self.client.post('/api/journey/events/', {
            'event_name': 'test_action',
            'metadata': {'test': True}
        })
        self.assertEqual(response.status_code, 201)
        self.assertEqual(JourneyEvent.objects.count(), 1)

    def test_get_stats(self):
        journey = Journey.objects.create(user=self.user)
        JourneyEvent.objects.create(journey=journey, event_name='event1')
        JourneyEvent.objects.create(journey=journey, event_name='event1')
        JourneyEvent.objects.create(journey=journey, event_name='event2')

        self.client.credentials(HTTP_AUTHORIZATION=f'Token {self.token}')
        response = self.client.get('/api/journey/events/stats/')
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertEqual(data['total_events'], 3)

    def test_inactivity_boundary(self):
        """Test that a new journey is created after inactivity."""
        from django.test import override_settings
        
        with override_settings(JOURNEY_INACTIVITY_MINUTES=1):
            journey1 = Journey.objects.create(user=self.user)
            JourneyEvent.objects.create(
                journey=journey1,
                event_name='event1',
                created_at=timezone.now() - timedelta(minutes=2)
            )

            self.client.credentials(HTTP_AUTHORIZATION=f'Token {self.token}')
            response = self.client.post('/api/journey/events/', {
                'event_name': 'event2',
                'metadata': {}
            })

            self.assertEqual(response.status_code, 201)
            # A new journey should have been created
            self.assertEqual(Journey.objects.filter(user=self.user).count(), 2)
```

- [ ] **Step 2: Run tests**

```bash
python manage.py test journey
```

Expected: All tests pass

- [ ] **Step 3: Commit**

```bash
git add journey/tests.py
git commit -m "test: add journey model and API tests"
```

---

### Task 22: Manual integration test

**Files:**
- (No new files)

- [ ] **Step 1: Start Django dev server**

```bash
python manage.py runserver
```

- [ ] **Step 2: In another terminal, build the React dashboard**

```bash
cd journey_dashboard
npm run build
cd ..
```

- [ ] **Step 3: Log in to the app at http://localhost:8000/accounts/auth/login/**

Use credentials for a test user (or create one via Django admin)

- [ ] **Step 4: Go to gameday_designer and perform an action (e.g., apply a template)**

Verify that the `trackEvent` call happens (check browser console for any errors)

- [ ] **Step 5: Check that an event was recorded in the database**

```bash
python manage.py shell
```

```python
from journey.models import JourneyEvent
events = JourneyEvent.objects.all()
print(f"Total events: {events.count()}")
for e in events:
    print(f"  {e.event_name} @ {e.created_at}")
exit()
```

- [ ] **Step 6: Navigate to http://localhost:8000/journeys/dashboard/**

Verify that:
- Summary cards show the correct counts
- Top actions table shows the event you just tracked
- User timeline shows the journey and events

- [ ] **Step 7: No commit needed — this is a verification step**

---

### Task 23: Create PR via git-commit-manager

**Files:**
- (No new files — just git operations)

- [ ] **Step 1: Ensure all changes are committed**

```bash
git status
```

Expected: `working tree clean`

- [ ] **Step 2: Use git-commit-manager to create a PR**

Use the specialized agent to ensure proper commit message formatting and PR creation:

```
@agent-git-commit-manager

Create a PR for the user journey tracking feature. 

Summary of changes:
- New Django app `journey` with Journey and JourneyEvent models
- DRF ViewSets for event recording and stats aggregation
- Journey lifecycle management via Knox signals (login/logout and inactivity)
- New React dashboard app (journey_dashboard) showing aggregate stats and per-user timelines
- Event tracking utilities added to gameday_designer, passcheck, scorecard
- Comprehensive tests for models and API

All commits are already made. Please:
1. Verify the commits follow conventional commit format
2. Create a PR to main with a comprehensive description
3. Return the PR URL
```

- [ ] **Step 3: PR is created and ready for review**

---

## Verification Checklist

Before marking the feature complete:

- [ ] Django migrations run successfully: `python manage.py migrate journey`
- [ ] Backend tests pass: `python manage.py test journey`
- [ ] API endpoints respond correctly:
  - `POST /api/journey/events/` creates an event
  - `GET /api/journey/journeys/` lists journeys
  - `GET /api/journey/events/stats/` returns stats
- [ ] React dashboard builds: `cd journey_dashboard && npm run build`
- [ ] Dashboard loads at `/journeys/dashboard/` when authenticated
- [ ] Event tracking works from gameday_designer, passcheck, scorecard
- [ ] Journey boundaries are created on login/logout and after inactivity
- [ ] Django admin shows Journey and JourneyEvent models
- [ ] PR is created and passes CI checks
