# Gameday Designer Creation Method Adoption Metrics — Design Spec

**Date:** 2026-06-17  
**Feature:** Gameday Designer adoption tracking by creation method (designer vs legacy)  
**Status:** Design approved, ready for implementation plan

---

## Executive Summary

Currently, the Journey Dashboard's AdoptionMetrics component tracks feature usage (opens, publishes, publish rate) but lacks visibility into **actual game creation methods**. This spec adds metrics to show how many games were created via the gameday designer vs the legacy method, with per-league adoption breakdown.

**Key insight from production data:** Only 9.1% of games created in the last 30 days used the designer (12 designer vs 120 legacy), concentrated in 2 leagues (FF BL: 8 games, AFVH_U13: 4 games).

---

## Requirements

### Functional Requirements

1. **Games Created Metric Card**
   - Display designer vs legacy game counts across 3 time windows: Last 7 days, Last 30 days, Last 90 days
   - Show percentage adoption for selected window
   - Allow users to toggle between time windows via tabs
   - Display as visual card with color coding (designer: green, legacy: gray)

2. **League Adoption Breakdown Card**
   - Expandable/collapsible detail view of per-league adoption
   - Show all leagues (not just high-adoption ones) to identify adoption gaps
   - Display: League Name | Designer Games | Legacy Games | % Designer Created
   - Apply visual indicators: green for adoption 25%+, orange for 10-25%, gray for <10%
   - Sortable by any column
   - Support time window filtering (shows data for selected window in Games Created card)

3. **Data Source**
   - Query `Gameday` table, checking for related `GamedayDesignerState` record
   - Aggregate by time window (last 7, 30, 90 days)
   - Aggregate by league
   - Calculate percentages client-side or server-side (TBD in implementation plan)

### Non-Functional Requirements

- Data freshness: Updated on each dashboard load (no real-time updates required)
- Performance: Endpoint response <500ms for all leagues and time windows
- Caching: Use ETags or HTTP caching to avoid redundant queries
- Accessibility: Support keyboard navigation, screen readers for expandable sections

---

## Architecture

### API Design

**New Endpoint:**
```
GET /api/journey/gameday-creation-stats/
```

**Query Parameters:**
- `days` (optional): Comma-separated list (default: "7,30,90")
- `league` (optional): Filter by league name
- `season` (optional): Filter by season name

**Response Format:**
```json
{
  "summary": {
    "7": {
      "designer": 2,
      "legacy": 18,
      "total": 20,
      "designer_percentage": 10.0
    },
    "30": {
      "designer": 12,
      "legacy": 120,
      "total": 132,
      "designer_percentage": 9.1
    },
    "90": {
      "designer": 45,
      "legacy": 380,
      "total": 425,
      "designer_percentage": 10.6
    }
  },
  "by_league": {
    "7": [
      {
        "league_name": "FF BL",
        "league_id": 5,
        "designer": 2,
        "legacy": 0,
        "total": 2,
        "designer_percentage": 100.0
      },
      {
        "league_name": "Bayern U16",
        "league_id": 12,
        "designer": 0,
        "legacy": 8,
        "total": 8,
        "designer_percentage": 0.0
      }
      // ... additional leagues
    ],
    "30": [ /* same structure */ ],
    "90": [ /* same structure */ ]
  }
}
```

**Implementation Notes:**
- Query joins `Gameday` with `GamedayDesignerState` using LEFT JOIN
- Filter by `date >= NOW() - INTERVAL X DAY` for each time window
- Group by league, aggregate counts
- Return all leagues (no filtering)
- Cache with ETag based on latest gameday pk + query parameters

---

## UI/UX Design

### Component Layout

**Location:** AdoptionMetrics component, Gameday Designer section

**New Cards Added:**

1. **Games Created Card**
   ```
   ┌─────────────────────────────────────┐
   │ Games Created (Designer vs Legacy)  │
   ├─────────────────────────────────────┤
   │ [Last 7 Days] [Last 30 Days] [Last 90 Days]
   ├─────────────────────────────────────┤
   │ Designer:  12 games (9.1%)  [green] │
   │ Legacy:   120 games (90.9%) [gray]  │
   │                                     │
   │ [Expand] View League Breakdown      │
   └─────────────────────────────────────┘
   ```

2. **League Adoption Breakdown Card** (expandable)
   ```
   ┌─────────────────────────────────────────────────────┐
   │ Adoption by League                                  │
   ├─────────────────────────────────────────────────────┤
   │ League          │ Designer │ Legacy │ % Designer   │
   ├─────────────────────────────────────────────────────┤
   │ FF BL           │    8     │   0    │ 100% [green] │
   │ AFVH_U13        │    4     │   0    │ 100% [green] │
   │ Bayern U16      │    0     │  20    │   0% [gray]  │
   │ OL NRW          │    0     │  15    │   0% [gray]  │
   │ RL_Ost          │    0     │  13    │   0% [gray]  │
   │ ... (16 more leagues)                               │
   └─────────────────────────────────────────────────────┘
   ```

### Visual Indicators

**Color Scheme:**
- **Green** (high adoption): 25%+ designer games
- **Orange** (medium adoption): 10-25% designer games
- **Gray** (low/no adoption): <10% designer games

**Styling:**
- Apply color to background bar or text indicator (consistent with existing metric cards)
- Sort league table by designer percentage descending (high adoption first)

### Interaction Patterns

**Time Window Tabs:**
- Clicking a tab updates both the Games Created card and reloads League Breakdown for that window
- Active tab is highlighted
- Default: Last 30 days

**Expandable Breakdown:**
- Chevron icon indicates expand/collapse state
- Click anywhere on the card header to toggle
- Animation: smooth slide-down expansion (200ms)
- State persists for the dashboard session (not across page reloads)

---

## Data Mapping

### How Designer Games Are Identified

Games created via gameday designer are identified by the presence of a `GamedayDesignerState` record:
```python
# Designer created
Gameday.objects.filter(designer_state__isnull=False)

# Legacy created
Gameday.objects.filter(designer_state__isnull=True)
```

### Integration with Existing Metrics

The new "Games Created" card sits alongside existing Gameday Designer metrics in the same feature section:

**Current metrics:**
- Opens (feature usage)
- Published (successful publishes)
- Publish Rate (success rate)
- Templates (template usage)

**New metrics:**
- Games Created Designer (via designer)
- Games Created Legacy (legacy method)
- Designer % (adoption percentage)

These are complementary:
- **Opens/Published** = usage funnel (do users complete publishing?)
- **Games Created Designer/Legacy** = actual adoption (are published games actually from designer?)

---

## Implementation Scope

### Backend Tasks
1. Create `GameCreationStatsViewSet` in `/journey/api/`
2. Implement query logic with time window filtering and league aggregation
3. Add ETag caching based on latest gameday pk
4. Write tests for accuracy of designer/legacy classification across time windows

### Frontend Tasks
1. Create `GameCreationStats` component (main metric card with tabs)
2. Create `LeagueAdoptionBreakdown` component (expandable table)
3. Add `fetchGameCreationStats()` to API utility
4. Update `AdoptionMetrics` component to include new cards
5. Write tests for component rendering and time window switching

### Design Tokens/CSS
- Reuse existing color scheme (green: #0d6efd, gray: #6c757d)
- Add new table styles for league breakdown
- Add chevron animation for expand/collapse

---

## Testing Strategy

### Unit Tests
- Verify query logic returns correct designer/legacy split per time window
- Verify per-league aggregation accuracy
- Verify percentage calculations
- Test edge cases: no games in window, all designer, all legacy, single league

### Integration Tests
- Test API endpoint with various query parameters
- Test ETag caching invalidation
- Test with multiple leagues and time windows

### E2E Tests (dashboard)
- Load dashboard, verify Games Created card displays
- Toggle time windows, verify data updates
- Expand/collapse League Breakdown
- Verify color indicators match adoption percentages

---

## Success Criteria

✅ New endpoint `/api/journey/gameday-creation-stats/` returns accurate designer vs legacy breakdown  
✅ Games Created card displays on dashboard with time window tabs  
✅ League Adoption Breakdown shows all leagues with correct adoption percentages  
✅ Visual indicators (green/orange/gray) reflect adoption levels  
✅ All tests pass (unit, integration, E2E)  
✅ Response time <500ms, ETag caching working  
✅ Accessibility standards met (keyboard nav, screen reader compatible)

---

## Open Questions / TBD

- Should adoption metrics be admin-only or visible to all authenticated users? (TBD during implementation)
- Should we add a "Adoption Trend" mini-chart showing 7/30/90 comparison? (Nice-to-have, defer for now)
- Should per-league data be sortable by any column? (Yes, implement as part of table)

---

## References

- Production data query: Last 30 days shows 12 designer, 120 legacy (9.1% adoption)
- Per-league breakdown: Only FF BL (8) and AFVH_U13 (4) using designer
- Existing AdoptionMetrics: `/journey_dashboard/src/components/AdoptionMetrics.tsx`
- Gameday model: `/gamedays/models.py` (Gameday, GamedayDesignerState)
