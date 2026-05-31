# Infrastructure Performance Policy

## Purpose

Establish mandatory performance standards and automated checks to maintain LeagueSphere's infrastructure reliability and user experience. This policy ensures all code merged to production meets performance benchmarks.

---

## Policy Enforcement

### 1. Query Optimization (MANDATORY)

**Every database access must be optimized to prevent N+1 queries.**

#### Standard
- All API endpoints must use `select_related()` and `prefetch_related()` on all relationships
- Query count must NOT increase with result set size
- All tests must include `assertNumQueries()` verification

#### Enforcement
- **Code Review**: Reviewer flags missing query optimization (RED)
- **CI Checks**: Tests without `assertNumQueries()` on DB-touching code fail
- **Automated**: Pytest plugin warns if tests execute > expected queries

#### Rollout
- **Phase 1** (now): Document standards in [Performance Guide](performance-guide.md)
- **Phase 2** (sprint 2): Enable `assertNumQueries()` enforcement in CI
- **Phase 3** (sprint 3): Retrofit existing tests with query assertions

### 2. HTTP Caching via ETags (RECOMMENDED)

**Read-heavy endpoints should use ETags to reduce bandwidth.**

#### Standard
- Endpoints returning > 10 KB typical response should use `@condition(etag_func=...)`
- ETag should include query parameters and latest object PK
- Tests should verify HTTP 304 responses when ETag matches

#### Enforcement
- Code review suggests ETag for appropriate endpoints
- No automated CI check (too context-specific)
- Performance testing includes ETag verification

#### Examples
- ✅ Gameday list endpoint (typical 50-200 KB)
- ✅ League standings endpoint (heavy calculation)
- ❌ Game result update endpoint (write operation)
- ❌ Real-time score API (time-sensitive data)

### 3. Database Indexes (MANDATORY)

**Frequently-queried columns must have indexes.**

#### Standard
- Columns in `filter()`, `exclude()`, `order_by()` should be indexed
- Composite indexes for compound queries (e.g., `date` + `league`)
- Review indexes quarterly as query patterns evolve

#### Enforcement
- **Migration Review**: Reviewer checks indexes in new migrations
- **Query Analysis**: Slow query log reviewed monthly (operations)
- **Manual Testing**: Gameday list performance checked before releases

#### Process
```bash
# Before adding an index, verify it helps:
EXPLAIN SELECT * FROM gamedays WHERE date = '2026-05-31';

# Add index in migration:
class Migration(migrations.Migration):
    operations = [
        migrations.AddIndex(
            model_name='gameday',
            index=models.Index(fields=['date', 'league'], name='gameday_date_league_idx'),
        ),
    ]
```

---

## Implementation Checklist

### For Every Feature
- [ ] Query optimization complete (see Performance Guide)
- [ ] Tests include `assertNumQueries()` assertions
- [ ] No N+1 queries (query count stable across scales)
- [ ] Appropriate endpoints have ETag caching
- [ ] Database indexes added for new query patterns
- [ ] Response payload < 200 KB typical size

### For Code Review
- [ ] All relationships have `select_related()` or `prefetch_related()`
- [ ] Tests verify query count with `assertNumQueries()`
- [ ] No loops iterating over `queryset` inside views (N+1 indicator)
- [ ] Database migrations include index analysis

### For Release
- [ ] Performance testing passes (< baseline query counts)
- [ ] ETag caching working (manual test with browser DevTools)
- [ ] No new slow queries in monitoring dashboards
- [ ] Database indexes applied and verified on production

---

## Automated Query Checking

### Setup

Query checking is enabled via pytest plugin in `conftest.py`:

```python
from conftest import assertNumQueries

# In your test:
with assertNumQueries(1):  # Verify exactly 1 query
    response = self.client.get('/api/gamedays/')
```

### Available Markers

```python
# Skip query check for this test (document why!)
@pytest.mark.skip_query_check
def test_expensive_operation():
    ...

# Mark as high-query test (expected > normal)
@pytest.mark.high_query_count
def test_complex_calculation():
    ...
```

### CI Integration

Tests are run with query counting enabled:

```bash
# Local development
pytest --strict-markers

# CI pipeline
pytest --maxfail=5 --tb=short
# Fails if assertNumQueries() assertions don't match
```

---

## Monitoring & Alerts

### Production Monitoring

**Grafana Dashboard: API Performance**
- Query count per endpoint
- Response time percentiles (p50, p95, p99)
- HTTP cache hit rate (ETag 304 responses)

**CloudSQL Monitoring**
- Slow query log (queries > 1 second)
- Index usage statistics
- Database connection pool utilization

### Alert Thresholds

- 🔴 **CRITICAL**: Single endpoint > 20 queries
- 🟠 **WARNING**: Response time p95 > 500ms
- 🟡 **INFO**: Cache hit rate < 80% (investigate)

---

## References

- [Performance Guide](performance-guide.md) — Detailed optimization patterns
- [Contributor Guide](contributor-guide.md) — Testing and QA standards
- [Code Review Standards](../review-standards.md) — What reviewers check
- [Django Query Optimization](https://docs.djangoproject.com/en/6.0/topics/db/optimization/) — Official docs
