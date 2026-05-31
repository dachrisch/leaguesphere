# Performance Guide

## Overview

LeagueSphere performance optimization focuses on three key areas:
1. **Database Query Optimization** — Preventing N+1 queries and unnecessary data transfers
2. **HTTP-Level Caching** — Reducing redundant response transfers via ETags
3. **Database Indexes** — Ensuring frequently-queried columns are indexed

This guide establishes mandatory patterns and automated checks for maintaining performance standards.

---

## 1. Database Query Optimization

### Pattern: `select_related()` for Foreign Keys & One-to-One

**Use `select_related()` for mandatory relationships:**
```python
# ✅ CORRECT: Single SQL JOIN
queryset = Gameday.objects.select_related(
    'league',      # FK → join in one query
    'season',      # FK → join in one query
    'author',      # FK → join in one query
)

# ❌ WRONG: Multiple queries (N+1)
queryset = Gameday.objects.all()
for gameday in queryset:
    print(gameday.league.name)  # Query per gameday
    print(gameday.season.name)  # Query per gameday
```

**When to use:**
- Foreign key relationships (`ForeignKey`)
- One-to-one relationships (`OneToOneField`)
- **Always required** for relationships accessed in serializers or list views

### Pattern: `prefetch_related()` for Reverse ForeignKeys & Many-to-Many

**Use `prefetch_related()` to avoid N+1 on related sets:**
```python
# ✅ CORRECT: Batch query pattern
queryset = Gameday.objects.prefetch_related(
    'gameinfo_set',                    # Fetch all gameinfos in one query
    'gameinfo_set__gameresult_set',    # Fetch all results per gameinfo
)

# ❌ WRONG: N+1 queries (one per gameinfo)
for gameday in Gameday.objects.all():
    for gameinfo in gameday.gameinfo_set.all():  # Query per gameday
        for result in gameinfo.gameresult_set.all():  # Query per gameinfo
            process(result)
```

**When to use:**
- Reverse foreign key relationships (e.g., `gameinfo_set` from `Gameday`)
- Many-to-many relationships
- Always required when iterating over related sets in views or serializers

### Pattern: Explicit `Prefetch()` for Complex Filtering

**Use `Prefetch()` when you need to filter or order related sets:**
```python
from django.db.models import Prefetch

# ✅ CORRECT: Only fetch home team results
queryset = Gameday.objects.prefetch_related(
    Prefetch(
        'gameinfo_set__gameresult_set',
        queryset=Gameresult.objects.filter(team__home=True)
    )
)

# ❌ WRONG: Fetches all results, then filters in Python (memory waste)
queryset = Gameday.objects.prefetch_related('gameinfo_set__gameresult_set')
# ... later in serializer:
home_results = [r for r in gameinfo.gameresult_set.all() if r.team.home]
```

### Mandatory Checklist

For every API endpoint returning related data:
- [ ] Does the viewset/serializer access relationships?
- [ ] Are all relationships covered by `select_related()` or `prefetch_related()`?
- [ ] Do tests verify query count with `assertNumQueries()`?
- [ ] Is the query count stable (not increasing with result set size)?

---

## 2. HTTP-Level Caching with ETags

### Why ETags Matter

Prevents sending full response body when client cache is valid:
- **Typical response**: 50-200 KB per gameday list
- **ETag miss**: Full payload transferred
- **ETag hit**: HTTP 304 response (304 bytes), saves ~99% bandwidth

### Pattern: ETag Caching for Read-Heavy Endpoints

**Standard implementation:**
```python
from django.views.decorators.http import condition
import hashlib

def generate_gameday_list_etag(request):
    """ETag includes query params + latest object pk."""
    etag_data = request.GET.urlencode() or "all"
    
    # Include latest pk to detect changes
    latest_pk = Gameday.objects.values_list('pk', flat=True).order_by('-pk').first()
    if latest_pk:
        etag_data += f":{latest_pk}"
    
    return f'"{hashlib.md5(etag_data.encode()).hexdigest()}"'

class GamedayListAPIView(ListAPIView):
    @method_decorator(condition(etag_func=generate_gameday_list_etag))
    def get(self, request, *args, **kwargs):
        return super().get(request, *args, **kwargs)
```

**When to use ETags:**
- Read-only endpoints (`GET`)
- Endpoints returning large data structures (>10 KB typical response)
- Frequently-accessed endpoints (e.g., gameday lists, league standings)

**NOT recommended for:**
- Write endpoints (`POST`, `PUT`, `DELETE`)
- Endpoints with real-time data (avoid stale cache)
- Endpoints where computation time < bandwidth savings

---

## 3. Database Indexes

### Index Policy

Add indexes for:
1. **Foreign key columns** — Already indexed by Django
2. **Filter/search columns** — Columns in `filter()`, `exclude()`, `Q` objects
3. **Ordering columns** — Columns in `order_by()`
4. **High-cardinality columns** — Columns with many unique values

**Do NOT index:**
- Boolean columns (too few values to benefit)
- Small tables (< 10k rows)
- Columns rarely queried
- Columns with default=True (skewed distribution)

### Example Index Definition

```python
class Gameday(models.Model):
    # ... fields ...
    
    class Meta:
        indexes = [
            models.Index(fields=['date', 'league'], name='gameday_date_league_idx'),
            models.Index(fields=['status', '-created_at'], name='gameday_status_created_idx'),
        ]
```

---

## 4. Automated Query Checking

### Test Pattern: `assertNumQueries()`

**Every test that queries the database should assert expected query count:**

```python
from django.test import TestCase

class GamedayViewSetTest(TestCase):
    def test_list_gamedays_single_query(self):
        """Verify query optimization: all data in one SELECT."""
        # Setup: Create 10 gamedays with related objects
        for i in range(10):
            gameday = Gameday.objects.create(name=f"Gameday {i}")
            gameday.league = League.objects.create(name=f"League {i}")
            gameday.save()
        
        # Assert: Listing all gamedays should query once
        with self.assertNumQueries(1):
            response = self.client.get('/api/gamedays/')
            
        # Verify results
        self.assertEqual(response.status_code, 200)
        self.assertEqual(len(response.data), 10)
```

**Rules:**
1. Every list/retrieve endpoint test must include `assertNumQueries()`
2. Expected query count should be documented in the test docstring
3. Query count must NOT increase with result set size (e.g., 10 results = same queries as 1000 results)
4. If query count increases, it's an N+1 bug — fix before merging

### CI Integration: Query Count Validation

**Pytest plugin recommendation:**
```bash
pip install pytest-django pytest-querycount
```

**Test configuration (pytest.ini):**
```ini
[pytest]
DJANGO_SETTINGS_MODULE = league_manager.settings.test
addopts = --maxfail=5 --strict-markers --tb=short
```

**Automated check in tests:**
```python
# Add to conftest.py
import pytest
from django.test.utils import CaptureQueriesContext
from django.db import connection

@pytest.fixture(autouse=True)
def check_query_count():
    """Flag tests that exceed query limit."""
    with CaptureQueriesContext(connection) as context:
        yield
    
    # Warn if > 10 queries (adjust per test)
    if len(context) > 10:
        pytest.warns(
            UserWarning,
            f"Test exceeded query limit: {len(context)} queries"
        )
```

---

## 5. Performance Testing Checklist

Before marking a feature complete:

- [ ] **Query Optimization**
  - [ ] All relationships use `select_related()` or `prefetch_related()`
  - [ ] Tests include `assertNumQueries()` assertions
  - [ ] Query count is constant regardless of result set size
  
- [ ] **Index Coverage**
  - [ ] Frequently-filtered columns have indexes
  - [ ] Sort columns have indexes
  - [ ] No full-table scans on large tables
  
- [ ] **HTTP Caching**
  - [ ] Read-heavy endpoints use ETags
  - [ ] Cache invalidation is documented
  - [ ] Manual testing with browser DevTools confirms 304 responses
  
- [ ] **Response Size**
  - [ ] Typical response < 200 KB (use Django Silk or browser DevTools)
  - [ ] Unused fields removed from serializers
  - [ ] Nested serializers are 1-2 levels deep maximum

---

## 6. Code Review Checklist

When reviewing PRs, flag:

❌ **Red flags:**
- Endpoints without `select_related()` or `prefetch_related()`
- Tests without `assertNumQueries()` on database-touching code
- Loops inside serializers that access relationships (N+1 indicator)
- Missing indexes on frequently-filtered columns

✅ **Green flags:**
- Explicit query optimization with documented reasoning
- Tests verify query counts
- ETags on appropriate read endpoints
- Index strategy documented in migration

---

## References

- [Django QuerySet API Documentation](https://docs.djangoproject.com/en/6.0/ref/models/querysets/)
- [select_related() vs prefetch_related()](https://docs.djangoproject.com/en/6.0/ref/models/querysets/#select-related)
- [HTTP Conditional Requests (ETags)](https://developer.mozilla.org/en-US/docs/Web/HTTP/Conditional_requests)
- [Database Indexing Strategy](https://docs.djangoproject.com/en/6.0/ref/models/indexes/)
