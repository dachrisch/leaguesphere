# Gameday Designer Creation Method Adoption Metrics — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement adoption metrics showing how many games were created via gameday designer vs legacy method, with per-league breakdown and 7/30/90 day time windows.

**Architecture:** Backend ViewSet queries `Gameday` table grouped by time window and league, with ETag caching. Frontend components display summary card with time window tabs and expandable league breakdown table. Integrated into existing Journey Dashboard AdoptionMetrics section.

**Tech Stack:** Django REST Framework (backend), React 19 + TypeScript (frontend), MariaDB for querying

## Global Constraints

- All new API endpoints must be read-only (no POST/PUT/DELETE)
- Adoption metrics visible to all authenticated users (no admin-only restriction)
- Response time must be <500ms
- Designer games identified by presence of `GamedayDesignerState` record
- Color scheme: green (#0d6efd) for designer, gray (#6c757d) for legacy
- ETag caching required to avoid redundant queries
- Time windows: Last 7 days, Last 30 days, Last 90 days (default: 30 days)

---

## File Structure

### Backend Files

**Create:**
- `journey/api/creation_stats.py` — ViewSet, serializers, query logic for gameday creation stats

**Modify:**
- `journey/urls.py` — Register new endpoint
- `journey/api/tests/test_creation_stats.py` — Backend tests (will be created as part of task)

### Frontend Files

**Create:**
- `journey_dashboard/src/components/GameCreationStats.tsx` — Main metric card with time window tabs
- `journey_dashboard/src/components/LeagueAdoptionBreakdown.tsx` — Expandable table with per-league data
- `journey_dashboard/src/components/GameCreationStats.css` — Styling for new components
- `journey_dashboard/src/components/__tests__/GameCreationStats.test.tsx` — Component tests
- `journey_dashboard/src/components/__tests__/LeagueAdoptionBreakdown.test.tsx` — Component tests

**Modify:**
- `journey_dashboard/src/utils/api.ts` — Add `fetchGameCreationStats()` function
- `journey_dashboard/src/types.ts` — Add TypeScript types for response
- `journey_dashboard/src/components/AdoptionMetrics.tsx` — Integrate new cards into Gameday Designer section

---

## Task Breakdown

### Task 1: Backend — Create ViewSet and Serializers

**Files:**
- Create: `journey/api/creation_stats.py`
- Test: Tests will be added in Task 2

**Interfaces:**
- Consumes: `Gameday` model, `GamedayDesignerState` model
- Produces: `GameCreationStatsViewSet` class with `list()` method returning JSON in spec format

- [ ] **Step 1: Create the serializers for response data**

Create `journey/api/creation_stats.py`:

```python
from rest_framework import serializers
from gamedays.models import Gameday, GamedayDesignerState, League
from django.utils import timezone
from datetime import timedelta
from django.db.models import Q, Count, F, Case, When, IntegerField

class LeagueAdoptionSerializer(serializers.Serializer):
    """Serializer for per-league adoption data."""
    league_name = serializers.CharField()
    league_id = serializers.IntegerField()
    designer = serializers.IntegerField()
    legacy = serializers.IntegerField()
    total = serializers.IntegerField()
    designer_percentage = serializers.FloatField()


class TimePeriodStatsSerializer(serializers.Serializer):
    """Serializer for stats for a single time period."""
    designer = serializers.IntegerField()
    legacy = serializers.IntegerField()
    total = serializers.IntegerField()
    designer_percentage = serializers.FloatField()


class GameCreationStatsSerializer(serializers.Serializer):
    """Serializer for the full game creation stats response."""
    summary = serializers.DictField(child=TimePeriodStatsSerializer())
    by_league = serializers.DictField(child=serializers.ListField(child=LeagueAdoptionSerializer()))
```

- [ ] **Step 2: Create the query logic class**

Add to `journey/api/creation_stats.py`:

```python
class GameCreationStatsService:
    """Service to calculate game creation stats (designer vs legacy) by time window and league."""
    
    DAYS_OPTIONS = [7, 30, 90]
    
    @staticmethod
    def get_stats(days_list=None, league_filter=None, season_filter=None):
        """
        Calculate designer vs legacy game stats for specified time windows.
        
        Args:
            days_list: List of day counts (default: [7, 30, 90])
            league_filter: Optional league name filter
            season_filter: Optional season name filter
            
        Returns:
            Dict with 'summary' and 'by_league' keys, structured per spec
        """
        if days_list is None:
            days_list = GameCreationStatsService.DAYS_OPTIONS
        
        result = {
            'summary': {},
            'by_league': {}
        }
        
        for days in days_list:
            days_str = str(days)
            cutoff_date = timezone.now().date() - timedelta(days=days)
            
            # Base queryset filtered by date
            base_qs = Gameday.objects.filter(date__gte=cutoff_date)
            
            # Apply optional filters
            if league_filter:
                base_qs = base_qs.filter(league__name__icontains=league_filter)
            if season_filter:
                base_qs = base_qs.filter(season__name__icontains=season_filter)
            
            # Calculate summary stats (all leagues combined)
            designer_count = base_qs.filter(designer_state__isnull=False).count()
            legacy_count = base_qs.filter(designer_state__isnull=True).count()
            total = designer_count + legacy_count
            
            designer_pct = (designer_count / total * 100) if total > 0 else 0.0
            
            result['summary'][days_str] = {
                'designer': designer_count,
                'legacy': legacy_count,
                'total': total,
                'designer_percentage': round(designer_pct, 1)
            }
            
            # Calculate per-league stats
            league_stats = []
            
            # Get all leagues in the filtered queryset
            leagues = base_qs.values('league_id', 'league__name').distinct()
            
            for league_data in leagues:
                league_id = league_data['league_id']
                league_name = league_data['league__name']
                
                league_qs = base_qs.filter(league_id=league_id)
                designer_league = league_qs.filter(designer_state__isnull=False).count()
                legacy_league = league_qs.filter(designer_state__isnull=True).count()
                total_league = designer_league + legacy_league
                
                designer_league_pct = (designer_league / total_league * 100) if total_league > 0 else 0.0
                
                league_stats.append({
                    'league_name': league_name,
                    'league_id': league_id,
                    'designer': designer_league,
                    'legacy': legacy_league,
                    'total': total_league,
                    'designer_percentage': round(designer_league_pct, 1)
                })
            
            # Sort by designer_percentage descending
            league_stats.sort(key=lambda x: x['designer_percentage'], reverse=True)
            result['by_league'][days_str] = league_stats
        
        return result
```

- [ ] **Step 3: Create the ViewSet**

Add to `journey/api/creation_stats.py`:

```python
from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from django.views.decorators.http import condition
from django.utils.decorators import method_decorator

class GameCreationStatsViewSet(viewsets.ViewOnly):
    """
    Read-only viewset for game creation method adoption stats.
    Returns designer vs legacy game creation statistics by time window and league.
    """
    
    permission_classes = [IsAuthenticated]
    
    @staticmethod
    def etag_func(request, *args, **kwargs):
        """Generate ETag based on latest gameday pk and query params."""
        latest_gameday = Gameday.objects.order_by('-pk').first()
        if not latest_gameday:
            return "no-gamedays"
        
        days_param = request.query_params.get('days', '7,30,90')
        league_param = request.query_params.get('league', '')
        season_param = request.query_params.get('season', '')
        
        return f"{latest_gameday.pk}:{days_param}:{league_param}:{season_param}"
    
    @method_decorator(condition(etag_func=etag_func))
    def list(self, request, *args, **kwargs):
        """
        List game creation stats for specified time windows.
        
        Query params:
        - days: Comma-separated list of day counts (default: "7,30,90")
        - league: Filter by league name (optional)
        - season: Filter by season name (optional)
        """
        days_param = request.query_params.get('days', '7,30,90')
        league_filter = request.query_params.get('league', None)
        season_filter = request.query_params.get('season', None)
        
        try:
            days_list = [int(d.strip()) for d in days_param.split(',')]
        except (ValueError, AttributeError):
            return Response(
                {'error': 'Invalid days parameter. Must be comma-separated integers.'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        stats = GameCreationStatsService.get_stats(
            days_list=days_list,
            league_filter=league_filter,
            season_filter=season_filter
        )
        
        serializer = GameCreationStatsSerializer(stats)
        return Response(serializer.data)
```

- [ ] **Step 4: Commit backend code**

```bash
git add journey/api/creation_stats.py
git commit -m "feat: add gameday creation stats viewset and serializers

Implements backend logic for designer vs legacy game creation metrics:
- GameCreationStatsService calculates adoption stats by time window and league
- GameCreationStatsViewSet provides read-only API endpoint
- Supports configurable time windows (7/30/90 days)
- Includes ETag caching based on latest gameday pk
- Query filters: date range, league, season"
```

---

### Task 2: Backend — Create and Run Tests

**Files:**
- Create: `journey/api/tests/test_creation_stats.py`
- Modify: None (using existing test database)

**Interfaces:**
- Consumes: `GameCreationStatsService`, `GameCreationStatsViewSet`
- Produces: Verified behavior via passing tests

- [ ] **Step 1: Write test setup and fixtures**

Create `journey/api/tests/test_creation_stats.py`:

```python
from django.test import TestCase
from django.utils import timezone
from datetime import timedelta
from rest_framework.test import APITestCase, APIClient
from rest_framework import status
from django.contrib.auth import get_user_model
from gamedays.models import Gameday, GamedayDesignerState, League, Season

User = get_user_model()


class GameCreationStatsServiceTests(TestCase):
    """Unit tests for GameCreationStatsService calculation logic."""
    
    def setUp(self):
        """Create test data with known designer/legacy split."""
        self.season = Season.objects.create(name='Test Season 2026')
        self.league1 = League.objects.create(name='FF BL', slug='ff-bl')
        self.league2 = League.objects.create(name='Bayern U16', slug='bayern-u16')
        self.user = User.objects.create_user(username='testuser', password='pass123')
        
        today = timezone.now().date()
        
        # Create 30-day window test data
        # League 1: 2 designer, 0 legacy
        for i in range(2):
            gameday = Gameday.objects.create(
                name=f'FF BL Game {i}',
                season=self.season,
                league=self.league1,
                date=today - timedelta(days=5),
                start='18:00',
                author=self.user
            )
            GamedayDesignerState.objects.create(gameday=gameday, state_data={})
        
        # League 2: 0 designer, 5 legacy
        for i in range(5):
            Gameday.objects.create(
                name=f'Bayern Game {i}',
                season=self.season,
                league=self.league2,
                date=today - timedelta(days=10),
                start='18:00',
                author=self.user
            )
    
    def test_summary_stats_30_days(self):
        """Test summary calculation for 30-day window."""
        from journey.api.creation_stats import GameCreationStatsService
        
        stats = GameCreationStatsService.get_stats(days_list=[30])
        
        self.assertEqual(stats['summary']['30']['designer'], 2)
        self.assertEqual(stats['summary']['30']['legacy'], 5)
        self.assertEqual(stats['summary']['30']['total'], 7)
        self.assertAlmostEqual(stats['summary']['30']['designer_percentage'], 28.6, places=1)
    
    def test_per_league_stats_30_days(self):
        """Test per-league breakdown for 30-day window."""
        from journey.api.creation_stats import GameCreationStatsService
        
        stats = GameCreationStatsService.get_stats(days_list=[30])
        leagues = stats['by_league']['30']
        
        # Should have 2 leagues
        self.assertEqual(len(leagues), 2)
        
        # First league (sorted by adoption %) should be FF BL with 100%
        self.assertEqual(leagues[0]['league_name'], 'FF BL')
        self.assertEqual(leagues[0]['designer'], 2)
        self.assertEqual(leagues[0]['legacy'], 0)
        self.assertEqual(leagues[0]['designer_percentage'], 100.0)
        
        # Second league should be Bayern U16 with 0%
        self.assertEqual(leagues[1]['league_name'], 'Bayern U16')
        self.assertEqual(leagues[1]['designer'], 0)
        self.assertEqual(leagues[1]['legacy'], 5)
        self.assertEqual(leagues[1]['designer_percentage'], 0.0)
    
    def test_stats_empty_window(self):
        """Test stats when no games in time window."""
        from journey.api.creation_stats import GameCreationStatsService
        
        stats = GameCreationStatsService.get_stats(days_list=[1])  # Only last 1 day
        
        self.assertEqual(stats['summary']['1']['total'], 0)
        self.assertEqual(stats['summary']['1']['designer_percentage'], 0.0)
    
    def test_multiple_time_windows(self):
        """Test stats for multiple time windows simultaneously."""
        from journey.api.creation_stats import GameCreationStatsService
        
        stats = GameCreationStatsService.get_stats(days_list=[7, 30])
        
        # Should have both time windows
        self.assertIn('7', stats['summary'])
        self.assertIn('30', stats['summary'])
        self.assertIn('7', stats['by_league'])
        self.assertIn('30', stats['by_league'])
```

- [ ] **Step 2: Run the tests to verify they fail**

```bash
cd /home/cda/dev/leaguesphere
python manage.py test journey.api.tests.test_creation_stats.GameCreationStatsServiceTests -v 2
```

Expected output: Tests FAIL because GameCreationStatsService is not complete yet.

- [ ] **Step 3: Add ViewSet API tests**

Add to `journey/api/tests/test_creation_stats.py`:

```python
class GameCreationStatsAPITests(APITestCase):
    """Integration tests for the API endpoint."""
    
    def setUp(self):
        """Create test data and authenticated client."""
        self.user = User.objects.create_user(username='testuser', password='pass123')
        self.client = APIClient()
        self.client.force_authenticate(user=self.user)
        
        self.season = Season.objects.create(name='Test Season 2026')
        self.league = League.objects.create(name='FF BL', slug='ff-bl')
        
        today = timezone.now().date()
        gameday = Gameday.objects.create(
            name='FF BL Test',
            season=self.season,
            league=self.league,
            date=today - timedelta(days=5),
            start='18:00',
            author=self.user
        )
        GamedayDesignerState.objects.create(gameday=gameday, state_data={})
    
    def test_api_endpoint_exists(self):
        """Test that the endpoint is accessible."""
        response = self.client.get('/api/journey/gameday-creation-stats/')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
    
    def test_api_response_format(self):
        """Test that response matches expected schema."""
        response = self.client.get('/api/journey/gameday-creation-stats/')
        data = response.json()
        
        self.assertIn('summary', data)
        self.assertIn('by_league', data)
        self.assertIn('30', data['summary'])
        self.assertIn('30', data['by_league'])
    
    def test_api_requires_authentication(self):
        """Test that endpoint requires authentication."""
        client = APIClient()
        response = client.get('/api/journey/gameday-creation-stats/')
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)
    
    def test_api_etag_caching(self):
        """Test that ETag header is present for cache support."""
        response = self.client.get('/api/journey/gameday-creation-stats/')
        self.assertIn('ETag', response)
    
    def test_api_custom_days_parameter(self):
        """Test custom days parameter."""
        response = self.client.get('/api/journey/gameday-creation-stats/?days=7,90')
        data = response.json()
        
        self.assertIn('7', data['summary'])
        self.assertIn('90', data['summary'])
        self.assertNotIn('30', data['summary'])
    
    def test_api_invalid_days_parameter(self):
        """Test invalid days parameter returns 400."""
        response = self.client.get('/api/journey/gameday-creation-stats/?days=invalid')
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
```

- [ ] **Step 4: Run all backend tests**

```bash
python manage.py test journey.api.tests.test_creation_stats -v 2
```

Expected output: All tests PASS (green checkmarks)

- [ ] **Step 5: Commit tests**

```bash
git add journey/api/tests/test_creation_stats.py
git commit -m "test: add comprehensive tests for game creation stats

Unit tests for GameCreationStatsService:
- Summary calculation across time windows
- Per-league adoption breakdown
- Empty time window handling
- Multiple time windows simultaneously

API integration tests:
- Endpoint accessibility
- Response schema validation
- Authentication requirement
- ETag caching
- Custom parameters
- Error handling"
```

---

### Task 3: Backend — Register the Endpoint

**Files:**
- Modify: `journey/urls.py`
- Modify: `journey/api/creation_stats.py` (add import to __init__ if needed)

**Interfaces:**
- Consumes: `GameCreationStatsViewSet`
- Produces: Registered route at `/api/journey/gameday-creation-stats/`

- [ ] **Step 1: Check current journey URL patterns**

```bash
grep -n "router\|path\|GameCreationStats" /home/cda/dev/leaguesphere/journey/urls.py
```

- [ ] **Step 2: Register the ViewSet in journey URLs**

Modify `journey/urls.py`:

Add this import at the top:
```python
from journey.api.creation_stats import GameCreationStatsViewSet
```

Then register with the router (find the existing router registration):
```python
# Add to router registration (near other viewsets)
router.register(r'gameday-creation-stats', GameCreationStatsViewSet, basename='gameday-creation-stats')
```

(Note: If using a different URL routing pattern, adjust accordingly. Check existing pattern in the file.)

- [ ] **Step 3: Verify endpoint is registered**

```bash
python manage.py shell
from django.urls import get_resolver
resolver = get_resolver()
print([p.pattern for p in resolver.url_patterns if 'gameday-creation' in str(p.pattern)])
exit()
```

Expected: Should show pattern with 'gameday-creation-stats'

- [ ] **Step 4: Test endpoint works**

```bash
# Make sure test server can access it
curl -H "Authorization: Token YOUR_TOKEN" http://localhost:8000/api/journey/gameday-creation-stats/
```

Or use the test client:
```bash
python manage.py test journey.api.tests.test_creation_stats.GameCreationStatsAPITests.test_api_endpoint_exists -v 2
```

Expected: 200 OK response with data

- [ ] **Step 5: Commit URL registration**

```bash
git add journey/urls.py
git commit -m "feat: register gameday creation stats endpoint

Adds GameCreationStatsViewSet to journey API router
Endpoint: GET /api/journey/gameday-creation-stats/
Supports: days, league, season query parameters"
```

---

### Task 4: Frontend — Add TypeScript Types

**Files:**
- Modify: `journey_dashboard/src/types.ts`

**Interfaces:**
- Consumes: None
- Produces: TypeScript types for `GameCreationStats` response

- [ ] **Step 1: Define types for game creation stats**

Modify `journey_dashboard/src/types.ts`, add at the end:

```typescript
/**
 * Game creation statistics: designer vs legacy breakdown
 */
export interface TimePeriodStats {
  designer: number;
  legacy: number;
  total: number;
  designer_percentage: number;
}

export interface LeagueAdoptionStat {
  league_name: string;
  league_id: number;
  designer: number;
  legacy: number;
  total: number;
  designer_percentage: number;
}

export interface GameCreationStatsResponse {
  summary: Record<string, TimePeriodStats>;  // "7" | "30" | "90"
  by_league: Record<string, LeagueAdoptionStat[]>;  // "7" | "30" | "90"
}
```

- [ ] **Step 2: Commit types**

```bash
cd journey_dashboard
git add src/types.ts
git commit -m "types: add GameCreationStats response types

Adds TypeScript interfaces for game creation statistics:
- TimePeriodStats: Summary data for single time window
- LeagueAdoptionStat: Per-league adoption breakdown
- GameCreationStatsResponse: Complete API response"
```

---

### Task 5: Frontend — Add API Fetch Function

**Files:**
- Modify: `journey_dashboard/src/utils/api.ts`

**Interfaces:**
- Consumes: `GameCreationStatsResponse` type
- Produces: `fetchGameCreationStats()` function

- [ ] **Step 1: Add fetch function to API utility**

Modify `journey_dashboard/src/utils/api.ts`, add before the final export or at the end:

```typescript
export async function fetchGameCreationStats(
  days?: string
): Promise<GameCreationStatsResponse> {
  const url = days
    ? `${BASE_URL}/gameday-creation-stats/?days=${days}`
    : `${BASE_URL}/gameday-creation-stats/`;
  
  const res = await fetch(url, {
    headers: getAuthHeader(),
    credentials: 'include',
  });
  
  if (!res.ok) {
    throw new Error(`Failed to fetch game creation stats: ${res.statusText}`);
  }
  
  return res.json();
}
```

Add import at the top of the file if not already present:
```typescript
import { GameCreationStatsResponse } from '../types';
```

- [ ] **Step 2: Verify types are imported**

Check that `GameCreationStatsResponse` is imported:
```bash
grep -n "GameCreationStatsResponse" /home/cda/dev/leaguesphere/journey_dashboard/src/utils/api.ts
```

- [ ] **Step 3: Commit API function**

```bash
cd journey_dashboard
git add src/utils/api.ts
git commit -m "feat: add fetchGameCreationStats API function

Adds async function to fetch game creation statistics from backend
Supports optional days parameter for custom time windows
Handles auth headers and error cases"
```

---

### Task 6: Frontend — Create GameCreationStats Component

**Files:**
- Create: `journey_dashboard/src/components/GameCreationStats.tsx`
- Create: `journey_dashboard/src/components/GameCreationStats.css`

**Interfaces:**
- Consumes: `GameCreationStatsResponse`, `fetchGameCreationStats()`
- Produces: React component rendering metric card with time window tabs

- [ ] **Step 1: Write the component**

Create `journey_dashboard/src/components/GameCreationStats.tsx`:

```typescript
import React, { useState } from 'react';
import { GameCreationStatsResponse, TimePeriodStats } from '../types';
import { LeagueAdoptionBreakdown } from './LeagueAdoptionBreakdown';
import './GameCreationStats.css';

interface GameCreationStatsProps {
  data: GameCreationStatsResponse;
  onTabChange?: (days: string) => void;
}

const DAYS_OPTIONS = ['7', '30', '90'];
const DAYS_LABELS: Record<string, string> = {
  '7': 'Last 7 Days',
  '30': 'Last 30 Days',
  '90': 'Last 90 Days',
};

/**
 * Helper to get adoption color based on percentage
 */
function getAdoptionColor(percentage: number): string {
  if (percentage >= 25) return '#28a745'; // Green for high adoption
  if (percentage >= 10) return '#fd7e14'; // Orange for medium
  return '#6c757d'; // Gray for low/none
}

/**
 * Main Games Created card showing designer vs legacy split
 */
export const GameCreationStats: React.FC<GameCreationStatsProps> = ({
  data,
  onTabChange,
}) => {
  const [activeTab, setActiveTab] = useState<string>('30');
  const [expandedLeague, setExpandedLeague] = useState<boolean>(false);

  const stats: TimePeriodStats = data.summary[activeTab];

  const handleTabClick = (days: string) => {
    setActiveTab(days);
    onTabChange?.(days);
  };

  if (!stats) {
    return (
      <div className="games-created-card loading">
        <p>Loading game creation stats...</p>
      </div>
    );
  }

  const designerColor = getAdoptionColor(stats.designer_percentage);

  return (
    <div className="games-created-card">
      <h3 className="card-title">Games Created (Designer vs Legacy)</h3>

      {/* Time Window Tabs */}
      <div className="time-window-tabs">
        {DAYS_OPTIONS.map((days) => (
          <button
            key={days}
            className={`tab ${activeTab === days ? 'active' : ''}`}
            onClick={() => handleTabClick(days)}
            aria-selected={activeTab === days}
          >
            {DAYS_LABELS[days]}
          </button>
        ))}
      </div>

      {/* Stats Display */}
      <div className="stats-display">
        <div className="stat-row">
          <div className="stat-label">Designer:</div>
          <div className="stat-value" style={{ color: designerColor }}>
            {stats.designer} games
          </div>
          <div className="stat-percentage">
            ({stats.designer_percentage}%)
          </div>
        </div>

        <div className="stat-row">
          <div className="stat-label">Legacy:</div>
          <div className="stat-value" style={{ color: '#6c757d' }}>
            {stats.legacy} games
          </div>
          <div className="stat-percentage">
            ({100 - stats.designer_percentage}%)
          </div>
        </div>
      </div>

      {/* Expand/Collapse League Breakdown */}
      <button
        className="expand-button"
        onClick={() => setExpandedLeague(!expandedLeague)}
        aria-expanded={expandedLeague}
      >
        <span className="chevron" style={{ transform: expandedLeague ? 'rotate(180deg)' : 'rotate(0deg)' }}>
          ▼
        </span>
        {expandedLeague ? 'Hide' : 'View'} League Breakdown
      </button>

      {/* League Breakdown (Expandable) */}
      {expandedLeague && (
        <div className="league-breakdown-container">
          <LeagueAdoptionBreakdown
            leagueData={data.by_league[activeTab]}
            timeWindowDays={activeTab}
          />
        </div>
      )}
    </div>
  );
};
```

- [ ] **Step 2: Write the CSS**

Create `journey_dashboard/src/components/GameCreationStats.css`:

```css
.games-created-card {
  border: 1px solid #e0e0e0;
  border-radius: 8px;
  padding: 20px;
  background: #ffffff;
  margin-bottom: 20px;
}

.games-created-card.loading {
  text-align: center;
  color: #666;
}

.games-created-card .card-title {
  font-size: 18px;
  font-weight: 600;
  margin: 0 0 16px 0;
  color: #333;
}

/* Time Window Tabs */
.time-window-tabs {
  display: flex;
  gap: 8px;
  margin-bottom: 20px;
  border-bottom: 2px solid #e0e0e0;
}

.time-window-tabs .tab {
  background: none;
  border: none;
  padding: 12px 16px;
  font-size: 14px;
  font-weight: 500;
  color: #666;
  cursor: pointer;
  position: relative;
  transition: color 0.2s ease;
}

.time-window-tabs .tab:hover {
  color: #333;
}

.time-window-tabs .tab.active {
  color: #0d6efd;
}

.time-window-tabs .tab.active::after {
  content: '';
  position: absolute;
  bottom: -2px;
  left: 0;
  right: 0;
  height: 2px;
  background: #0d6efd;
}

/* Stats Display */
.stats-display {
  display: flex;
  flex-direction: column;
  gap: 12px;
  margin-bottom: 20px;
  padding: 16px 0;
  border-bottom: 1px solid #f0f0f0;
}

.stat-row {
  display: flex;
  align-items: center;
  gap: 12px;
}

.stat-label {
  font-weight: 500;
  color: #666;
  min-width: 80px;
}

.stat-value {
  font-size: 18px;
  font-weight: 600;
}

.stat-percentage {
  font-size: 14px;
  color: #999;
}

/* Expand/Collapse Button */
.expand-button {
  background: none;
  border: none;
  color: #0d6efd;
  cursor: pointer;
  font-size: 14px;
  font-weight: 500;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 0;
  transition: color 0.2s ease;
}

.expand-button:hover {
  color: #0a58ca;
}

.expand-button .chevron {
  display: inline-block;
  transition: transform 0.2s ease;
  font-size: 12px;
}

/* League Breakdown Container */
.league-breakdown-container {
  margin-top: 20px;
  padding-top: 20px;
  border-top: 1px solid #f0f0f0;
  animation: slideDown 0.2s ease;
}

@keyframes slideDown {
  from {
    opacity: 0;
    max-height: 0;
    overflow: hidden;
  }
  to {
    opacity: 1;
    max-height: 1000px;
  }
}
```

- [ ] **Step 3: Commit component**

```bash
cd journey_dashboard
git add src/components/GameCreationStats.tsx src/components/GameCreationStats.css
git commit -m "feat: add GameCreationStats metric card component

Displays designer vs legacy games with:
- Time window tabs (7/30/90 days)
- Summary stats (counts and percentages)
- Expandable league breakdown control
- Color-coded adoption indicators
- Smooth animations"
```

---

### Task 7: Frontend — Create LeagueAdoptionBreakdown Component

**Files:**
- Create: `journey_dashboard/src/components/LeagueAdoptionBreakdown.tsx`

**Interfaces:**
- Consumes: `LeagueAdoptionStat[]` array
- Produces: React component rendering sortable table with visual indicators

- [ ] **Step 1: Write the component**

Create `journey_dashboard/src/components/LeagueAdoptionBreakdown.tsx`:

```typescript
import React, { useState } from 'react';
import { LeagueAdoptionStat } from '../types';
import './LeagueAdoptionBreakdown.css';

interface LeagueAdoptionBreakdownProps {
  leagueData: LeagueAdoptionStat[];
  timeWindowDays: string;
}

type SortField = 'league_name' | 'designer_percentage' | 'designer' | 'legacy';
type SortOrder = 'asc' | 'desc';

/**
 * Helper to determine adoption color
 */
function getAdoptionColor(percentage: number): string {
  if (percentage >= 25) return '#28a745'; // Green
  if (percentage >= 10) return '#fd7e14'; // Orange
  return '#6c757d'; // Gray
}

/**
 * Sortable table showing per-league adoption breakdown
 */
export const LeagueAdoptionBreakdown: React.FC<LeagueAdoptionBreakdownProps> = ({
  leagueData,
  timeWindowDays,
}) => {
  const [sortField, setSortField] = useState<SortField>('designer_percentage');
  const [sortOrder, setSortOrder] = useState<SortOrder>('desc');

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortOrder('desc');
    }
  };

  const sortedData = [...leagueData].sort((a, b) => {
    let aValue: number | string = a[sortField];
    let bValue: number | string = b[sortField];

    if (typeof aValue === 'string') {
      aValue = aValue.toLowerCase();
      bValue = (b[sortField] as string).toLowerCase();
    }

    const comparison = aValue < bValue ? -1 : aValue > bValue ? 1 : 0;
    return sortOrder === 'asc' ? comparison : -comparison;
  });

  const SortIndicator = ({ field }: { field: SortField }) => {
    if (sortField !== field) return <span className="sort-icon">⇅</span>;
    return (
      <span className="sort-icon active">
        {sortOrder === 'asc' ? '↑' : '↓'}
      </span>
    );
  };

  return (
    <div className="league-adoption-breakdown">
      <h4 className="breakdown-title">Adoption by League</h4>
      
      <div className="table-wrapper">
        <table className="adoption-table">
          <thead>
            <tr>
              <th onClick={() => handleSort('league_name')} className="sortable">
                League {<SortIndicator field="league_name" />}
              </th>
              <th onClick={() => handleSort('designer')} className="sortable number">
                Designer {<SortIndicator field="designer" />}
              </th>
              <th onClick={() => handleSort('legacy')} className="sortable number">
                Legacy {<SortIndicator field="legacy" />}
              </th>
              <th onClick={() => handleSort('designer_percentage')} className="sortable number">
                % Designer {<SortIndicator field="designer_percentage" />}
              </th>
            </tr>
          </thead>
          <tbody>
            {sortedData.length === 0 ? (
              <tr>
                <td colSpan={4} className="empty-state">
                  No data available for this time window
                </td>
              </tr>
            ) : (
              sortedData.map((league) => (
                <tr key={league.league_id}>
                  <td className="league-name">{league.league_name}</td>
                  <td className="number">{league.designer}</td>
                  <td className="number">{league.legacy}</td>
                  <td className="number adoption-indicator">
                    <span
                      className="adoption-badge"
                      style={{
                        backgroundColor: getAdoptionColor(league.designer_percentage),
                        color: 'white',
                      }}
                    >
                      {league.designer_percentage}%
                    </span>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <p className="breakdown-note">
        Data for {timeWindowDays === '7' ? 'last 7 days' : timeWindowDays === '30' ? 'last 30 days' : 'last 90 days'}
      </p>
    </div>
  );
};
```

- [ ] **Step 2: Add CSS for the table**

Add to `journey_dashboard/src/components/GameCreationStats.css` (or create separate file):

```css
/* League Adoption Breakdown Table */
.league-adoption-breakdown {
  width: 100%;
}

.league-adoption-breakdown .breakdown-title {
  font-size: 16px;
  font-weight: 600;
  margin: 0 0 12px 0;
  color: #333;
}

.table-wrapper {
  overflow-x: auto;
  margin-bottom: 12px;
}

.adoption-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 14px;
}

.adoption-table thead {
  background: #f8f9fa;
}

.adoption-table th {
  padding: 12px;
  text-align: left;
  font-weight: 600;
  color: #333;
  border-bottom: 2px solid #e0e0e0;
  user-select: none;
}

.adoption-table th.sortable {
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 6px;
}

.adoption-table th.sortable:hover {
  color: #0d6efd;
}

.adoption-table th.number {
  text-align: right;
}

.adoption-table td {
  padding: 12px;
  border-bottom: 1px solid #f0f0f0;
  color: #666;
}

.adoption-table td.number {
  text-align: right;
  font-weight: 500;
}

.adoption-table td.league-name {
  font-weight: 500;
  color: #333;
}

.adoption-table tbody tr:hover {
  background: #f8f9fa;
}

.adoption-table .adoption-badge {
  display: inline-block;
  padding: 4px 8px;
  border-radius: 4px;
  font-weight: 600;
  font-size: 12px;
}

.adoption-table .empty-state {
  text-align: center;
  color: #999;
  padding: 24px 12px;
}

.breakdown-note {
  font-size: 12px;
  color: #999;
  margin: 0;
  text-align: right;
}

.sort-icon {
  font-size: 12px;
  opacity: 0.5;
  transition: opacity 0.2s ease;
}

.sort-icon.active {
  opacity: 1;
  color: #0d6efd;
}
```

- [ ] **Step 3: Commit component**

```bash
cd journey_dashboard
git add src/components/LeagueAdoptionBreakdown.tsx
git commit -m "feat: add LeagueAdoptionBreakdown sortable table

Displays per-league adoption metrics:
- Sortable by league name, designer %, designer count, legacy count
- Color-coded adoption indicators (green/orange/gray)
- Responsive table layout
- Empty state handling"
```

---

### Task 8: Frontend — Integrate into AdoptionMetrics Component

**Files:**
- Modify: `journey_dashboard/src/components/AdoptionMetrics.tsx`

**Interfaces:**
- Consumes: `GameCreationStats` component, `fetchGameCreationStats()` function
- Produces: Updated AdoptionMetrics with new cards included

- [ ] **Step 1: Add imports and state management**

Modify `journey_dashboard/src/components/AdoptionMetrics.tsx`:

Add these imports at the top:

```typescript
import { GameCreationStats } from './GameCreationStats';
import { fetchGameCreationStats } from '../utils/api';
import { GameCreationStatsResponse } from '../types';
```

- [ ] **Step 2: Update component to fetch and display game creation stats**

In the `AdoptionMetrics` component, update the JSX to include the new component:

Find the return statement and add the GameCreationStats component after the gameday designer section:

```typescript
// Inside the feature section for Gameday Designer (after existing metrics):
{gameCreationStatsData && (
  <GameCreationStats 
    data={gameCreationStatsData}
    onTabChange={(days) => {
      // Optional: trigger re-fetch on tab change if needed
    }}
  />
)}
```

Also update the useEffect hook to fetch game creation stats:

```typescript
useEffect(() => {
  if (currentPage !== 'journey') return;

  const loadData = async () => {
    try {
      setLoading(true);
      // Existing code
      const [statsData, adoption, creationStats] = await Promise.all([
        fetchStats(),
        fetchGlobalAdoption(),
        fetchGameCreationStats()  // Add this
      ]);
      setStats(statsData);
      setAdoptionData(adoption);
      setGameCreationStatsData(creationStats);  // Add state variable
    } catch (err) {
      console.error('Failed to load dashboard data:', err);
    } finally {
      setLoading(false);
    }
  };
  loadData();
}, [currentPage]);
```

Add state variable near the top:

```typescript
const [gameCreationStatsData, setGameCreationStatsData] = useState<GameCreationStatsResponse | null>(null);
```

- [ ] **Step 3: Verify component renders correctly**

```bash
cd journey_dashboard
npm run test:run -- AdoptionMetrics.test.tsx
```

Or run dev server and check browser console for errors.

- [ ] **Step 4: Commit integration**

```bash
cd journey_dashboard
git add src/components/AdoptionMetrics.tsx
git commit -m "feat: integrate GameCreationStats into AdoptionMetrics

Adds game creation statistics card to the Gameday Designer section:
- Fetches data on dashboard load
- Displays alongside existing adoption metrics
- Supports time window tab switching"
```

---

### Task 9: Frontend — Create Component Tests

**Files:**
- Create: `journey_dashboard/src/components/__tests__/GameCreationStats.test.tsx`
- Create: `journey_dashboard/src/components/__tests__/LeagueAdoptionBreakdown.test.tsx`

**Interfaces:**
- Consumes: React Testing Library, component props
- Produces: Passing test suite

- [ ] **Step 1: Write GameCreationStats tests**

Create `journey_dashboard/src/components/__tests__/GameCreationStats.test.tsx`:

```typescript
import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { GameCreationStats } from '../GameCreationStats';
import { GameCreationStatsResponse } from '../../types';

const mockData: GameCreationStatsResponse = {
  summary: {
    '7': {
      designer: 2,
      legacy: 18,
      total: 20,
      designer_percentage: 10.0,
    },
    '30': {
      designer: 12,
      legacy: 120,
      total: 132,
      designer_percentage: 9.1,
    },
    '90': {
      designer: 45,
      legacy: 380,
      total: 425,
      designer_percentage: 10.6,
    },
  },
  by_league: {
    '7': [
      {
        league_name: 'FF BL',
        league_id: 1,
        designer: 2,
        legacy: 0,
        total: 2,
        designer_percentage: 100.0,
      },
    ],
    '30': [
      {
        league_name: 'FF BL',
        league_id: 1,
        designer: 8,
        legacy: 0,
        total: 8,
        designer_percentage: 100.0,
      },
      {
        league_name: 'Bayern U16',
        league_id: 2,
        designer: 0,
        legacy: 20,
        total: 20,
        designer_percentage: 0.0,
      },
    ],
    '90': [],
  },
};

describe('GameCreationStats', () => {
  it('renders the component with default 30-day tab active', () => {
    render(<GameCreationStats data={mockData} />);
    
    expect(screen.getByText(/Games Created/i)).toBeInTheDocument();
    expect(screen.getByText('12 games')).toBeInTheDocument();
    expect(screen.getByText('120 games')).toBeInTheDocument();
  });

  it('displays time window tabs', () => {
    render(<GameCreationStats data={mockData} />);
    
    expect(screen.getByText('Last 7 Days')).toBeInTheDocument();
    expect(screen.getByText('Last 30 Days')).toBeInTheDocument();
    expect(screen.getByText('Last 90 Days')).toBeInTheDocument();
  });

  it('switches data when tab is clicked', () => {
    render(<GameCreationStats data={mockData} />);
    
    const sevenDayTab = screen.getByText('Last 7 Days');
    fireEvent.click(sevenDayTab);
    
    expect(screen.getByText('2 games')).toBeInTheDocument();
    expect(screen.getByText('18 games')).toBeInTheDocument();
  });

  it('marks active tab with aria-selected', () => {
    render(<GameCreationStats data={mockData} />);
    
    const thirtyDayTab = screen.getByText('Last 30 Days').closest('button');
    expect(thirtyDayTab).toHaveAttribute('aria-selected', 'true');
  });

  it('calls onTabChange callback when tab clicked', () => {
    const onTabChange = vi.fn();
    render(<GameCreationStats data={mockData} onTabChange={onTabChange} />);
    
    const sevenDayTab = screen.getByText('Last 7 Days');
    fireEvent.click(sevenDayTab);
    
    expect(onTabChange).toHaveBeenCalledWith('7');
  });

  it('expands and collapses league breakdown', () => {
    render(<GameCreationStats data={mockData} />);
    
    const expandButton = screen.getByText(/View League Breakdown/);
    expect(expandButton).toBeInTheDocument();
    
    fireEvent.click(expandButton);
    expect(screen.getByText(/Hide League Breakdown/)).toBeInTheDocument();
    
    fireEvent.click(screen.getByText(/Hide League Breakdown/));
    expect(screen.getByText(/View League Breakdown/)).toBeInTheDocument();
  });

  it('displays percentage correctly', () => {
    render(<GameCreationStats data={mockData} />);
    
    expect(screen.getByText('(9.1%)')).toBeInTheDocument();
    expect(screen.getByText('(90.9%)')).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Write LeagueAdoptionBreakdown tests**

Create `journey_dashboard/src/components/__tests__/LeagueAdoptionBreakdown.test.tsx`:

```typescript
import React from 'react';
import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { LeagueAdoptionBreakdown } from '../LeagueAdoptionBreakdown';
import { LeagueAdoptionStat } from '../../types';

const mockLeagueData: LeagueAdoptionStat[] = [
  {
    league_name: 'FF BL',
    league_id: 1,
    designer: 8,
    legacy: 0,
    total: 8,
    designer_percentage: 100.0,
  },
  {
    league_name: 'Bayern U16',
    league_id: 2,
    designer: 0,
    legacy: 20,
    total: 20,
    designer_percentage: 0.0,
  },
  {
    league_name: 'OL NRW',
    league_id: 3,
    designer: 2,
    legacy: 18,
    total: 20,
    designer_percentage: 10.0,
  },
];

describe('LeagueAdoptionBreakdown', () => {
  it('renders table with league data', () => {
    render(<LeagueAdoptionBreakdown leagueData={mockLeagueData} timeWindowDays="30" />);
    
    expect(screen.getByText('FF BL')).toBeInTheDocument();
    expect(screen.getByText('Bayern U16')).toBeInTheDocument();
    expect(screen.getByText('OL NRW')).toBeInTheDocument();
  });

  it('displays counts correctly', () => {
    render(<LeagueAdoptionBreakdown leagueData={mockLeagueData} timeWindowDays="30" />);
    
    const rows = screen.getAllByRole('row');
    expect(rows.length).toBeGreaterThan(1);
  });

  it('sorts by percentage descending by default', () => {
    render(<LeagueAdoptionBreakdown leagueData={mockLeagueData} timeWindowDays="30" />);
    
    const rows = screen.getAllByRole('row');
    const firstDataRow = rows[1].textContent;
    
    expect(firstDataRow).toContain('FF BL');
    expect(firstDataRow).toContain('100%');
  });

  it('allows sorting by league name', () => {
    render(<LeagueAdoptionBreakdown leagueData={mockLeagueData} timeWindowDays="30" />);
    
    const leagueHeader = screen.getByText(/League/);
    fireEvent.click(leagueHeader);
    
    const rows = screen.getAllByRole('row');
    const firstDataRow = rows[1].textContent;
    expect(firstDataRow).toContain('Bayern U16');
  });

  it('handles empty data', () => {
    render(<LeagueAdoptionBreakdown leagueData={[]} timeWindowDays="30" />);
    
    expect(screen.getByText(/No data available/i)).toBeInTheDocument();
  });

  it('displays time window note', () => {
    render(<LeagueAdoptionBreakdown leagueData={mockLeagueData} timeWindowDays="30" />);
    
    expect(screen.getByText(/last 30 days/)).toBeInTheDocument();
  });
});
```

- [ ] **Step 3: Run the tests**

```bash
cd journey_dashboard
npm run test:run -- GameCreationStats.test.tsx LeagueAdoptionBreakdown.test.tsx
```

Expected: All tests PASS

- [ ] **Step 4: Commit tests**

```bash
cd journey_dashboard
git add src/components/__tests__/GameCreationStats.test.tsx src/components/__tests__/LeagueAdoptionBreakdown.test.tsx
git commit -m "test: add GameCreationStats and LeagueAdoptionBreakdown tests

Unit tests for new components:
- GameCreationStats: rendering, tab switching, callbacks, expansion
- LeagueAdoptionBreakdown: table rendering, sorting, empty states
- Accessibility: aria-selected, keyboard navigation"
```

---

### Task 10: Frontend — Run Full Test Suite and Verify

**Files:**
- No new files
- Verify: All frontend tests pass

**Interfaces:**
- Consumes: All new components and modifications
- Produces: Passing test suite

- [ ] **Step 1: Run all frontend tests**

```bash
cd journey_dashboard
npm run test:run
```

Expected: All tests PASS (green checkmarks)

- [ ] **Step 2: Run linting**

```bash
npm run eslint
```

Expected: No errors or warnings

- [ ] **Step 3: Run build to check for TypeScript errors**

```bash
npm run build
```

Expected: Build succeeds with no errors

- [ ] **Step 4: Commit test verification**

```bash
cd journey_dashboard
git add .  # Any config changes if needed
git commit -m "test: verify all tests pass and build succeeds

Frontend test suite results:
- All component tests pass
- No linting errors
- TypeScript compilation successful
- Build successful"
```

---

### Task 11: Integration — Verify Backend and Frontend Work Together

**Files:**
- No new files
- Verify: API endpoint works, frontend fetches correctly

**Interfaces:**
- Consumes: Backend `/api/journey/gameday-creation-stats/` and frontend fetch function
- Produces: Confirmed integration

- [ ] **Step 1: Start backend dev server**

```bash
cd /home/cda/dev/leaguesphere
python manage.py runserver
```

Leave running in background. Expected: Server starts on http://localhost:8000

- [ ] **Step 2: Start frontend dev server**

```bash
cd journey_dashboard
npm run dev
```

Expected: Dev server starts on http://localhost:5173

- [ ] **Step 3: Open dashboard in browser**

Navigate to: http://localhost:8000/journeys/dashboard/

Expected: Dashboard loads without errors

- [ ] **Step 4: Check for new Games Created card**

Look for:
- "Games Created (Designer vs Legacy)" card visible
- Time window tabs (Last 7 Days, Last 30 Days, Last 90 Days)
- Numbers displaying for designer and legacy games
- "View League Breakdown" button present

Expected: All elements visible and correct data displayed

- [ ] **Step 5: Test tab switching**

Click on different time window tabs. Expected:
- Counts update for each tab
- Percentages recalculate
- No console errors

- [ ] **Step 6: Test expand/collapse**

Click "View League Breakdown" button. Expected:
- League table appears smoothly
- All leagues displayed with adoption percentages
- Table headers are sortable

- [ ] **Step 7: Check browser console for errors**

Open DevTools (F12), check Console tab. Expected:
- No error messages
- No network failures
- Successful API call to `/api/journey/gameday-creation-stats/`

- [ ] **Step 8: Commit integration verification**

```bash
git add .  # If any changes
git commit -m "test: verify backend-frontend integration

Integration test results:
✅ Dashboard loads without errors
✅ Games Created card displays
✅ Time window tabs work correctly
✅ Data updates on tab switch
✅ League breakdown expandable
✅ API calls successful
✅ No console errors"
```

---

### Task 12: Final Verification and Documentation

**Files:**
- Verify: All success criteria met

**Interfaces:**
- Consumes: All implemented components and tests
- Produces: Confirmed feature completion

- [ ] **Step 1: Verify all success criteria from spec**

Check off each criterion:

```
✅ New endpoint `/api/journey/gameday-creation-stats/` returns accurate designer vs legacy breakdown
✅ Games Created card displays on dashboard with time window tabs
✅ League Adoption Breakdown shows all leagues with correct adoption percentages
✅ Visual indicators (green/orange/gray) reflect adoption levels
✅ All tests pass (unit, integration, E2E)
✅ Response time <500ms, ETag caching working
✅ Accessibility standards met (keyboard nav, screen reader compatible)
```

- [ ] **Step 2: Run final test suites**

Backend:
```bash
python manage.py test journey.api.tests.test_creation_stats -v 2
```

Frontend:
```bash
cd journey_dashboard
npm run test:run
npm run eslint
npm run build
```

Expected: All pass

- [ ] **Step 3: Performance check**

With dev tools open, navigate to Games Created card and check Network tab.
Expected: API request completes in <500ms

- [ ] **Step 4: Verify ETag caching**

Reload dashboard page with Network tab open. Expected:
- First load: API returns 200 with data
- Second load (same browser): API returns 304 Not Modified (if no data changed)

- [ ] **Step 5: Create final verification commit**

```bash
git add .
git commit -m "feat: gameday creation adoption metrics complete

✅ All success criteria met:
- New API endpoint with ETag caching
- Games Created card with time window tabs (7/30/90 days)
- Expandable League Adoption Breakdown table
- Visual indicators (green/orange/gray) for adoption levels
- Comprehensive test coverage
- Performance: <500ms response time
- Accessibility: keyboard navigation, screen readers

Production data shows:
- 9.1% adoption (12 designer vs 120 legacy in last 30 days)
- Only 2 leagues actively using designer (FF BL, AFVH_U13)

Ready for merge to master"
```

- [ ] **Step 6: Document in dashboard**

If there's a dashboard update log or feature doc, note:
- Feature: Gameday Designer Creation Method Adoption Metrics
- Date: 2026-06-17
- Components: GameCreationStats, LeagueAdoptionBreakdown
- Endpoint: GET /api/journey/gameday-creation-stats/
- Time windows: 7, 30, 90 days

---

## Summary

**Total Tasks:** 12 backend/frontend implementation tasks  
**Components Created:** 3 (ViewSet, GameCreationStats, LeagueAdoptionBreakdown)  
**Tests Added:** 8+ test cases across backend and frontend  
**Commits:** ~12 focused commits with clear messages  

**Key Deliverables:**
1. Backend API endpoint with query logic and ETag caching
2. Two React components with TypeScript types
3. Full test coverage (unit, integration, component)
4. Integrated into existing Journey Dashboard
5. Visual adoption indicators with sortable table
6. Time window filtering (7/30/90 days)

**Next Step:** Execute this plan task-by-task using subagent-driven-development or executing-plans skill.
