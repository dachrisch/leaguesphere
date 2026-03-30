# Finance Dashboard Improvements — Design Spec

**Date:** 2026-03-19
**Branch:** feat-league-finances
**Status:** Approved

---

## Overview

A set of improvements to the Finance module covering UX fixes, a pending-configurations feature, discounts layout restructure, and dummy-team filtering in cost calculations.

---

## 1. Dashboard: Card Header & Table Header Styling

**Problem:** Card headers show white text correctly, but table `<thead>` rows use `bg-light` which appears as black text directly below the colored card header — inconsistent.

**Fix:**
- All `<thead>` rows: change to light grey (`background: #e9ecef; color: #495057`).
- Active configs card header: change from `bg-primary` (dark blue) to light blue (`background: #cfe2ff; color: #084298`).
- Pending configs card header: change from `bg-warning` (dark yellow) to light yellow (`background: #fff3cd; color: #664d03`). Badge inside also updated to match.

---

## 2. Dashboard: Pending Configurations Section

**Problem:** Admins have no indication when a league/season has gamedays but no finance config.

**Solution:** Add a "Pending" section below the active configs table listing every league/season combination that has at least one `Gameday` but no corresponding `LeagueSeasonFinancialConfig`.

**Backend (`views.py`):** `FinanceDashboardView.get_context_data` computes pending entries and annotates each with a gameday count and unique-team count. To avoid a heavy N+1 query loop, compute team counts by aggregating `Gameresult` in a single pass rather than calling `get_participation_data` per entry:

```python
from django.db.models import Count
from gamedays.models import Gameday, Gameresult

configured = set(
    LeagueSeasonFinancialConfig.objects.values_list('league_id', 'season_id')
)
combos = Gameday.objects.values('league', 'league__name', 'season', 'season__name').annotate(
    gameday_count=Count('id')
)

pending = []
for c in combos:
    if (c['league'], c['season']) not in configured:
        team_ids = set(
            Gameresult.objects
            .filter(gameinfo__gameday__league=c['league'], gameinfo__gameday__season=c['season'])
            .exclude(team__location='dummy')
            .values_list('team', flat=True)
        ) - {None}
        pending.append({
            'league_id': c['league'],
            'league_name': c['league__name'],
            'season_id': c['season'],
            'season_name': c['season__name'],
            'gameday_count': c['gameday_count'],
            'team_count': len(team_ids),
        })

context['pending_configs'] = pending
```

**Template:** Yellow card header (`⚠ Unconfigured League/Seasons`), light-grey thead, normal rows. Columns: League/Season, Gameday count, Teams in games, Action.

The "+ Create Config" button links to `{% url 'finance-config-add' %}?league={{ item.league_id }}&season={{ item.season_id }}` so the form pre-fills.

If `pending_configs` is empty, the pending section is hidden entirely.

---

## 3. Create Page: Match Edit Page Layout + Pre-fill Support

**Problem:** The create form is a plain single-column layout missing the default base rate hint and uses a different structure from the edit page.

**Changes to `config_form.html`:**
- Adopt the two-column layout from `config_detail.html`: cost model full-width, then base rate + discounts on the left, planning targets on the right.
- Add league and season dropdowns at the top in a two-column row (these are not shown on the edit page which displays them as read-only heading text).
- Show "System Default" hint below the base rate field. Since there are two defaults (`default_rate_per_team_season` and `default_rate_per_team_gameday`), show both and switch the visible one via the same JS that toggles planning-target fields:
  - When SEASON model selected → show `default_rate_season`
  - When GAMEDAY model selected → show `default_rate_gameday`

**Backend (`views.py`):** `ConfigCreateView` overrides `get_context_data` to pass both defaults:
```python
settings = FinanceService.get_global_defaults()
context['default_rate_season'] = settings.default_rate_per_team_season
context['default_rate_gameday'] = settings.default_rate_per_team_gameday
```

Override `get_form_kwargs` (not `get_context_data`) to pre-fill league and season from query params:
```python
def get_form_kwargs(self):
    kwargs = super().get_form_kwargs()
    kwargs['initial'] = {
        'league': self.request.GET.get('league'),
        'season': self.request.GET.get('season'),
    }
    return kwargs
```

---

## 4. Discounts: Remove Per-Team Targeting, Move to Config Form

**Problem:** Discounts have a "Target Team" field making them per-team. The user wants discounts to be per-configuration only. The discount section is also far from the base rate.

**Changes:**

**Model (`models.py`):**
- Remove `team` FK from `LeagueSeasonDiscount`.
- Update `__str__` to remove the `self.team` reference (e.g. `return f"{self.discount_type} {self.value} – {self.config}"`).

**Migration:** New migration to drop the `team` column. Note: any existing discount records with a non-null `team` will silently lose that association. This is acceptable since the feature is new/in-progress.

**Service (`services.py`):**
- Remove `_calculate_team_discounts` entirely.
- In `calculate_costs`, for the SEASON model's `details` list, set `discount: 0` and `net: gross` per team (since there are no longer per-team discounts). The GAMEDAY model path has no per-team details list and remains `details: None` — no change needed there.
- Apply all config discounts globally to the gross total at the end. The existing block at lines 88–96 does this, but it currently filters with `config.discounts.filter(team=None)`. After the `team` field is removed, this **must** change to `config.discounts.all()` — otherwise Django will raise a `FieldError` at runtime.

**Form (`forms.py`):** Remove `team` from `DiscountForm` fields.

**Template (`config_detail.html`):** Move the Discounts & Grants section inside the base rate field box (left column). Remove the "Target Team" table column and badge. Inline add-discount form shows: Type, Value, Description, + Add button.

---

## 5. Dummy Team Filtering

**Problem:** Placeholder teams (e.g. "Gewinner Spiel 4") have `location = "dummy"` (exact value, per project convention in `team_repository_service.py`). These inflate team counts.

**Fix:** In `FinanceService.get_participation_data`, use exact-match excludes consistent with the rest of the codebase:

```python
playing_teams = set(
    Gameresult.objects
    .filter(gameinfo__gameday=gameday)
    .exclude(team__location='dummy')
    .values_list('team', flat=True)
)
officiating_teams = set(
    Gameinfo.objects
    .filter(gameday=gameday)
    .exclude(officials__location='dummy')
    .values_list('officials', flat=True)
)
```

---

## 6. Git Commit (First)

Before all of the above: commit the already-implemented fix (season-model team counting from actual games instead of `SeasonLeagueTeam`).

---

## Files to Change

| File | Changes |
|---|---|
| `finance/services.py` | Dummy team filter (exact `location='dummy'`); remove `_calculate_team_discounts`; simplify discount application |
| `finance/models.py` | Remove `team` FK from `LeagueSeasonDiscount`; update `__str__` |
| `finance/migrations/` | New migration for `team` field removal |
| `finance/forms.py` | Remove `team` from `DiscountForm` |
| `finance/views.py` | Pending configs in dashboard context; `get_form_kwargs` + `get_context_data` override in `ConfigCreateView` |
| `finance/templates/finance/dashboard.html` | Header colours; pending section |
| `finance/templates/finance/config_form.html` | Edit-style two-column layout; league/season dropdowns; dual default-rate hint with JS toggle |
| `finance/templates/finance/config_detail.html` | Move discounts inline to base rate column; remove team column |
| `finance/tests.py` | Update/add tests for: dummy-team filtering, pending configs logic, simplified discount calculation |

---

## Out of Scope

- No changes to the gameday or team models.
- No changes to authentication or permissions.
- No new URL routes beyond query-param support on the existing create URL.
