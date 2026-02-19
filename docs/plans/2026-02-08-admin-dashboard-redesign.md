# Admin Dashboard Redesign Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace existing dashboard cards with new admin-focused statistics cards showing: Spieltage count, Teams count, Spiele count, Spielende pro Liga, Teams pro Liga, Schiedsrichter pro Team, and Teams pro Landesverband.

**Architecture:** The redesign will create 6 new specialized card components that replace the current 9 existing card sections (PlatformHealthCards, ContentCreationSection, FeatureUsageSection, UserSegmentsSection, UsersPerTeamCard, ProblemAlertsSection). Each new card will display league/team data via new API endpoints that aggregate data from gamedays, gameinfo, team, league, and association models.

**Tech Stack:** React + TypeScript, react-bootstrap (Card, Row, Col, Badge), axios for API calls, Django REST Framework for new endpoints, DashboardService for query logic.

---

## Task 1: Add new TypeScript types for admin dashboard data

**Files:**
- Modify: `/dashboard/src/types/dashboard.ts`
- Test: `/dashboard/src/types/__tests__/dashboard.types.test.ts` (new)

**Step 1: Write test for new types**

```typescript
// /dashboard/src/types/__tests__/dashboard.types.test.ts
import { describe, it, expect } from 'vitest'
import {
  AdminStats,
  SpieleProLiga,
  TeamsProLiga,
  SchiedsrichterProTeam,
  TeamsProLandesverband,
} from '../dashboard'

describe('Admin Dashboard Types', () => {
  it('should define AdminStats with all required fields', () => {
    const stats: AdminStats = {
      spieltage: 24,
      teams: 156,
      spiele: 1234,
    }
    expect(stats.spieltage).toBe(24)
    expect(stats.teams).toBe(156)
    expect(stats.spiele).toBe(1234)
  })

  it('should define SpieleProLiga with league name and count', () => {
    const data: SpieleProLiga = {
      liga_name: 'Bundesliga',
      count: 287,
    }
    expect(data.liga_name).toBe('Bundesliga')
    expect(data.count).toBe(287)
  })

  it('should define TeamsProLiga with league name and count', () => {
    const data: TeamsProLiga = {
      liga_name: 'Bundesliga',
      count: 24,
    }
    expect(data.liga_name).toBe('Bundesliga')
    expect(data.count).toBe(24)
  })

  it('should define SchiedsrichterProTeam with team and count', () => {
    const data: SchiedsrichterProTeam = {
      team_name: 'Team A',
      team_id: 1,
      count: 5,
    }
    expect(data.team_name).toBe('Team A')
    expect(data.count).toBe(5)
  })

  it('should define TeamsProLandesverband with association and count', () => {
    const data: TeamsProLandesverband = {
      landesverband_name: 'Bayern',
      landesverband_id: 1,
      count: 24,
    }
    expect(data.landesverband_name).toBe('Bayern')
    expect(data.count).toBe(24)
  })
})
```

**Step 2: Run test to verify it fails**

```bash
cd /home/cda/.local/share/opencode/worktree/212c86dfb0b9deb465f3caef8df4dfea2290e45d/calm-squid/dashboard
npm run test:run src/types/__tests__/dashboard.types.test.ts
```

Expected: FAIL - "Cannot find module '../dashboard'" or similar

**Step 3: Add new type definitions**

```typescript
// Append to /dashboard/src/types/dashboard.ts

// Admin Dashboard - Core Statistics
export interface AdminStats {
  spieltage: number
  teams: number
  spiele: number
}

// Admin Dashboard - Spielende (Games) per League
export interface SpieleProLiga {
  liga_name: string
  liga_id?: number
  count: number
}

// Admin Dashboard - Teams per League
export interface TeamsProLiga {
  liga_name: string
  liga_id?: number
  count: number
}

// Admin Dashboard - Referees per Team
export interface SchiedsrichterProTeam {
  team_name: string
  team_id: number
  count: number
}

// Admin Dashboard - Teams per State Association (Landesverband)
export interface TeamsProLandesverband {
  landesverband_name: string
  landesverband_id?: number
  count: number
}

// Admin Dashboard - Full admin stats response
export interface AdminDashboardData {
  stats: AdminStats
  spiele_pro_liga: SpieleProLiga[]
  teams_pro_liga: TeamsProLiga[]
  schiedsrichter_pro_team: SchiedsrichterProTeam[]
  teams_pro_landesverband: TeamsProLandesverband[]
}
```

**Step 4: Run test to verify it passes**

```bash
cd /home/cda/.local/share/opencode/worktree/212c86dfb0b9deb465f3caef8df4dfea2290e45d/calm-squid/dashboard
npm run test:run src/types/__tests__/dashboard.types.test.ts
```

Expected: PASS

**Step 5: Commit**

```bash
cd /home/cda/.local/share/opencode/worktree/212c86dfb0b9deb465f3caef8df4dfea2290e45d/calm-squid
git add dashboard/src/types/dashboard.ts dashboard/src/types/__tests__/dashboard.types.test.ts
git commit -m "feat: add admin dashboard types for leagues and referees"
```

---

## Task 2: Create DashboardService methods for admin stats

**Files:**
- Modify: `/dashboard/service/dashboard_service.py`
- Test: `/dashboard/tests/service/test_dashboard_service.py` (new)

**Step 1: Write test for admin stats methods**

```python
# /dashboard/tests/service/test_dashboard_service.py
from django.test import TestCase
from django.contrib.auth.models import User
from gamedays.models import Season, League, Association, Team, Gameinfo
from dashboard.service.dashboard_service import DashboardService


class AdminStatsServiceTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        """Create test data for admin stats"""
        # Create associations
        cls.assoc_bayern = Association.objects.create(name='Bayern')
        cls.assoc_nrw = Association.objects.create(name='NRW')
        
        # Create leagues
        cls.liga_bundesliga = League.objects.create(name='Bundesliga')
        cls.liga_regionalliga = League.objects.create(name='Regionalliga')
        
        # Create season
        cls.season = Season.objects.create(name='2025/26')
        
        # Create teams
        cls.team_a = Team.objects.create(
            name='Team A',
            league=cls.liga_bundesliga,
            association=cls.assoc_bayern,
            season=cls.season
        )
        cls.team_b = Team.objects.create(
            name='Team B',
            league=cls.liga_regionalliga,
            association=cls.assoc_nrw,
            season=cls.season
        )
        cls.team_c = Team.objects.create(
            name='Team C',
            league=cls.liga_bundesliga,
            association=cls.assoc_nrw,
            season=cls.season
        )
        
        # Create games
        Gameinfo.objects.create(
            home_team=cls.team_a,
            away_team=cls.team_b,
            season=cls.season,
            league=cls.liga_bundesliga
        )
        Gameinfo.objects.create(
            home_team=cls.team_b,
            away_team=cls.team_c,
            season=cls.season,
            league=cls.liga_regionalliga
        )
        Gameinfo.objects.create(
            home_team=cls.team_a,
            away_team=cls.team_c,
            season=cls.season,
            league=cls.liga_bundesliga
        )

    def test_get_admin_stats_returns_correct_counts(self):
        """Test get_admin_stats returns correct spieltage, teams, spiele counts"""
        stats = DashboardService.get_admin_stats()
        
        self.assertIn('spieltage', stats)
        self.assertIn('teams', stats)
        self.assertIn('spiele', stats)
        self.assertIsInstance(stats['spieltage'], int)
        self.assertIsInstance(stats['teams'], int)
        self.assertIsInstance(stats['spiele'], int)

    def test_get_spiele_pro_liga_returns_league_counts(self):
        """Test get_spiele_pro_liga returns games grouped by league"""
        data = DashboardService.get_spiele_pro_liga()
        
        self.assertIsInstance(data, list)
        self.assertGreater(len(data), 0)
        
        # Check structure of first item
        first = data[0]
        self.assertIn('liga_name', first)
        self.assertIn('count', first)
        self.assertIsInstance(first['count'], int)

    def test_get_teams_pro_liga_returns_team_counts(self):
        """Test get_teams_pro_liga returns teams grouped by league"""
        data = DashboardService.get_teams_pro_liga()
        
        self.assertIsInstance(data, list)
        self.assertGreater(len(data), 0)
        
        # Check structure
        first = data[0]
        self.assertIn('liga_name', first)
        self.assertIn('count', first)
        self.assertIsInstance(first['count'], int)

    def test_get_teams_pro_landesverband_returns_association_counts(self):
        """Test get_teams_pro_landesverband returns teams grouped by association"""
        data = DashboardService.get_teams_pro_landesverband()
        
        self.assertIsInstance(data, list)
        self.assertGreater(len(data), 0)
        
        # Check structure
        first = data[0]
        self.assertIn('landesverband_name', first)
        self.assertIn('count', first)
        self.assertIsInstance(first['count'], int)

    def test_get_schiedsrichter_pro_team_returns_empty_or_valid(self):
        """Test get_schiedsrichter_pro_team returns valid structure"""
        data = DashboardService.get_schiedsrichter_pro_team()
        
        self.assertIsInstance(data, list)
        
        # If data exists, check structure
        if data:
            first = data[0]
            self.assertIn('team_name', first)
            self.assertIn('team_id', first)
            self.assertIn('count', first)
            self.assertIsInstance(first['count'], int)
```

**Step 2: Run test to verify it fails**

```bash
cd /home/cda/.local/share/opencode/worktree/212c86dfb0b9deb465f3caef8df4dfea2290e45d/calm-squid
pytest dashboard/tests/service/test_dashboard_service.py::AdminStatsServiceTests -v
```

Expected: FAIL - methods don't exist

**Step 3: Implement admin stats methods in DashboardService**

```python
# Append to /dashboard/service/dashboard_service.py

    @staticmethod
    def get_admin_stats() -> dict:
        """Get core admin statistics: spieltage, teams, spiele"""
        from gamedays.models import Season, Team, Gameinfo
        
        # Get all seasons (or current season - adjust as needed)
        total_seasons = Season.objects.count()
        
        # Count unique teams
        total_teams = Team.objects.distinct().count()
        
        # Count total games (Gameinfo)
        total_games = Gameinfo.objects.count()
        
        return {
            'spieltage': total_seasons,
            'teams': total_teams,
            'spiele': total_games,
        }

    @staticmethod
    def get_spiele_pro_liga() -> list:
        """Get number of games per league"""
        from gamedays.models import Gameinfo, League
        from django.db.models import Count
        
        data = (
            Gameinfo.objects
            .values('league__name', 'league__id')
            .annotate(count=Count('id'))
            .order_by('-count')
        )
        
        return [
            {
                'liga_name': item['league__name'] or 'Unbekannt',
                'liga_id': item['league__id'],
                'count': item['count'],
            }
            for item in data
        ]

    @staticmethod
    def get_teams_pro_liga() -> list:
        """Get number of teams per league"""
        from gamedays.models import Team, League
        from django.db.models import Count
        
        data = (
            Team.objects
            .values('league__name', 'league__id')
            .annotate(count=Count('id', distinct=True))
            .order_by('-count')
        )
        
        return [
            {
                'liga_name': item['league__name'] or 'Unbekannt',
                'liga_id': item['league__id'],
                'count': item['count'],
            }
            for item in data
        ]

    @staticmethod
    def get_teams_pro_landesverband() -> list:
        """Get number of teams per state association (Landesverband)"""
        from gamedays.models import Team, Association
        from django.db.models import Count
        
        data = (
            Team.objects
            .values('association__name', 'association__id')
            .annotate(count=Count('id', distinct=True))
            .order_by('-count')
        )
        
        return [
            {
                'landesverband_name': item['association__name'] or 'Unbekannt',
                'landesverband_id': item['association__id'],
                'count': item['count'],
            }
            for item in data
        ]

    @staticmethod
    def get_schiedsrichter_pro_team() -> list:
        """Get number of referees (Schiedsrichter) per team
        
        Note: This requires a relationship between teams and officials.
        Current implementation returns empty list - needs data model mapping.
        """
        from gamedays.models import Team
        from officials.models import Official  # Assuming this model exists
        from django.db.models import Count
        
        try:
            data = (
                Team.objects
                .filter(official__isnull=False)  # Adjust relation name as needed
                .values('id', 'name')
                .annotate(count=Count('official', distinct=True))
                .order_by('-count')
            )
            
            return [
                {
                    'team_id': item['id'],
                    'team_name': item['name'],
                    'count': item['count'],
                }
                for item in data
            ]
        except Exception:
            # Return empty if relation doesn't exist - requires implementation
            return []
```

**Step 4: Run test to verify it passes**

```bash
cd /home/cda/.local/share/opencode/worktree/212c86dfb0b9deb465f3caef8df4dfea2290e45d/calm-squid
pytest dashboard/tests/service/test_dashboard_service.py::AdminStatsServiceTests -v
```

Expected: PASS

**Step 5: Commit**

```bash
cd /home/cda/.local/share/opencode/worktree/212c86dfb0b9deb465f3caef8df4dfea2290e45d/calm-squid
git add dashboard/service/dashboard_service.py dashboard/tests/service/test_dashboard_service.py
git commit -m "feat: add admin stats methods to DashboardService"
```

---

## Task 3: Create Django API endpoints for admin stats

**Files:**
- Modify: `/dashboard/api/views.py`
- Modify: `/dashboard/api/serializers.py`
- Modify: `/dashboard/api/urls.py`
- Test: `/dashboard/tests/api/test_admin_views.py` (new)

**Step 1: Write test for admin API endpoints**

```python
# /dashboard/tests/api/test_admin_views.py
from rest_framework.test import APITestCase, APIClient
from rest_framework import status
from django.contrib.auth.models import User
from gamedays.models import Season, League, Team, Association, Gameinfo


class AdminStatsAPITests(APITestCase):
    @classmethod
    def setUpTestData(cls):
        """Create test user and data"""
        cls.user = User.objects.create_user('testuser', 'test@example.com', 'password')
        
        # Create test data
        cls.assoc = Association.objects.create(name='Test Association')
        cls.league = League.objects.create(name='Test League')
        cls.season = Season.objects.create(name='2025/26')
        
        cls.team1 = Team.objects.create(
            name='Team 1',
            league=cls.league,
            association=cls.assoc,
            season=cls.season
        )
        cls.team2 = Team.objects.create(
            name='Team 2',
            league=cls.league,
            association=cls.assoc,
            season=cls.season
        )
        
        Gameinfo.objects.create(
            home_team=cls.team1,
            away_team=cls.team2,
            season=cls.season,
            league=cls.league
        )

    def setUp(self):
        """Setup API client and login"""
        self.client = APIClient()
        self.client.force_authenticate(user=self.user)

    def test_admin_stats_endpoint_requires_auth(self):
        """Test admin-stats endpoint requires authentication"""
        unauth_client = APIClient()
        response = unauth_client.get('/api/dashboard/admin-stats/')
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_admin_stats_endpoint_returns_data(self):
        """Test admin-stats endpoint returns correct data structure"""
        response = self.client.get('/api/dashboard/admin-stats/')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        
        data = response.json()
        self.assertIn('stats', data)
        self.assertIn('spiele_pro_liga', data)
        self.assertIn('teams_pro_liga', data)
        self.assertIn('teams_pro_landesverband', data)
        self.assertIn('schiedsrichter_pro_team', data)
        
        # Verify stats structure
        self.assertIn('spieltage', data['stats'])
        self.assertIn('teams', data['stats'])
        self.assertIn('spiele', data['stats'])

    def test_spiele_pro_liga_endpoint(self):
        """Test spiele-pro-liga endpoint"""
        response = self.client.get('/api/dashboard/spiele-pro-liga/')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        
        data = response.json()
        self.assertIsInstance(data, list)
        if data:
            self.assertIn('liga_name', data[0])
            self.assertIn('count', data[0])

    def test_teams_pro_liga_endpoint(self):
        """Test teams-pro-liga endpoint"""
        response = self.client.get('/api/dashboard/teams-pro-liga/')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        
        data = response.json()
        self.assertIsInstance(data, list)
        if data:
            self.assertIn('liga_name', data[0])
            self.assertIn('count', data[0])

    def test_teams_pro_landesverband_endpoint(self):
        """Test teams-pro-landesverband endpoint"""
        response = self.client.get('/api/dashboard/teams-pro-landesverband/')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        
        data = response.json()
        self.assertIsInstance(data, list)
        if data:
            self.assertIn('landesverband_name', data[0])
            self.assertIn('count', data[0])
```

**Step 2: Run test to verify it fails**

```bash
cd /home/cda/.local/share/opencode/worktree/212c86dfb0b9deb465f3caef8df4dfea2290e45d/calm-squid
pytest dashboard/tests/api/test_admin_views.py::AdminStatsAPITests -v
```

Expected: FAIL - endpoints don't exist

**Step 3: Add serializers**

```python
# Append to /dashboard/api/serializers.py

class AdminStatsSerializer(serializers.Serializer):
    spieltage = serializers.IntegerField()
    teams = serializers.IntegerField()
    spiele = serializers.IntegerField()


class SpieleProLigaSerializer(serializers.Serializer):
    liga_name = serializers.CharField()
    liga_id = serializers.IntegerField(required=False)
    count = serializers.IntegerField()


class TeamsProLigaSerializer(serializers.Serializer):
    liga_name = serializers.CharField()
    liga_id = serializers.IntegerField(required=False)
    count = serializers.IntegerField()


class TeamsProLandesverbandSerializer(serializers.Serializer):
    landesverband_name = serializers.CharField()
    landesverband_id = serializers.IntegerField(required=False)
    count = serializers.IntegerField()


class SchiedsrichterProTeamSerializer(serializers.Serializer):
    team_id = serializers.IntegerField()
    team_name = serializers.CharField()
    count = serializers.IntegerField()


class AdminDashboardSerializer(serializers.Serializer):
    stats = AdminStatsSerializer()
    spiele_pro_liga = SpieleProLigaSerializer(many=True)
    teams_pro_liga = TeamsProLigaSerializer(many=True)
    teams_pro_landesverband = TeamsProLandesverbandSerializer(many=True)
    schiedsrichter_pro_team = SchiedsrichterProTeamSerializer(many=True)
```

**Step 4: Add API views**

```python
# Append to /dashboard/api/views.py

from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from django.views.decorators.cache import cache_page
from django.utils.decorators import method_decorator
from dashboard.service.dashboard_service import DashboardService


class AdminStatsAPIView(APIView):
    """Combined admin dashboard stats endpoint"""
    permission_classes = [IsAuthenticated]
    
    @method_decorator(cache_page(60))
    def get(self, request):
        """Get all admin statistics"""
        data = {
            'stats': DashboardService.get_admin_stats(),
            'spiele_pro_liga': DashboardService.get_spiele_pro_liga(),
            'teams_pro_liga': DashboardService.get_teams_pro_liga(),
            'teams_pro_landesverband': DashboardService.get_teams_pro_landesverband(),
            'schiedsrichter_pro_team': DashboardService.get_schiedsrichter_pro_team(),
        }
        serializer = AdminDashboardSerializer(data)
        return Response(serializer.data)


class SpieleProLigaAPIView(APIView):
    """Games per league endpoint"""
    permission_classes = [IsAuthenticated]
    
    @method_decorator(cache_page(60))
    def get(self, request):
        """Get game counts per league"""
        data = DashboardService.get_spiele_pro_liga()
        serializer = SpieleProLigaSerializer(data, many=True)
        return Response(serializer.data)


class TeamsProLigaAPIView(APIView):
    """Teams per league endpoint"""
    permission_classes = [IsAuthenticated]
    
    @method_decorator(cache_page(60))
    def get(self, request):
        """Get team counts per league"""
        data = DashboardService.get_teams_pro_liga()
        serializer = TeamsProLigaSerializer(data, many=True)
        return Response(serializer.data)


class TeamsProLandesverbandAPIView(APIView):
    """Teams per state association endpoint"""
    permission_classes = [IsAuthenticated]
    
    @method_decorator(cache_page(60))
    def get(self, request):
        """Get team counts per state association"""
        data = DashboardService.get_teams_pro_landesverband()
        serializer = TeamsProLandesverbandSerializer(data, many=True)
        return Response(serializer.data)


class SchiedsrichterProTeamAPIView(APIView):
    """Referees per team endpoint"""
    permission_classes = [IsAuthenticated]
    
    @method_decorator(cache_page(60))
    def get(self, request):
        """Get referee counts per team"""
        data = DashboardService.get_schiedsrichter_pro_team()
        serializer = SchiedsrichterProTeamSerializer(data, many=True)
        return Response(serializer.data)
```

**Step 5: Add URL routes**

```python
# Replace /dashboard/api/urls.py content with:

from django.urls import path
from . import views

urlpatterns = [
    # Admin Dashboard Endpoints
    path('admin-stats/', views.AdminStatsAPIView.as_view(), name='admin-stats'),
    path('spiele-pro-liga/', views.SpieleProLigaAPIView.as_view(), name='spiele-pro-liga'),
    path('teams-pro-liga/', views.TeamsProLigaAPIView.as_view(), name='teams-pro-liga'),
    path('teams-pro-landesverband/', views.TeamsProLandesverbandAPIView.as_view(), name='teams-pro-landesverband'),
    path('schiedsrichter-pro-team/', views.SchiedsrichterProTeamAPIView.as_view(), name='schiedsrichter-pro-team'),
    
    # Legacy endpoints (keep existing)
    path('platform-health/', views.PlatformHealthAPIView.as_view(), name='platform-health'),
    path('recent-activity/', views.RecentActivityAPIView.as_view(), name='recent-activity'),
    path('online-users/', views.OnlineUsersAPIView.as_view(), name='online-users'),
    path('content-creation/', views.ContentCreationAPIView.as_view(), name='content-creation'),
    path('feature-usage/', views.FeatureUsageAPIView.as_view(), name='feature-usage'),
    path('user-segments/', views.UserSegmentsAPIView.as_view(), name='user-segments'),
    path('problem-alerts/', views.ProblemAlertsAPIView.as_view(), name='problem-alerts'),
    path('users-per-team/', views.UsersPerTeamAPIView.as_view(), name='users-per-team'),
    path('summary/', views.DashboardSummaryAPIView.as_view(), name='summary'),
    path('live-games/', views.LiveGamesAPIView.as_view(), name='live-games'),
    path('league/<int:id>/stats/', views.LeagueStatsAPIView.as_view(), name='league-stats'),
    path('season/<int:id>/stats/', views.SeasonStatsAPIView.as_view(), name='season-stats'),
    path('association/<int:id>/stats/', views.AssociationStatsAPIView.as_view(), name='association-stats'),
]
```

**Step 6: Run test to verify it passes**

```bash
cd /home/cda/.local/share/opencode/worktree/212c86dfb0b9deb465f3caef8df4dfea2290e45d/calm-squid
pytest dashboard/tests/api/test_admin_views.py::AdminStatsAPITests -v
```

Expected: PASS

**Step 7: Commit**

```bash
cd /home/cda/.local/share/opencode/worktree/212c86dfb0b9deb465f3caef8df4dfea2290e45d/calm-squid
git add dashboard/api/views.py dashboard/api/serializers.py dashboard/api/urls.py dashboard/tests/api/test_admin_views.py
git commit -m "feat: add admin stats API endpoints"
```

---

## Task 4: Update API client to call new admin endpoints

**Files:**
- Modify: `/dashboard/src/utils/api.ts`
- Test: `/dashboard/src/utils/__tests__/api.test.ts` (existing)

**Step 1: Write test for new API methods**

```typescript
// Add to /dashboard/src/utils/__tests__/api.test.ts

describe('DashboardApi - Admin endpoints', () => {
  it('should have getAdminStats method', () => {
    const api = new DashboardApi()
    expect(typeof api.getAdminStats).toBe('function')
  })

  it('should have getSpieleProLiga method', () => {
    const api = new DashboardApi()
    expect(typeof api.getSpieleProLiga).toBe('function')
  })

  it('should have getTeamsProLiga method', () => {
    const api = new DashboardApi()
    expect(typeof api.getTeamsProLiga).toBe('function')
  })

  it('should have getTeamsProLandesverband method', () => {
    const api = new DashboardApi()
    expect(typeof api.getTeamsProLandesverband).toBe('function')
  })

  it('should have getSchiedsrichterProTeam method', () => {
    const api = new DashboardApi()
    expect(typeof api.getSchiedsrichterProTeam).toBe('function')
  })
})
```

**Step 2: Run test to verify it fails**

```bash
cd /home/cda/.local/share/opencode/worktree/212c86dfb0b9deb465f3caef8df4dfea2290e45d/calm-squid/dashboard
npm run test:run src/utils/__tests__/api.test.ts
```

Expected: FAIL - methods don't exist

**Step 3: Add API methods**

```typescript
// Append to /dashboard/src/utils/api.ts class

  async getAdminStats(): Promise<AdminDashboardData> {
    const response = await this.client.get<AdminDashboardData>('/admin-stats/')
    return response.data
  }

  async getSpieleProLiga(): Promise<SpieleProLiga[]> {
    const response = await this.client.get<SpieleProLiga[]>('/spiele-pro-liga/')
    return response.data
  }

  async getTeamsProLiga(): Promise<TeamsProLiga[]> {
    const response = await this.client.get<TeamsProLiga[]>('/teams-pro-liga/')
    return response.data
  }

  async getTeamsProLandesverband(): Promise<TeamsProLandesverband[]> {
    const response = await this.client.get<TeamsProLandesverband[]>('/teams-pro-landesverband/')
    return response.data
  }

  async getSchiedsrichterProTeam(): Promise<SchiedsrichterProTeam[]> {
    const response = await this.client.get<SchiedsrichterProTeam[]>('/schiedsrichter-pro-team/')
    return response.data
  }
```

**Step 4: Add imports at top of api.ts**

```typescript
import {
  AdminStats,
  AdminDashboardData,
  SpieleProLiga,
  TeamsProLiga,
  SchiedsrichterProTeam,
  TeamsProLandesverband,
  // ... existing imports
} from '../types/dashboard'
```

**Step 5: Run test to verify it passes**

```bash
cd /home/cda/.local/share/opencode/worktree/212c86dfb0b9deb465f3caef8df4dfea2290e45d/calm-squid/dashboard
npm run test:run src/utils/__tests__/api.test.ts
```

Expected: PASS

**Step 6: Commit**

```bash
cd /home/cda/.local/share/opencode/worktree/212c86dfb0b9deb465f3caef8df4dfea2290e45d/calm-squid
git add dashboard/src/utils/api.ts dashboard/src/utils/__tests__/api.test.ts
git commit -m "feat: add admin stats methods to API client"
```

---

## Task 5: Create AdminStatsCard component

**Files:**
- Create: `/dashboard/src/components/AdminStatsCard.tsx`
- Test: `/dashboard/src/components/__tests__/AdminStatsCard.test.tsx` (new)

**Step 1: Write test for AdminStatsCard**

```typescript
// /dashboard/src/components/__tests__/AdminStatsCard.test.tsx
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import AdminStatsCard from '../AdminStatsCard'

describe('AdminStatsCard', () => {
  const mockStats = {
    spieltage: 24,
    teams: 156,
    spiele: 1234,
  }

  it('should render loading spinner when loading', () => {
    render(<AdminStatsCard data={null} loading={true} />)
    expect(screen.getByRole('status')).toBeInTheDocument()
  })

  it('should render stats cards when data is loaded', () => {
    render(<AdminStatsCard data={mockStats} loading={false} />)
    
    expect(screen.getByText('Spieltage')).toBeInTheDocument()
    expect(screen.getByText('24')).toBeInTheDocument()
    
    expect(screen.getByText('Teams')).toBeInTheDocument()
    expect(screen.getByText('156')).toBeInTheDocument()
    
    expect(screen.getByText('Spiele')).toBeInTheDocument()
    expect(screen.getByText('1234')).toBeInTheDocument()
  })

  it('should render null when data is null and not loading', () => {
    const { container } = render(<AdminStatsCard data={null} loading={false} />)
    expect(container.firstChild).toBeNull()
  })
})
```

**Step 2: Run test to verify it fails**

```bash
cd /home/cda/.local/share/opencode/worktree/212c86dfb0b9deb465f3caef8df4dfea2290e45d/calm-squid/dashboard
npm run test:run src/components/__tests__/AdminStatsCard.test.tsx
```

Expected: FAIL - component doesn't exist

**Step 3: Create component**

```typescript
// /dashboard/src/components/AdminStatsCard.tsx
import React from 'react'
import { Row, Col, Card, Spinner } from 'react-bootstrap'
import { AdminStats } from '../types/dashboard'
import StatCard from './StatCard'

interface Props {
  data: AdminStats | null
  loading: boolean
}

const AdminStatsCard: React.FC<Props> = ({ data, loading }) => {
  if (loading) {
    return <Spinner animation="border" role="status" />
  }

  if (!data) {
    return null
  }

  return (
    <Row className="mb-4">
      <Col md={4} className="mb-3">
        <StatCard
          icon="bi-calendar3"
          title="Spieltage"
          value={data.spieltage}
          color="primary"
        />
      </Col>
      <Col md={4} className="mb-3">
        <StatCard
          icon="bi-people-fill"
          title="Teams"
          value={data.teams}
          color="success"
        />
      </Col>
      <Col md={4} className="mb-3">
        <StatCard
          icon="bi-controller"
          title="Spiele"
          value={data.spiele}
          color="info"
        />
      </Col>
    </Row>
  )
}

export default AdminStatsCard
```

**Step 4: Run test to verify it passes**

```bash
cd /home/cda/.local/share/opencode/worktree/212c86dfb0b9deb465f3caef8df4dfea2290e45d/calm-squid/dashboard
npm run test:run src/components/__tests__/AdminStatsCard.test.tsx
```

Expected: PASS

**Step 5: Commit**

```bash
cd /home/cda/.local/share/opencode/worktree/212c86dfb0b9deb465f3caef8df4dfea2290e45d/calm-squid
git add dashboard/src/components/AdminStatsCard.tsx dashboard/src/components/__tests__/AdminStatsCard.test.tsx
git commit -m "feat: create AdminStatsCard component"
```

---

## Task 6: Create SpieleProLigaCard component

**Files:**
- Create: `/dashboard/src/components/SpieleProLigaCard.tsx`
- Test: `/dashboard/src/components/__tests__/SpieleProLigaCard.test.tsx` (new)

**Step 1: Write test**

```typescript
// /dashboard/src/components/__tests__/SpieleProLigaCard.test.tsx
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import SpieleProLigaCard from '../SpieleProLigaCard'

describe('SpieleProLigaCard', () => {
  const mockData = [
    { liga_name: 'Bundesliga', liga_id: 1, count: 287 },
    { liga_name: 'Regionalliga', liga_id: 2, count: 156 },
  ]

  it('should render card with title', () => {
    render(<SpieleProLigaCard data={mockData} loading={false} />)
    expect(screen.getByText('SPIELENDE PRO LIGA')).toBeInTheDocument()
  })

  it('should render league names and counts', () => {
    render(<SpieleProLigaCard data={mockData} loading={false} />)
    
    expect(screen.getByText('Bundesliga')).toBeInTheDocument()
    expect(screen.getByText('287')).toBeInTheDocument()
    
    expect(screen.getByText('Regionalliga')).toBeInTheDocument()
    expect(screen.getByText('156')).toBeInTheDocument()
  })

  it('should render loading spinner when loading', () => {
    render(<SpieleProLigaCard data={[]} loading={true} />)
    expect(screen.getByRole('status')).toBeInTheDocument()
  })

  it('should render null when no data', () => {
    const { container } = render(<SpieleProLigaCard data={[]} loading={false} />)
    // Container should have card but empty body
    expect(screen.getByText('SPIELENDE PRO LIGA')).toBeInTheDocument()
  })
})
```

**Step 2: Run test to verify it fails**

```bash
cd /home/cda/.local/share/opencode/worktree/212c86dfb0b9deb465f3caef8df4dfea2290e45d/calm-squid/dashboard
npm run test:run src/components/__tests__/SpieleProLigaCard.test.tsx
```

Expected: FAIL

**Step 3: Create component**

```typescript
// /dashboard/src/components/SpieleProLigaCard.tsx
import React from 'react'
import { Card, Spinner } from 'react-bootstrap'
import { SpieleProLiga } from '../types/dashboard'

interface Props {
  data: SpieleProLiga[]
  loading: boolean
}

const SpieleProLigaCard: React.FC<Props> = ({ data, loading }) => {
  if (loading) {
    return <Spinner animation="border" role="status" />
  }

  const maxCount = data.length > 0 ? Math.max(...data.map(d => d.count)) : 1

  return (
    <Card className="h-100">
      <Card.Header className="bg-primary text-white">
        <Card.Title className="mb-0">SPIELENDE PRO LIGA</Card.Title>
      </Card.Header>
      <Card.Body>
        {data.length === 0 ? (
          <p className="text-muted mb-0">Keine Daten verfügbar</p>
        ) : (
          data.map(item => (
            <div key={item.liga_id || item.liga_name} className="mb-3">
              <div className="d-flex justify-content-between mb-1">
                <span className="text-secondary">{item.liga_name}</span>
                <span className="fw-bold">{item.count}</span>
              </div>
              <div
                className="bg-light rounded"
                style={{
                  height: '8px',
                  width: '100%',
                  overflow: 'hidden',
                }}
              >
                <div
                  className="bg-primary"
                  style={{
                    height: '100%',
                    width: `${(item.count / maxCount) * 100}%`,
                    transition: 'width 0.3s ease',
                  }}
                />
              </div>
            </div>
          ))
        )}
      </Card.Body>
    </Card>
  )
}

export default SpieleProLigaCard
```

**Step 4: Run test to verify it passes**

```bash
cd /home/cda/.local/share/opencode/worktree/212c86dfb0b9deb465f3caef8df4dfea2290e45d/calm-squid/dashboard
npm run test:run src/components/__tests__/SpieleProLigaCard.test.tsx
```

Expected: PASS

**Step 5: Commit**

```bash
cd /home/cda/.local/share/opencode/worktree/212c86dfb0b9deb465f3caef8df4dfea2290e45d/calm-squid
git add dashboard/src/components/SpieleProLigaCard.tsx dashboard/src/components/__tests__/SpieleProLigaCard.test.tsx
git commit -m "feat: create SpieleProLigaCard component"
```

---

## Task 7: Create TeamsProLigaCard component

**Files:**
- Create: `/dashboard/src/components/TeamsProLigaCard.tsx`
- Test: `/dashboard/src/components/__tests__/TeamsProLigaCard.test.tsx` (new)

**Step 1: Write test**

```typescript
// /dashboard/src/components/__tests__/TeamsProLigaCard.test.tsx
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import TeamsProLigaCard from '../TeamsProLigaCard'

describe('TeamsProLigaCard', () => {
  const mockData = [
    { liga_name: 'Bundesliga', liga_id: 1, count: 24 },
    { liga_name: 'Regionalliga', liga_id: 2, count: 18 },
  ]

  it('should render card with title', () => {
    render(<TeamsProLigaCard data={mockData} loading={false} />)
    expect(screen.getByText('TEAMS PRO LIGA')).toBeInTheDocument()
  })

  it('should render league names and team counts', () => {
    render(<TeamsProLigaCard data={mockData} loading={false} />)
    
    expect(screen.getByText('Bundesliga')).toBeInTheDocument()
    expect(screen.getByText('24')).toBeInTheDocument()
    
    expect(screen.getByText('Regionalliga')).toBeInTheDocument()
    expect(screen.getByText('18')).toBeInTheDocument()
  })

  it('should render loading spinner when loading', () => {
    render(<TeamsProLigaCard data={[]} loading={true} />)
    expect(screen.getByRole('status')).toBeInTheDocument()
  })
})
```

**Step 2: Run test to verify it fails**

```bash
cd /home/cda/.local/share/opencode/worktree/212c86dfb0b9deb465f3caef8df4dfea2290e45d/calm-squid/dashboard
npm run test:run src/components/__tests__/TeamsProLigaCard.test.tsx
```

Expected: FAIL

**Step 3: Create component (same pattern as SpieleProLigaCard)**

```typescript
// /dashboard/src/components/TeamsProLigaCard.tsx
import React from 'react'
import { Card, Spinner } from 'react-bootstrap'
import { TeamsProLiga } from '../types/dashboard'

interface Props {
  data: TeamsProLiga[]
  loading: boolean
}

const TeamsProLigaCard: React.FC<Props> = ({ data, loading }) => {
  if (loading) {
    return <Spinner animation="border" role="status" />
  }

  const maxCount = data.length > 0 ? Math.max(...data.map(d => d.count)) : 1

  return (
    <Card className="h-100">
      <Card.Header className="bg-success text-white">
        <Card.Title className="mb-0">TEAMS PRO LIGA</Card.Title>
      </Card.Header>
      <Card.Body>
        {data.length === 0 ? (
          <p className="text-muted mb-0">Keine Daten verfügbar</p>
        ) : (
          data.map(item => (
            <div key={item.liga_id || item.liga_name} className="mb-3">
              <div className="d-flex justify-content-between mb-1">
                <span className="text-secondary">{item.liga_name}</span>
                <span className="fw-bold">{item.count}</span>
              </div>
              <div
                className="bg-light rounded"
                style={{
                  height: '8px',
                  width: '100%',
                  overflow: 'hidden',
                }}
              >
                <div
                  className="bg-success"
                  style={{
                    height: '100%',
                    width: `${(item.count / maxCount) * 100}%`,
                    transition: 'width 0.3s ease',
                  }}
                />
              </div>
            </div>
          ))
        )}
      </Card.Body>
    </Card>
  )
}

export default TeamsProLigaCard
```

**Step 4: Run test to verify it passes**

```bash
cd /home/cda/.local/share/opencode/worktree/212c86dfb0b9deb465f3caef8df4dfea2290e45d/calm-squid/dashboard
npm run test:run src/components/__tests__/TeamsProLigaCard.test.tsx
```

Expected: PASS

**Step 5: Commit**

```bash
cd /home/cda/.local/share/opencode/worktree/212c86dfb0b9deb465f3caef8df4dfea2290e45d/calm-squid
git add dashboard/src/components/TeamsProLigaCard.tsx dashboard/src/components/__tests__/TeamsProLigaCard.test.tsx
git commit -m "feat: create TeamsProLigaCard component"
```

---

## Task 8: Create TeamsProLandesverbandCard component

**Files:**
- Create: `/dashboard/src/components/TeamsProLandesverbandCard.tsx`
- Test: `/dashboard/src/components/__tests__/TeamsProLandesverbandCard.test.tsx` (new)

**Step 1: Write test**

```typescript
// /dashboard/src/components/__tests__/TeamsProLandesverbandCard.test.tsx
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import TeamsProLandesverbandCard from '../TeamsProLandesverbandCard'

describe('TeamsProLandesverbandCard', () => {
  const mockData = [
    { landesverband_name: 'Bayern', landesverband_id: 1, count: 24 },
    { landesverband_name: 'NRW', landesverband_id: 2, count: 28 },
  ]

  it('should render card with title', () => {
    render(<TeamsProLandesverbandCard data={mockData} loading={false} />)
    expect(screen.getByText('TEAMS PRO LANDESVERBAND')).toBeInTheDocument()
  })

  it('should render association names and team counts', () => {
    render(<TeamsProLandesverbandCard data={mockData} loading={false} />)
    
    expect(screen.getByText('Bayern')).toBeInTheDocument()
    expect(screen.getByText('24')).toBeInTheDocument()
    
    expect(screen.getByText('NRW')).toBeInTheDocument()
    expect(screen.getByText('28')).toBeInTheDocument()
  })

  it('should render loading spinner when loading', () => {
    render(<TeamsProLandesverbandCard data={[]} loading={true} />)
    expect(screen.getByRole('status')).toBeInTheDocument()
  })
})
```

**Step 2: Run test to verify it fails**

```bash
cd /home/cda/.local/share/opencode/worktree/212c86dfb0b9deb465f3caef8df4dfea2290e45d/calm-squid/dashboard
npm run test:run src/components/__tests__/TeamsProLandesverbandCard.test.tsx
```

Expected: FAIL

**Step 3: Create component**

```typescript
// /dashboard/src/components/TeamsProLandesverbandCard.tsx
import React from 'react'
import { Card, Spinner } from 'react-bootstrap'
import { TeamsProLandesverband } from '../types/dashboard'

interface Props {
  data: TeamsProLandesverband[]
  loading: boolean
}

const TeamsProLandesverbandCard: React.FC<Props> = ({ data, loading }) => {
  if (loading) {
    return <Spinner animation="border" role="status" />
  }

  const maxCount = data.length > 0 ? Math.max(...data.map(d => d.count)) : 1

  return (
    <Card className="h-100">
      <Card.Header className="bg-warning text-dark">
        <Card.Title className="mb-0">TEAMS PRO LANDESVERBAND</Card.Title>
      </Card.Header>
      <Card.Body style={{ maxHeight: '400px', overflowY: 'auto' }}>
        {data.length === 0 ? (
          <p className="text-muted mb-0">Keine Daten verfügbar</p>
        ) : (
          data.map(item => (
            <div key={item.landesverband_id || item.landesverband_name} className="mb-2">
              <div className="d-flex justify-content-between mb-1" style={{ fontSize: '0.9rem' }}>
                <span className="text-secondary">{item.landesverband_name}</span>
                <span className="fw-bold">{item.count}</span>
              </div>
              <div
                className="bg-light rounded"
                style={{
                  height: '6px',
                  width: '100%',
                  overflow: 'hidden',
                }}
              >
                <div
                  className="bg-warning"
                  style={{
                    height: '100%',
                    width: `${(item.count / maxCount) * 100}%`,
                    transition: 'width 0.3s ease',
                  }}
                />
              </div>
            </div>
          ))
        )}
      </Card.Body>
    </Card>
  )
}

export default TeamsProLandesverbandCard
```

**Step 4: Run test to verify it passes**

```bash
cd /home/cda/.local/share/opencode/worktree/212c86dfb0b9deb465f3caef8df4dfea2290e45d/calm-squid/dashboard
npm run test:run src/components/__tests__/TeamsProLandesverbandCard.test.tsx
```

Expected: PASS

**Step 5: Commit**

```bash
cd /home/cda/.local/share/opencode/worktree/212c86dfb0b9deb465f3caef8df4dfea2290e45d/calm-squid
git add dashboard/src/components/TeamsProLandesverbandCard.tsx dashboard/src/components/__tests__/TeamsProLandesverbandCard.test.tsx
git commit -m "feat: create TeamsProLandesverbandCard component"
```

---

## Task 9: Create SchiedsrichterProTeamCard component

**Files:**
- Create: `/dashboard/src/components/SchiedsrichterProTeamCard.tsx`
- Test: `/dashboard/src/components/__tests__/SchiedsrichterProTeamCard.test.tsx` (new)

**Step 1: Write test**

```typescript
// /dashboard/src/components/__tests__/SchiedsrichterProTeamCard.test.tsx
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import SchiedsrichterProTeamCard from '../SchiedsrichterProTeamCard'

describe('SchiedsrichterProTeamCard', () => {
  const mockData = [
    { team_id: 1, team_name: 'Team A', count: 5 },
    { team_id: 2, team_name: 'Team B', count: 3 },
  ]

  it('should render card with title', () => {
    render(<SchiedsrichterProTeamCard data={mockData} loading={false} />)
    expect(screen.getByText('SCHIEDSRICHTER PRO TEAM')).toBeInTheDocument()
  })

  it('should render team names and referee counts', () => {
    render(<SchiedsrichterProTeamCard data={mockData} loading={false} />)
    
    expect(screen.getByText('Team A')).toBeInTheDocument()
    expect(screen.getByText('Team B')).toBeInTheDocument()
  })

  it('should render loading spinner when loading', () => {
    render(<SchiedsrichterProTeamCard data={[]} loading={true} />)
    expect(screen.getByRole('status')).toBeInTheDocument()
  })
})
```

**Step 2: Run test to verify it fails**

```bash
cd /home/cda/.local/share/opencode/worktree/212c86dfb0b9deb465f3caef8df4dfea2290e45d/calm-squid/dashboard
npm run test:run src/components/__tests__/SchiedsrichterProTeamCard.test.tsx
```

Expected: FAIL

**Step 3: Create component**

```typescript
// /dashboard/src/components/SchiedsrichterProTeamCard.tsx
import React from 'react'
import { Card, Spinner, ListGroup } from 'react-bootstrap'
import { SchiedsrichterProTeam } from '../types/dashboard'

interface Props {
  data: SchiedsrichterProTeam[]
  loading: boolean
}

const SchiedsrichterProTeamCard: React.FC<Props> = ({ data, loading }) => {
  if (loading) {
    return <Spinner animation="border" role="status" />
  }

  const sortedData = [...data].sort((a, b) => b.count - a.count).slice(0, 10)

  return (
    <Card className="h-100">
      <Card.Header className="bg-info text-white">
        <Card.Title className="mb-0">SCHIEDSRICHTER PRO TEAM</Card.Title>
      </Card.Header>
      <Card.Body style={{ maxHeight: '400px', overflowY: 'auto' }}>
        {sortedData.length === 0 ? (
          <p className="text-muted mb-0">Keine Daten verfügbar</p>
        ) : (
          <ListGroup variant="flush">
            {sortedData.map(item => (
              <ListGroup.Item
                key={item.team_id}
                className="d-flex justify-content-between align-items-center px-0 border-bottom"
              >
                <span>{item.team_name}</span>
                <span
                  className="badge bg-info"
                  style={{ fontSize: '0.9rem', padding: '0.5rem 0.75rem' }}
                >
                  {item.count}
                </span>
              </ListGroup.Item>
            ))}
          </ListGroup>
        )}
      </Card.Body>
    </Card>
  )
}

export default SchiedsrichterProTeamCard
```

**Step 4: Run test to verify it passes**

```bash
cd /home/cda/.local/share/opencode/worktree/212c86dfb0b9deb465f3caef8df4dfea2290e45d/calm-squid/dashboard
npm run test:run src/components/__tests__/SchiedsrichterProTeamCard.test.tsx
```

Expected: PASS

**Step 5: Commit**

```bash
cd /home/cda/.local/share/opencode/worktree/212c86dfb0b9deb465f3caef8df4dfea2290e45d/calm-squid
git add dashboard/src/components/SchiedsrichterProTeamCard.tsx dashboard/src/components/__tests__/SchiedsrichterProTeamCard.test.tsx
git commit -m "feat: create SchiedsrichterProTeamCard component"
```

---

## Task 10: Update Dashboard.tsx to use new admin cards and hide old sections

**Files:**
- Modify: `/dashboard/src/components/Dashboard.tsx`
- Test: `/dashboard/src/components/__tests__/Dashboard.test.tsx` (update existing)

**Step 1: Write updated test for Dashboard**

```typescript
// Update /dashboard/src/components/__tests__/Dashboard.test.tsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import Dashboard from '../Dashboard'

// Mock the API
vi.mock('../utils/api', () => ({
  default: class MockAPI {
    getAdminStats = vi.fn().mockResolvedValue({
      spieltage: 24,
      teams: 156,
      spiele: 1234,
    })
    getSpieleProLiga = vi.fn().mockResolvedValue([])
    getTeamsProLiga = vi.fn().mockResolvedValue([])
    getTeamsProLandesverband = vi.fn().mockResolvedValue([])
    getSchiedsrichterProTeam = vi.fn().mockResolvedValue([])
    // ... keep existing mock methods
  },
}))

describe('Dashboard - Admin Cards', () => {
  it('should render admin stat cards', async () => {
    render(<Dashboard />)
    
    await waitFor(() => {
      // Check for new admin cards
      expect(screen.getByText('Spieltage')).toBeInTheDocument()
      expect(screen.getByText('SPIELENDE PRO LIGA')).toBeInTheDocument()
      expect(screen.getByText('TEAMS PRO LIGA')).toBeInTheDocument()
      expect(screen.getByText('TEAMS PRO LANDESVERBAND')).toBeInTheDocument()
      expect(screen.getByText('SCHIEDSRICHTER PRO TEAM')).toBeInTheDocument()
    })
  })

  it('should not render old PlatformHealthCards', () => {
    render(<Dashboard />)
    // After update, old cards should be removed/hidden
    // Verify new cards are rendering instead
    expect(screen.getByText('Spieltage')).toBeInTheDocument()
  })
})
```

**Step 2: Run test to verify old sections are present**

```bash
cd /home/cda/.local/share/opencode/worktree/212c86dfb0b9deb465f3caef8df4dfea2290e45d/calm-squid/dashboard
npm run test:run src/components/__tests__/Dashboard.test.tsx
```

Expected: Currently PASS (before changes)

**Step 3: Update Dashboard.tsx**

```typescript
// Replace /dashboard/src/components/Dashboard.tsx

import React, { useEffect, useState } from 'react'
import { Container, Row, Col, Alert, Button } from 'react-bootstrap'
import DashboardApi from '../utils/api'
import {
  AdminStats,
  SpieleProLiga,
  TeamsProLiga,
  SchiedsrichterProTeam,
  TeamsProLandesverband,
} from '../types/dashboard'
import AdminStatsCard from './AdminStatsCard'
import SpieleProLigaCard from './SpieleProLigaCard'
import TeamsProLigaCard from './TeamsProLigaCard'
import TeamsProLandesverbandCard from './TeamsProLandesverbandCard'
import SchiedsrichterProTeamCard from './SchiedsrichterProTeamCard'

const Dashboard: React.FC = () => {
  const [adminStats, setAdminStats] = useState<AdminStats | null>(null)
  const [spieleProLiga, setSpieleProLiga] = useState<SpieleProLiga[]>([])
  const [teamsProLiga, setTeamsProLiga] = useState<TeamsProLiga[]>([])
  const [teamsProLandesverband, setTeamsProLandesverband] = useState<
    TeamsProLandesverband[]
  >([])
  const [schiedsrichterProTeam, setSchiedsrichterProTeam] = useState<
    SchiedsrichterProTeam[]
  >([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const api = new DashboardApi()

  useEffect(() => {
    fetchAdminData()
  }, [])

  const fetchAdminData = async () => {
    try {
      setLoading(true)
      setError(null)

      // Fetch all admin data in parallel
      const [stats, spiele, teams, landesverband, schiedsrichter] =
        await Promise.all([
          api.getAdminStats(),
          api.getSpieleProLiga(),
          api.getTeamsProLiga(),
          api.getTeamsProLandesverband(),
          api.getSchiedsrichterProTeam(),
        ])

      setAdminStats(stats.stats)
      setSpieleProLiga(spiele)
      setTeamsProLiga(teams)
      setTeamsProLandesverband(landesverband)
      setSchiedsrichterProTeam(schiedsrichter)
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Fehler beim Laden der Dashboard-Daten'
      )
      console.error('Dashboard error:', err)
    } finally {
      setLoading(false)
    }
  }

  return (
    <Container fluid className="py-4">
      <div className="mb-4 d-flex justify-content-between align-items-center">
        <h1 className="mb-0">Admin Dashboard</h1>
        <Button
          variant="outline-primary"
          size="sm"
          onClick={fetchAdminData}
          disabled={loading}
        >
          {loading ? 'Aktualisierung...' : 'Aktualisieren'}
        </Button>
      </div>

      {error && (
        <Alert variant="danger" dismissible onClose={() => setError(null)}>
          <strong>Fehler:</strong> {error}
        </Alert>
      )}

      {/* Admin Stats Cards */}
      <AdminStatsCard data={adminStats} loading={loading} />

      {/* Two-Column Layout */}
      <Row className="mb-4">
        <Col lg={6} className="mb-3">
          <SpieleProLigaCard data={spieleProLiga} loading={loading} />
        </Col>
        <Col lg={6} className="mb-3">
          <TeamsProLigaCard data={teamsProLiga} loading={loading} />
        </Col>
      </Row>

      {/* Full-Width Cards */}
      <Row className="mb-4">
        <Col lg={6} className="mb-3">
          <SchiedsrichterProTeamCard
            data={schiedsrichterProTeam}
            loading={loading}
          />
        </Col>
        <Col lg={6} className="mb-3">
          <TeamsProLandesverbandCard
            data={teamsProLandesverband}
            loading={loading}
          />
        </Col>
      </Row>

      <div className="text-center text-muted small mt-4">
        <p>Dashboard aktualisiert: {new Date().toLocaleString('de-DE')}</p>
      </div>
    </Container>
  )
}

export default Dashboard
```

**Step 4: Run test to verify updates**

```bash
cd /home/cda/.local/share/opencode/worktree/212c86dfb0b9deb465f3caef8df4dfea2290e45d/calm-squid/dashboard
npm run test:run src/components/__tests__/Dashboard.test.tsx
```

Expected: PASS (or update tests as needed for new components)

**Step 5: Run all dashboard tests to ensure nothing broke**

```bash
cd /home/cda/.local/share/opencode/worktree/212c86dfb0b9deb465f3caef8df4dfea2290e45d/calm-squid/dashboard
npm run test:run
```

Expected: All tests PASS

**Step 6: Commit**

```bash
cd /home/cda/.local/share/opencode/worktree/212c86dfb0b9deb465f3caef8df4dfea2290e45d/calm-squid
git add dashboard/src/components/Dashboard.tsx
git commit -m "feat: replace dashboard cards with admin-focused statistics"
```

---

## Task 11: Build and verify the frontend

**Files:**
- None (build output only)

**Step 1: Install dependencies if needed**

```bash
cd /home/cda/.local/share/opencode/worktree/212c86dfb0b9deb465f3caef8df4dfea2290e45d/calm-squid/dashboard
npm install
```

Expected: Successful installation

**Step 2: Run ESLint to check code quality**

```bash
cd /home/cda/.local/share/opencode/worktree/212c86dfb0b9deb465f3caef8df4dfea2290e45d/calm-squid/dashboard
npm run eslint
```

Expected: No errors (fix any lint issues if found)

**Step 3: Build the React app**

```bash
cd /home/cda/.local/share/opencode/worktree/212c86dfb0b9deb465f3caef8df4dfea2290e45d/calm-squid/dashboard
npm run build
```

Expected: Build succeeds, outputs to `/dashboard/static/dashboard/`

**Step 4: Verify build artifacts exist**

```bash
ls -la dashboard/static/dashboard/
```

Expected: JS and CSS files present

**Step 5: Commit (if any auto-generated changes)**

```bash
cd /home/cda/.local/share/opencode/worktree/212c86dfb0b9deb465f3caef8df4dfea2290e45d/calm-squid
git add dashboard/static/
git commit -m "build: rebuild dashboard with new admin components"
```

---

## Task 12: Run full test suite and verify no regressions

**Files:**
- None (testing only)

**Step 1: Run backend tests**

```bash
cd /home/cda/.local/share/opencode/worktree/212c86dfb0b9deb465f3caef8df4dfea2290e45d/calm-squid
pytest dashboard/ -v
```

Expected: All tests PASS

**Step 2: Run frontend tests**

```bash
cd /home/cda/.local/share/opencode/worktree/212c86dfb0b9deb465f3caef8df4dfea2290e45d/calm-squid/dashboard
npm run test:run
```

Expected: All tests PASS

**Step 3: Check for any remaining console errors/warnings**

```bash
cd /home/cda/.local/share/opencode/worktree/212c86dfb0b9deb465f3caef8df4dfea2290e45d/calm-squid/dashboard
npm run build 2>&1 | grep -i "warning\|error"
```

Expected: No critical errors

**Step 4: Manual verification checklist**

- [ ] Dashboard loads without 404s
- [ ] All 5 new card components render
- [ ] Admin stats (Spieltage, Teams, Spiele) display correct numbers
- [ ] Spielende pro Liga shows all leagues with bars
- [ ] Teams pro Liga shows all leagues with bars
- [ ] Schiedsrichter pro Team shows team list (or "no data" if not yet populated)
- [ ] Teams pro Landesverband shows scrollable list
- [ ] Refresh button works
- [ ] No console errors in browser DevTools
- [ ] Responsive layout works on mobile (sm screens)

---

## Summary

This plan replaces the existing 9 dashboard card sections with 6 new admin-focused cards:

1. **Admin Stats Card** - Quick overview (Spieltage, Teams, Spiele)
2. **Spielende Pro Liga** - Games grouped by league with progress bars
3. **Teams Pro Liga** - Teams grouped by league with progress bars
4. **Schiedsrichter Pro Team** - Referees assigned to teams (top 10 list)
5. **Teams Pro Landesverband** - Teams grouped by state association with scrollable list

**Key Implementation Details:**

- **Backend**: New DashboardService methods + 5 new API endpoints (all cached 60s)
- **Frontend**: 5 new React components + updated Dashboard orchestrator
- **Types**: Full TypeScript support with AdminDashboardData interface
- **Testing**: Unit tests for all new components and API methods
- **Build**: Standard Vite build process outputs to static/ directories

**Total Commits**: 12 focused commits, each completing one logical unit of work
