# Game Progress Dashboard — Design Spec (Option A)

**Date**: 2026-05-10  
**Version**: 1.0  
**Status**: Design Specification  
**Component**: GameProgressDashboard (new)

---

## 1. Overview

Add a real-time **Game Progress Dashboard** as a dedicated page in the LeagueSphere app. This dashboard displays live game status, upcoming games, and recent completions for game days across all leagues and seasons.

**Key Features:**
- Live game counter with pulsing indicator
- Color-coded game day status (live, soon, today, recent, upcoming)
- Per-game progress visualization
- Next-scheduled game alert (even across multi-week gaps)
- Responsive layout (desktop, tablet, mobile)

---

## 2. URL & Routing Structure

### Frontend Routing (React)
```
/gamedays/progress/                    → GameProgressDashboard (index)
/gamedays/progress/filter              → GameProgressDashboard (with sidebar)
/gamedays/progress/gameday/:id          → GameProgressDetail (future: drill-down view)
```

### Backend URLs (Django)
```
/gamedays/progress/                    → New Django view serving React app
/api/gamedays/progress/                → New REST endpoint (Game Progress API)
```

### Menu Integration Point
**Location**: Orga menu (same as "Spieltag erstellen" and "Spieltag designen")  
**URL Name**: `gameday_designer_app:progress` (reverses to `/gamedays/progress/`)

---

## 3. Menu Integration Details

### Django Menu Configuration

**File**: `gameday_designer/menu.py`

```python
class Gameday_designerMenuOrgaEntry(BaseMenu):
    """Add Gameday Designer entries to the Orga menu."""
    
    def get_name(self):
        return GamedaysMenuAdmin.get_name()  # Returns 'Orga'
    
    def get_menu_items(self, request):
        if not request.user.is_staff:
            return []
        
        return [
            # NEW: Game Progress Dashboard
            MenuItem.create(
                name='<i class="bi bi-graph-up me-1"></i> Spieltag Live-Status',
                url="gameday_designer_app:progress",  # Reverses to /gamedays/progress/
            ),
            # EXISTING: Game Day Designer
            MenuItem.create(
                name='<span class="badge bg-warning text-dark me-1">BETA</span> Spieltag designen',
                url="gameday_designer_app:index",
            ),
        ]
```

**Menu Hierarchy:**
```
Orga (dropdown menu)
├─ Spieltag erstellen          (existing, from gamedays/menu.py)
├─ Spieltag Live-Status        (NEW: Game Progress Dashboard)
├─ Spieltag designen           (existing, from gameday_designer/menu.py)
└─ Backend                     (existing, from gamedays/menu.py)
```

---

## 4. Component Hierarchy

### React Component Tree

```
MainLayout
└─ AppHeader (unchanged)
└─ <main>
   └─ GameProgressDashboard (NEW ROUTE: /gamedays/progress/)
      ├─ ProgressHeroStrip
      │  ├─ LiveCount (animated)
      │  ├─ StatBoxes (live games, today, completed 24h)
      │  └─ DateInfo
      ├─ ProgressContainer (scrollable sections)
      │  ├─ Section: LIVE (if any)
      │  │  └─ ProgressGameDayCard (2-col grid)
      │  │     ├─ PulseDot
      │  │     ├─ SegmentBar (per-game progress)
      │  │     └─ Summary (5/14 played · 2 live)
      │  ├─ Section: SPÄTER HEUTE (if any)
      │  │  └─ ProgressGameRow (upcoming within 30min or today)
      │  │     ├─ Countdown (if kickoff ≤90 min)
      │  │     └─ GameDayInfo
      │  ├─ TwoColumnFooter
      │  │  ├─ OutlookColumn
      │  │  │  ├─ AUSBLICK (next 7 days)
      │  │  │  └─ NÄCHSTER TERMIN (next scheduled, even if weeks away)
      │  │  └─ ReviewColumn
      │  │     └─ RÜCKBLICK (last 24h)
      │  └─ EmptyState (if no gamedays)
      └─ NotificationToast (error/success notifications)
```

### File Structure

```
gameday_designer/src/
├─ components/
│  └─ progress/ (NEW DIRECTORY)
│     ├─ GameProgressDashboard.tsx          (main container)
│     ├─ sections/
│     │  ├─ ProgressHeroStrip.tsx           (live count + stats)
│     │  ├─ ProgressLiveSection.tsx         (live gamedays)
│     │  ├─ ProgressUpcomingSection.tsx     (soon/today)
│     │  ├─ ProgressOutlookSection.tsx      (next 7 days)
│     │  └─ ProgressReviewSection.tsx       (last 24h)
│     ├─ cards/
│     │  ├─ ProgressGameDayCard.tsx         (live card with segments)
│     │  ├─ ProgressGameRow.tsx             (upcoming/finished row)
│     │  ├─ ProgressSegmentBar.tsx          (per-game visual)
│     │  └─ PulseDot.tsx                    (animated indicator)
│     ├─ hooks/
│     │  └─ useGameProgress.ts              (data fetch + state)
│     ├─ __tests__/
│     │  ├─ GameProgressDashboard.test.tsx
│     │  └─ ...component tests
│     └─ styles.module.css                  (component styles)
├─ api/
│  └─ gameProgressApi.ts                    (new API service)
├─ types/
│  └─ progress.ts                           (new types for this feature)
```

---

## 5. Page Layout Wireframe

### Desktop View (1080px+)

```
┌─────────────────────────────────────────────┐
│ LeagueSphere Header                   [Orga▼]│  ← Existing
└─────────────────────────────────────────────┘
┌─────────────────────────────────────────────┐
│ ╔══ LIVE · 3 Spieltage                     ║
│ ║  56  │ 2 live · 8 im Spiel · 3 beendet  ║
│ ║ live │ (24h)      HEUTE: 3 Spieltage   ║
│ ║ 15:42│                                   ║
│ ╚══════════════════════════════════════════╝  ← Hero Strip (new)
├─────────────────────────────────────────────┤
│ ● LIVE · 3 Spieltage                       │
│ ┌──────────────────┬──────────────────┐    │
│ │ Düsseldorf      │ Cleve Conquerors │    │
│ │ NRW U16         │ NRW U16          │    │
│ │ ✓✓✓✓●●●●●●●●●   │ ✓✓✓✓✓●●●●●●●●  │    │  ← Live Cards
│ │ 5/14 · 2 live   │ 5/14 · 1 live    │    │
│ └──────────────────┴──────────────────┘    │
├─────────────────────────────────────────────┤
│ SPÄTER HEUTE · 2 Spieltage                  │
│ [23 min] Euskirchen Lions · NRW U10        │
│ [HEUTE] Berlin Tigers · U16 @ 18:00        │
├─────────────────────────────────────────────┤
│ AUSBLICK (7 TAGE) │ RÜCKBLICK (24h)       │
│ [HEUTE] Foo ·Bar  │ vor 2h Xyz · League  │
│ [MO]    Baz ·Qux  │ vor 5h Abc · League  │
│ [TUE]   Quux ·Cor │ (no entries if none)  │
│ ────────────────  │                       │
│ · Pause von 8T ·  │                       │
│ [NÄCHSTER TERMIN] │                       │
│ Stuttgart Skorpione│                       │
│ 17. Oktober       │                       │
│ 10 Spiele         │                       │
└─────────────────────────────────────────────┘
```

### Tablet View (640px–1079px)
- Same layout but single column for two-column footer
- Responsive card widths (full width instead of 2-col grid)

### Mobile View (<640px)
- Stacked sections
- Full-width cards
- Countdown displayed more prominently
- Hero stats collapsed to single line

---

## 6. Data Flow & State Management

### useGameProgress Hook

```typescript
interface ProgressState {
  loading: boolean;
  error: Error | null;
  gamedays: GamedayWithGames[];
  
  // Computed properties (derived from gamedays)
  live: GamedaySummary[];
  soon: GamedaySummary[];
  today: GamedaySummary[];
  recent: GamedaySummary[];
  upcomingWeek: GamedaySummary[];
  nextScheduled: GamedaySummary | null;
}

function useGameProgress(filters?: {
  dateFrom?: Date;
  dateTo?: Date;
  league?: number;
  status?: string;
}): ProgressState;
```

### Data Fetching Flow

```
GameProgressDashboard
  ↓
useGameProgress()
  ↓
gameProgressApi.listProgress(filters)
  ↓
GET /api/gamedays/progress/?date_from=...&date_to=...&league=...
  ↓
[Backend] GameProgressViewSet.list()
  ├─ Query: Gameday.objects.filter(date__gte=..., date__lte=...)
  ├─ Fetch: Gameinfo.objects.filter(gameday__in=gamedays)
  ├─ Fetch: Gameresult.objects.filter(gameinfo__in=gameinfos)
  ├─ Serialize: GameProgressSerializer (denormalized)
  └─ Return: [{ id, name, date, league, games: [...] }, ...]
  ↓
Compute derived state:
  ├─ live = gamedays where status === 'live' || 'paused'
  ├─ soon = gamedays where firstGameStart - now <= 30 min
  ├─ today = gamedays where today && status === 'upcoming'
  ├─ recent = gamedays where status === 'recent' (last game < 24h)
  ├─ upcomingWeek = gamedays where date in next 7 days
  └─ nextScheduled = first gameday beyond 7 days
  ↓
Return state to component
  ↓
Component renders sections based on state
```

---

## 7. API Contract

### New Endpoint: `GET /api/gamedays/progress/`

**Query Parameters:**
```
?date_from=2026-05-10         # ISO date, default: today - 1 day
?date_to=2026-05-17           # ISO date, default: today + 7 days
?league=1                      # Filter by league ID (optional)
?season=1                      # Filter by season ID (optional)
?status=PUBLISHED,IN_PROGRESS  # Comma-separated statuses (optional)
?page=1                        # Pagination (optional)
?page_size=50                  # Items per page (optional)
```

**Response Schema:**
```typescript
{
  count: number;
  next: string | null;
  previous: string | null;
  results: [
    {
      id: number;
      name: string;
      date: string;  // ISO date
      start: string; // HH:MM
      league: number;
      league_display: string;
      season: number;
      season_display: string;
      status: 'DRAFT' | 'PUBLISHED' | 'IN_PROGRESS' | 'COMPLETED';
      
      // Denormalized games
      games: [
        {
          id: number;
          scheduled: string;  // HH:MM
          status: 'Geplant' | 'Gestartet' | 'beendet';
          gameStarted: string | null;  // HH:MM
          gameFinished: string | null; // HH:MM
          field: number;
          stage: string;
          standing: string;
          
          // Game result (if available)
          home: {
            id: number;
            name: string;
          };
          away: {
            id: number;
            name: string;
          };
          result: {
            home_score: number | null;
            away_score: number | null;
          };
        }
      ];
      
      // Computed summary
      summary: {
        played: number;
        live: number;
        upcoming: number;
        firstStart: string;   // HH:MM of first game
        lastEnd: string;      // HH:MM of last game
      };
    }
  ]
}
```

### New API Service: `gameProgressApi.ts`

```typescript
export const gameProgressApi = {
  /**
   * List game days with progress status
   */
  listProgress: async (params?: {
    dateFrom?: Date;
    dateTo?: Date;
    league?: number;
    season?: number;
    status?: string[];
    page?: number;
    pageSize?: number;
  }): Promise<PaginatedResponse<GamedayProgress>> => {
    // Implementation
  },

  /**
   * Get a single gameday with all games and results
   */
  getGameday: async (id: number): Promise<GamedayProgress> => {
    // Implementation
  },
};
```

---

## 8. Route Configuration

### React Router (App.tsx)

```typescript
const App: React.FC = () => {
  return (
    <BrowserRouter basename={basename}>
      <GamedayProvider>
        <Routes>
          <Route path="/" element={<MainLayout />}>
            <Route index element={<GamedayDashboard />} />
            {/* NEW: Game Progress Dashboard */}
            <Route path="progress" element={<GameProgressDashboard />} />
            <Route path="designer/:id" element={<ListDesignerApp />} />
          </Route>
        </Routes>
      </GamedayProvider>
    </BrowserRouter>
  );
};
```

### Django URL (app_urls.py)

```python
# gameday_designer/app_urls.py
urlpatterns = [
    path("", index, name="index"),               # Existing
    path("progress/", index, name="progress"),   # NEW
    re_path(r"^.*/$", index),                    # Catch-all for React
]
```

---

## 9. Color Palette & Styling

### Design System Colors

```css
/* CSS Variables */
:root {
  --ls-header: #6b8290;
  --ls-header-ink: #ffffff;
  
  --ls-live: #16a34a;
  --ls-live-pulse: #22c55e;
  --ls-live-soft: #dcfce7;
  
  --ls-soon: #d97706;
  --ls-soon-soft: #fef3c7;
  
  --ls-blue: #1976d2;
  --ls-blue-soft: #e8f1fb;
  
  --ls-ink: #1a1a1a;
  --ls-ink-secondary: #3f4854;
  --ls-muted: #6b7280;
  --ls-faint: #9aa3af;
  
  --ls-line: #e5e7eb;
  --ls-line-soft: #f1f3f5;
  
  --ls-card: #ffffff;
  --ls-page-bg: #f6f7f8;
}
```

### Keyframe Animations

```css
@keyframes ls-pulse {
  0%   { transform: scale(0.85); opacity: 1; }
  70%  { transform: scale(1.6); opacity: 0; }
  100% { transform: scale(1.6); opacity: 0; }
}

@keyframes ls-pulse-bar {
  0%, 100% { opacity: 0.55; }
  50%      { opacity: 1; }
}
```

---

## 10. i18n Integration

### Translation Keys

Add to `gameday_designer/src/i18n/locales/`:

**de.json:**
```json
{
  "ui": {
    "progress": {
      "title": "Spieltag Live-Status",
      "subtitle": "Übersicht aller Spieltage: aktiv · kommend · archiv",
      
      "hero": {
        "live": "live",
        "games_in_play": "Spiele im Spiel",
        "games_today": "noch heute",
        "completed_24h": "beendet (24 h)",
        "today": "HEUTE",
        "scheduled": "Spieltage geplant"
      },
      
      "section": {
        "live": "LIVE",
        "later_today": "SPÄTER HEUTE",
        "outlook": "AUSBLICK",
        "outlook_subtitle": "NÄCHSTE 7 TAGE",
        "review": "RÜCKBLICK",
        "review_subtitle": "LETZTE 24 H",
        "next_scheduled": "NÄCHSTER TERMIN",
        "gap": "Pause von {days} Tagen"
      },
      
      "card": {
        "games": "Spiele",
        "played": "gespielt",
        "live": "live",
        "upcoming": "offen",
        "kickoff": "KICKOFF"
      },
      
      "empty": {
        "no_live": "Keine laufenden Spieltage",
        "no_upcoming": "Nichts in den nächsten 7 Tagen",
        "no_recent": "Keine Spieltage in den letzten 24 h"
      },
      
      "time": {
        "minutes": "min",
        "hours": "h",
        "days": "d ago"
      }
    }
  }
}
```

**en.json:**
```json
{
  "ui": {
    "progress": {
      "title": "Game Day Live Status",
      "subtitle": "Overview of all game days: live · upcoming · archive",
      
      "hero": {
        "live": "live",
        "games_in_play": "Games in play",
        "games_today": "today",
        "completed_24h": "finished (24h)",
        "today": "TODAY",
        "scheduled": "Game days scheduled"
      },
      // ... rest of English translations
    }
  }
}
```

---

## 11. Navigation & User Flows

### Primary Flow: View Live Games

```
User clicks "Spieltag Live-Status" in Orga menu
        ↓
Browser navigates to /gamedays/progress/
        ↓
Django view serves index.html with React app
        ↓
React app loads at /gamedays/progress
        ↓
GameProgressDashboard component mounts
        ↓
useGameProgress() fetches /api/gamedays/progress/
        ↓
Components render with live gamedays highlighted
        ↓
User sees hero strip with live count + stats
        ↓
User scrolls to see sections:
   - LIVE (cards with per-game segments)
   - SPÄTER HEUTE (upcoming rows)
   - AUSBLICK & RÜCKBLICK (footer columns)
```

### Secondary Flow: Drill-Down (Future)

```
User clicks a gameday card
        ↓
Navigate to /gamedays/progress/gameday/:id
        ↓
GameProgressDetail component mounts (NOT in V1)
        ↓
Show full game list with real-time updates
```

### Tertiary Flow: Filter Games

```
User clicks filter icon (future enhancement)
        ↓
Sidebar shows league/date range selectors
        ↓
User selects filters
        ↓
Hook re-fetches /api/gamedays/progress/?league=...&date_from=...
        ↓
UI updates to show filtered results
```

---

## 12. Loading & Error States

### Loading State

```
┌─────────────────────────────────┐
│ Hero Strip (skeleton)           │
├─────────────────────────────────┤
│ ⚪ ⚪ ⚪ ⚪  [Loading...]        │
│ ⚪ ⚪ ⚪ ⚪                        │
│ ⚪ ⚪ ⚪ ⚪                        │
└─────────────────────────────────┘
```

Implementation: Skeleton loaders for:
- Hero strip stats
- Game cards (2-col grid)
- Upcoming rows

### Error State

```
┌─────────────────────────────────┐
│ 🚨 Failed to load gamedays     │
│                                 │
│ [Retry] button                 │
│                                 │
│ Error details (if debug mode)  │
└─────────────────────────────────┘
```

Implementation: Error boundary component with retry logic

---

## 13. Performance Considerations

### Data Fetching Optimization

1. **Pagination**: Fetch 50 gamedays per page (configurable)
2. **Caching**: Cache results for 30 seconds (using React Query staleTime)
3. **Selective Refresh**: Only refresh if user navigates away and back
4. **Date Range**: Default to -1 day to +7 days (not unlimited history)

### Rendering Optimization

1. **Virtual Scrolling**: If 100+ game days, use windowed list
2. **Memoization**: Memoize section components to prevent re-renders
3. **CSS-in-JS**: Use CSS modules (not inline styles from design)

### Real-Time Updates (Future)

1. **Polling**: Fetch every 30 seconds if any games are live
2. **WebSocket** (optional): Replace polling with live updates
3. **Badge Refresh**: Update live count without full page refresh

---

## 14. Implementation Checklist

### Phase 1: Backend (Django)

- [ ] Create `GameProgressSerializer` with denormalized game data
- [ ] Create `GameProgressViewSet` API endpoint
- [ ] Add filtering: date range, league, season, status
- [ ] Optimize queries: `select_related()`, `prefetch_related()`
- [ ] Write tests for API endpoint
- [ ] Add to `gameday_designer/api/urls.py`

### Phase 2: Frontend Components (React)

- [ ] Create `GameProgressDashboard.tsx` main container
- [ ] Create `ProgressHeroStrip.tsx` with live count + stats
- [ ] Create `ProgressGameDayCard.tsx` with per-game segment bar
- [ ] Create `ProgressUpcomingRow.tsx` with countdown
- [ ] Create `ProgressFinishedRow.tsx` for recent games
- [ ] Create `useGameProgress()` hook for data fetching
- [ ] Create `gameProgressApi.ts` API service
- [ ] Create `progress.ts` types file

### Phase 3: Styling & CSS

- [ ] Create `styles.module.css` with all component styles
- [ ] Add CSS variables for color palette
- [ ] Add keyframe animations (pulse, pulse-bar)
- [ ] Test responsive breakpoints (mobile, tablet, desktop)
- [ ] Ensure Bootstrap integration (no conflicts)

### Phase 4: i18n & Localization

- [ ] Add German translations to `i18n/locales/de.json`
- [ ] Add English translations to `i18n/locales/en.json`
- [ ] Test translation strings in components
- [ ] Verify date/time formatting (locale-aware)

### Phase 5: Menu & Routing

- [ ] Update `gameday_designer/menu.py` to add menu item
- [ ] Update `gameday_designer/app_urls.py` for `/progress/` route
- [ ] Update `App.tsx` React routes
- [ ] Test menu click navigates to `/gamedays/progress/`

### Phase 6: Testing & QA

- [ ] Write unit tests for hooks (useGameProgress)
- [ ] Write component tests (GameProgressDashboard, cards, sections)
- [ ] Write integration tests (navigation, data fetching)
- [ ] Test error states (API failures, empty data)
- [ ] Test loading states (skeleton loaders)
- [ ] Test responsive design on mobile/tablet/desktop
- [ ] Test accessibility (ARIA labels, keyboard nav)
- [ ] Test i18n switching (de/en)
- [ ] Performance profiling (Core Web Vitals)

### Phase 7: Deployment & Monitoring

- [ ] Merge to main branch
- [ ] Deploy to staging environment
- [ ] Test against production database snapshot
- [ ] Monitor API performance (latency, errors)
- [ ] Set up error tracking (Sentry, etc.)
- [ ] Deploy to production

---

## 15. Future Enhancements (Out of Scope V1)

1. **Real-Time Updates**: WebSocket or Server-Sent Events
2. **Drill-Down View**: GameProgressDetail component for single gameday
3. **Filtering UI**: League/date range selector in sidebar
4. **Export**: Download results as CSV/PDF
5. **Notifications**: Browser notifications for "game started" events
6. **Mobile App**: Native iOS/Android version
7. **Custom Alerts**: User can set "notify me when game X starts"
8. **Live Commentary**: Integration with scoreboard/commentary feed
9. **Multi-Language**: Add French, Spanish, etc.
10. **Dark Mode**: System preference respects OS dark mode

---

## 16. Success Criteria

### Functional Requirements ✓

- [ ] Dashboard loads game days for next 7 days
- [ ] Live games section displays with green pulsing indicators
- [ ] Per-game segment bars show accurate status (played, live, upcoming)
- [ ] Countdown shows for kickoffs within 90 minutes
- [ ] "Next scheduled" row appears even if gap > 7 days
- [ ] Completed games appear in "last 24h" section
- [ ] All sections are responsive on mobile/tablet/desktop

### Performance Requirements ✓

- [ ] Page loads in < 2 seconds (CLS, LCP, FID all green)
- [ ] API responds in < 500ms
- [ ] No layout shifts (CLS < 0.1)
- [ ] Smooth animations at 60 FPS

### UX Requirements ✓

- [ ] Menu item is discoverable in Orga dropdown
- [ ] Hero strip draws eye with live count and pulsing dot
- [ ] Status colors match design (green, amber, blue, gray)
- [ ] All text is readable (contrast ratios > 4.5:1)
- [ ] Translations are complete (de/en)

---

## 17. File Structure Summary

```
gameday_designer/
├─ src/
│  ├─ components/
│  │  ├─ progress/                      (NEW)
│  │  │  ├─ GameProgressDashboard.tsx
│  │  │  ├─ sections/
│  │  │  │  ├─ ProgressHeroStrip.tsx
│  │  │  │  ├─ ProgressLiveSection.tsx
│  │  │  │  ├─ ProgressUpcomingSection.tsx
│  │  │  │  ├─ ProgressOutlookSection.tsx
│  │  │  │  └─ ProgressReviewSection.tsx
│  │  │  ├─ cards/
│  │  │  │  ├─ ProgressGameDayCard.tsx
│  │  │  │  ├─ ProgressGameRow.tsx
│  │  │  │  ├─ ProgressSegmentBar.tsx
│  │  │  │  └─ PulseDot.tsx
│  │  │  ├─ hooks/
│  │  │  │  └─ useGameProgress.ts
│  │  │  ├─ __tests__/
│  │  │  │  ├─ GameProgressDashboard.test.tsx
│  │  │  │  └─ ...
│  │  │  └─ styles.module.css
│  │  └─ (existing components)
│  ├─ api/
│  │  ├─ gameProgressApi.ts              (NEW)
│  │  └─ (existing services)
│  ├─ types/
│  │  ├─ progress.ts                     (NEW)
│  │  └─ (existing types)
│  ├─ i18n/
│  │  ├─ locales/
│  │  │  ├─ de.json (update with progress keys)
│  │  │  └─ en.json (update with progress keys)
│  │  └─ (existing i18n)
│  ├─ App.tsx                            (update routes)
│  └─ (existing files)
├─ public/
│  └─ index.html
├─ package.json                          (add dependencies if needed)
└─ (existing files)

gameday_designer/
├─ menu.py                               (update: add new menu item)
├─ app_urls.py                           (update: add /progress/ route)
├─ api/
│  ├─ views.py                           (NEW: GameProgressViewSet)
│  ├─ serializers.py                     (NEW: GameProgressSerializer)
│  └─ urls.py                            (update: register viewset)
└─ (existing files)
```

---

## 18. Django Backend Implementation Outline

### New ViewSet: `gameday_designer/api/views.py`

```python
from rest_framework import viewsets, filters
from rest_framework.pagination import PageNumberPagination
from django_filters.rest_framework import DjangoFilterBackend

class GameProgressPagination(PageNumberPagination):
    page_size = 50
    page_size_query_param = "page_size"
    max_page_size = 200

class GameProgressViewSet(viewsets.ReadOnlyModelViewSet):
    """
    API endpoint for game progress dashboard.
    
    Returns denormalized gamedays with games and results.
    Supports filtering by date range, league, season, status.
    """
    serializer_class = GameProgressSerializer
    pagination_class = GameProgressPagination
    filter_backends = [DjangoFilterBackend, filters.OrderingFilter]
    filterset_fields = ['league', 'season', 'status']
    ordering_fields = ['date']
    ordering = ['-date']
    permission_classes = [IsStaffUser]  # Only staff can view
    
    def get_queryset(self):
        """
        Filter gamedays by date range + optional league/season.
        Prefetch related games and results for performance.
        """
        from datetime import timedelta
        from django.utils import timezone
        
        queryset = Gameday.objects.all()
        
        # Date range filtering
        date_from = self.request.query_params.get('date_from')
        date_to = self.request.query_params.get('date_to')
        
        if not date_from:
            date_from = timezone.now().date() - timedelta(days=1)
        if not date_to:
            date_to = timezone.now().date() + timedelta(days=7)
        
        queryset = queryset.filter(date__gte=date_from, date__lte=date_to)
        
        # Optimize queries
        queryset = queryset.prefetch_related(
            'gameinfo_set',
            'gameinfo_set__gameresult'
        ).select_related('league', 'season')
        
        return queryset
```

### New Serializer: `gameday_designer/api/serializers.py`

```python
from rest_framework import serializers
from gamedays.models import Gameday, Gameinfo, Gameresult

class GameResultSerializer(serializers.ModelSerializer):
    class Meta:
        model = Gameresult
        fields = ['home_score', 'away_score', 'home', 'away']

class GameinfoProgressSerializer(serializers.ModelSerializer):
    result = GameResultSerializer(source='gameresult', read_only=True)
    
    class Meta:
        model = Gameinfo
        fields = [
            'id', 'scheduled', 'status', 'gameStarted', 'gameFinished',
            'field', 'stage', 'standing', 'result'
        ]

class GameProgressSerializer(serializers.ModelSerializer):
    games = GameinfoProgressSerializer(
        source='gameinfo_set',
        many=True,
        read_only=True
    )
    league_display = serializers.CharField(source='league.name', read_only=True)
    season_display = serializers.CharField(source='season.name', read_only=True)
    
    class Meta:
        model = Gameday
        fields = [
            'id', 'name', 'date', 'start', 'status',
            'league', 'league_display',
            'season', 'season_display',
            'games'
        ]
```

---

## 19. Summary

**Option A** integrates a new **Game Progress Dashboard** as a dedicated page accessible via the **Orga menu**. This provides:

✅ **Clear Navigation**: "Spieltag Live-Status" appears next to "Spieltag designen" in existing Orga dropdown  
✅ **Separate Concern**: Progress dashboard is independent from gameday designer tool  
✅ **Scalable Design**: Easy to add filters, real-time updates, drill-down views  
✅ **Staff-Only**: Inherits permission model from existing menu items  
✅ **Responsive**: Works on desktop, tablet, mobile  
✅ **Multilingual**: German & English translations baked in  

**Next Step**: Finalize API contract, then implement backend serializer + React components in parallel.
