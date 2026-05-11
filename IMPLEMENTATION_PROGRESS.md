# Game Progress Dashboard — TDD Implementation Progress

**Date**: 2026-05-10  
**Status**: Phase 1 Complete (Backend Serializer), Phase 2 In Progress (ViewSet)

---

## Completed: RED → GREEN → REFACTOR Cycle 1

### Serializer Tests (7 tests) ✅ PASSING

**Location**: `gameday_designer/api/tests/test_game_progress_serializer.py`

Tests written (RED):
- ✅ Serializer includes gameday fields (id, name, status, etc.)
- ✅ Serializer denormalizes gameinfos into games array
- ✅ Each game has required fields (id, scheduled, status, times, field, stage)
- ✅ Game status values are correct (Geplant, Gestartet, beendet)
- ✅ Serializer includes league_display (human-readable name)
- ✅ Serializer includes season_display (human-readable name)
- ✅ Serializer works with multiple gamedays (many=True)

Implementation (GREEN):
- ✅ `gameday_designer/api/serializers.py` created with:
  - `GameResultSerializer` — serializes game results
  - `GameinfoProgressSerializer` — serializes individual games
  - `GameProgressSerializer` — main serializer with denormalized data

All tests pass: `PASS (7/7)`

### Serializer Structure

```python
GameProgressSerializer
├── id, name, date, start, status
├── league (FK), league_display
├── season (FK), season_display
└── games: [
    {
      id, scheduled, status,
      gameStarted, gameFinished,
      field, stage, standing,
      result: { home_score, away_score, home, away }
    }
  ]
```

---

## In Progress: RED → GREEN Cycle 2

### ViewSet API Tests (9 tests) - RED Phase

**Location**: `gameday_designer/api/tests/test_game_progress_viewset.py`

Tests written (RED) but not yet GREEN:
- 🔴 API endpoint exists at `/api/gamedays/progress/`
- 🔴 API requires staff permission
- 🔴 API returns paginated response (count, next, previous, results)
- 🔴 API returns gameday list
- 🔴 Each gameday has required fields
- 🔴 API defaults to past-1-day + next-7-days date range
- 🔴 API supports `date_from` filter parameter
- 🔴 API supports `date_to` filter parameter
- 🔴 API supports `league` filter parameter

### Next: GREEN Implementation

Need to create:

**File**: `gameday_designer/api/views.py`

```python
from rest_framework import viewsets, filters, permissions
from django_filters.rest_framework import DjangoFilterBackend
from rest_framework.pagination import PageNumberPagination
from gamedays.models import Gameday
from .serializers import GameProgressSerializer

class IsStaff(permissions.BasePermission):
    def has_permission(self, request, view):
        return request.user and request.user.is_staff

class GameProgressPagination(PageNumberPagination):
    page_size = 50
    page_size_query_param = "page_size"
    max_page_size = 200

class GameProgressViewSet(viewsets.ReadOnlyModelViewSet):
    """Game progress dashboard API endpoint"""
    serializer_class = GameProgressSerializer
    pagination_class = GameProgressPagination
    filter_backends = [DjangoFilterBackend, filters.OrderingFilter]
    filterset_fields = ['league', 'season', 'status']
    ordering_fields = ['date']
    ordering = ['-date']
    permission_classes = [IsStaff]
    
    def get_queryset(self):
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

**File**: `gameday_designer/api/urls.py` (update)

```python
from rest_framework.routers import DefaultRouter
from .views import GameProgressViewSet

router = DefaultRouter()
router.register(r'progress', GameProgressViewSet, basename='game-progress')

urlpatterns = [
    # ... existing patterns
    path('', include(router.urls)),
]
```

---

## TODO: Phase 3 - Frontend Component Tests (TDD RED)

React component tests to write (RED):

**File**: `gameday_designer/src/components/progress/__tests__/GameProgressDashboard.test.tsx`

```typescript
describe('GameProgressDashboard', () => {
  test('renders hero strip with live count', () => {
    // ...
  });
  
  test('renders LIVE section if any games are live', () => {
    // ...
  });
  
  test('renders SPÄTER HEUTE section with upcoming games', () => {
    // ...
  });
  
  test('handles loading state with skeleton loaders', () => {
    // ...
  });
  
  test('handles error state with retry button', () => {
    // ...
  });
  
  test('renders empty state if no gamedays', () => {
    // ...
  });
  
  test('displays countdown if kickoff within 90 minutes', () => {
    // ...
  });
  
  test('shows NÄCHSTER TERMIN if gap > 7 days', () => {
    // ...
  });
});

describe('useGameProgress hook', () => {
  test('fetches gamedays on mount', async () => {
    // ...
  });
  
  test('groups gamedays by status (live, soon, today, recent, upcoming)', () => {
    // ...
  });
  
  test('filters by date range', async () => {
    // ...
  });
  
  test('handles API errors gracefully', async () => {
    // ...
  });
});
```

---

## Files Created

### Backend
- ✅ `gameday_designer/api/serializers.py` — GameProgressSerializer (implemented)
- ✅ `gameday_designer/api/tests/test_game_progress_serializer.py` — 7 passing tests
- ✅ `gameday_designer/api/tests/test_game_progress_viewset.py` — 9 failing tests (RED)
- ⏳ `gameday_designer/api/views.py` — ViewSet (to implement GREEN)
- ⏳ `gameday_designer/api/urls.py` — Update routing (to implement)

### Frontend
- ⏳ `gameday_designer/src/components/progress/GameProgressDashboard.tsx`
- ⏳ `gameday_designer/src/components/progress/sections/*.tsx`
- ⏳ `gameday_designer/src/components/progress/cards/*.tsx`
- ⏳ `gameday_designer/src/components/progress/hooks/useGameProgress.ts`
- ⏳ `gameday_designer/src/components/progress/styles.module.css`
- ⏳ `gameday_designer/src/api/gameProgressApi.ts`
- ⏳ `gameday_designer/src/types/progress.ts`
- ⏳ `gameday_designer/src/__tests__/...` — Component tests

### Configuration
- ⏳ `gameday_designer/menu.py` — Update with new menu item
- ⏳ `gameday_designer/app_urls.py` — Add /progress/ route
- ⏳ `gameday_designer/src/App.tsx` — Add route
- ⏳ `gameday_designer/src/i18n/locales/*.json` — Add translations

---

## Testing Summary

| Component | Tests | Status | Next |
|-----------|-------|--------|------|
| **Serializer** | 7 | ✅ PASS | Refactor if needed |
| **ViewSet** | 9 | 🔴 FAIL (RED) | Implement GREEN |
| **Hook** | TBD | ⏳ TODO | Write RED tests |
| **Components** | TBD | ⏳ TODO | Write RED tests |
| **Integration** | TBD | ⏳ TODO | E2E testing |

---

## TDD Compliance Checklist

- ✅ Wrote failing serializer tests before implementation
- ✅ Implemented serializer to pass all tests
- ✅ All serializer tests passing
- ✅ Wrote failing ViewSet tests (RED phase)
- ⏳ Next: Implement ViewSet to pass tests (GREEN phase)
- ⏳ Next: Write frontend hook tests (RED phase)
- ⏳ Next: Implement hook to pass tests (GREEN phase)
- ⏳ Next: Write component tests (RED phase)
- ⏳ Next: Implement components to pass tests (GREEN phase)
- ⏳ Refactor as needed while keeping tests green

---

## Command to Run Tests

### Serializer Tests (Passing)
```bash
MYSQL_HOST=10.185.182.250 python manage.py test gameday_designer.api.tests.test_game_progress_serializer -v 2
```

### ViewSet Tests (Failing - RED phase)
```bash
MYSQL_HOST=10.185.182.250 python manage.py test gameday_designer.api.tests.test_game_progress_viewset -v 2
```

---

## Notes

- Database must be running: `./container/spinup_test_db.sh`
- Set `MYSQL_HOST=10.185.182.250` for test execution
- All tests follow TDD: RED → GREEN → REFACTOR
- Serializer is complete and tested
- ViewSet tests are written, implementation pending
- Frontend implementation to follow after backend API is complete

---

## Next Immediate Steps

1. **Implement ViewSet** (GREEN phase)
   - Create `gameday_designer/api/views.py`
   - Register in `gameday_designer/api/urls.py`
   - Run tests: `MYSQL_HOST=10.185.182.250 python manage.py test gameday_designer.api.tests.test_game_progress_viewset`
   - Verify all 9 tests pass

2. **Update Menu & Routing** (wiring)
   - `gameday_designer/menu.py` — add menu item
   - `gameday_designer/app_urls.py` — add `/progress/` route
   - `gameday_designer/src/App.tsx` — add React route

3. **Write Frontend Hook Tests** (RED phase)
   - Test data fetching
   - Test state grouping
   - Test filtering

4. **Implement Frontend Components** (GREEN phase)
   - `useGameProgress` hook
   - Component hierarchy
   - Styling

---

**Time Estimate for Completion**: 4-6 hours remaining (ViewSet, frontend, integration)
