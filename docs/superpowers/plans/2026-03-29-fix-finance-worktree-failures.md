# Fix Finance Worktree Test Failures Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix 12 failing tests and 4 undiscovered failing finance tests in the `feat-league-finances` worktree caused by two migration/model inconsistencies.

**Architecture:** Two independent root causes: (1) `finance/migrations/0004` removes `team_id` from `LeagueSeasonDiscount` but `models.py` still defines it — fix by deleting the migration; (2) `SeasonLeagueTeam.team` (FK) was replaced by `teams` (M2M) in migration `0028`, but three service files still use the old FK API — fix by updating all call sites to use the M2M `.teams.add()` / `.teams.all()` pattern.

**Tech Stack:** Django 5.2, pytest, SQLite (test env via `DJANGO_SETTINGS_MODULE=test_settings`)

**Run all tests with:** `DJANGO_SETTINGS_MODULE=test_settings python -m pytest --tb=short -q`

---

## Root Cause Summary

### RC-1: `finance_leagueseasondiscount.team_id` column missing

- `finance/migrations/0004_remove_leagueseasondiscount_team.py` removes `team` from `LeagueSeasonDiscount`
- `finance/models.py` **still defines** `team = models.ForeignKey(Team, ...)`
- `finance/services.py` and `finance/tests.py` both query and create discounts using the `team` field
- **Fix:** Delete migration `0004`. The model, service, and tests all expect the column. This migration was left behind from a previous "simplify to global discounts" refactor that was later reverted during a merge conflict resolution.

### RC-2: `SeasonLeagueTeam.team` FK → `teams` M2M

Migration `0028_remove_seasonleagueteam_team_seasonleagueteam_teams.py` (Dec 2025):
- Removed: `team = ForeignKey(Team)`
- Added: `teams = ManyToManyField(Team)`

Three service files and two test files still use the old FK API:

| File | Line(s) | Old (broken) | New (correct) |
|------|---------|--------------|---------------|
| `gamedays/service/schedule_resolution_service.py` | 79–82 | `get_or_create(team=team)` | `get_or_create(season, league)` + `.teams.add(team)` |
| `gameday_designer/service/template_application_service.py` | 299–302, 394–397 | `get_or_create(team=...)` | `get_or_create(season, league)` + `.teams.add(team)` |
| `finance/services.py` | 50, 54, 59 | `select_related('team')`, `slt.team` | `prefetch_related('teams')`, `for team in slt.teams.all()` |
| `finance/tests.py` | 30–31, 68 | `create(..., team=self.team1)` | `create(...)` then `.teams.add(self.team1)` |
| `gamedays/tests/service/test_schedule_resolution_season_league_team.py` | 114–115 | `values_list("team_id", flat=True)` | `values_list("teams", flat=True)` |

### RC-3: `finance/tests.py` not auto-discovered

`pytest.ini` pattern is `test_*.py *_test.py`. File named `tests.py` is never collected.
Fix: rename to `finance/test_finance.py`.

---

## File Map

| File | Action | Reason |
|------|--------|--------|
| `finance/migrations/0004_remove_leagueseasondiscount_team.py` | **Delete** | Inconsistent with model; column must exist |
| `gamedays/service/schedule_resolution_service.py` | Modify lines 79–84 | Update M2M API |
| `gameday_designer/service/template_application_service.py` | Modify lines 299–302 and 394–397 | Update M2M API (two call sites) |
| `finance/services.py` | Modify lines 50–62 | Update M2M iteration pattern |
| `finance/tests.py` → `finance/test_finance.py` | Rename + modify | Fix test discovery + M2M create pattern |

---

## Task 1: Delete the stale `0004` migration

**Files:**
- Delete: `finance/migrations/0004_remove_leagueseasondiscount_team.py`

- [ ] **Step 1: Confirm the model and migrations are inconsistent**

```bash
cd /home/cda/dev/leaguesphere/.worktrees/feat-league-finances
grep -n "team" finance/models.py
grep -n "RemoveField" finance/migrations/0004_remove_leagueseasondiscount_team.py
```

Expected: model defines `team = models.ForeignKey(...)`, migration removes it.

- [ ] **Step 2: Delete the migration file**

```bash
rm finance/migrations/0004_remove_leagueseasondiscount_team.py
```

- [ ] **Step 3: Run finance tests to confirm the `team_id` error disappears**

Note: finance tests use the old filename `tests.py` which is not auto-discovered. Run explicitly:

```bash
DJANGO_SETTINGS_MODULE=test_settings python -m pytest finance/tests.py --tb=short -q
```

Expected: `TypeError: SeasonLeagueTeam() got unexpected keyword arguments: 'team'` (RC-2, not RC-1 anymore).
The `no such column: finance_leagueseasondiscount.team_id` error must be **gone**.

- [ ] **Step 4: Commit**

```bash
git add -u finance/migrations/
git commit -m "fix(finance): remove stale migration that deleted team FK from LeagueSeasonDiscount"
```

---

## Task 2: Fix `SeasonLeagueTeam` M2M in `schedule_resolution_service.py`

**Files:**
- Modify: `gamedays/service/schedule_resolution_service.py:79-84`

The `SeasonLeagueTeam` model no longer has a `team` FK. It has a `teams` M2M. The correct pattern for registering a team is:
1. `get_or_create` by `(season, league)` — one record per league/season
2. `.teams.add(team)` — add team to the M2M set

- [ ] **Step 1: Run the failing test to confirm the error**

```bash
DJANGO_SETTINGS_MODULE=test_settings python -m pytest gamedays/tests/service/test_schedule_resolution_season_league_team.py --tb=short -q
```

Expected: `FieldError: Cannot resolve keyword 'team' into field. Choices are: id, league, league_id, season, season_id, teams`

- [ ] **Step 2: Fix the `get_or_create` call**

In `gamedays/service/schedule_resolution_service.py`, replace the block at lines 79–84:

```python
# OLD (broken):
SeasonLeagueTeam.objects.get_or_create(
    season=self.gameday.season,
    league=self.gameday.league,
    team=team,
)

# NEW (correct):
slt, _ = SeasonLeagueTeam.objects.get_or_create(
    season=self.gameday.season,
    league=self.gameday.league,
)
slt.teams.add(team)
```

- [ ] **Step 3: Fix the test assertion**

In `gamedays/tests/service/test_schedule_resolution_season_league_team.py`, line ~114, the assertion uses `values_list("team_id", flat=True)` which refers to the old FK. Replace:

```python
# OLD (broken):
registered_teams = set(
    SeasonLeagueTeam.objects.filter(
        season=self.season, league=self.league
    ).values_list("team_id", flat=True)
)

# NEW (correct):
registered_teams = set(
    SeasonLeagueTeam.objects.filter(
        season=self.season, league=self.league
    ).values_list("teams", flat=True)
)
```

- [ ] **Step 4: Run the test to confirm it passes**

```bash
DJANGO_SETTINGS_MODULE=test_settings python -m pytest gamedays/tests/service/test_schedule_resolution_season_league_team.py --tb=short -q
```

Expected: `1 passed`

- [ ] **Step 5: Commit**

```bash
git add gamedays/service/schedule_resolution_service.py gamedays/tests/service/test_schedule_resolution_season_league_team.py
git commit -m "fix(gamedays): update SeasonLeagueTeam registration to use M2M teams field"
```

---

## Task 3: Fix `SeasonLeagueTeam` M2M in `template_application_service.py`

**Files:**
- Modify: `gameday_designer/service/template_application_service.py:299-302` (official teams)
- Modify: `gameday_designer/service/template_application_service.py:394-397` (playing teams)

There are two separate `get_or_create(team=...)` call sites in this file, both with the same bug.

- [ ] **Step 1: Run the failing tests to confirm the errors**

```bash
DJANGO_SETTINGS_MODULE=test_settings python -m pytest gameday_designer/tests/test_template_application_service.py gameday_designer/tests/test_api.py --tb=line -q
```

Expected: 11 failures with `FieldError: Cannot resolve keyword 'team'`.

- [ ] **Step 2: Fix call site 1 (~line 299) — official team registration**

Replace:
```python
# OLD:
SeasonLeagueTeam.objects.get_or_create(
    season=self.gameday.season,
    league=self.gameday.league,
    team=official_team,
)

# NEW:
slt, _ = SeasonLeagueTeam.objects.get_or_create(
    season=self.gameday.season,
    league=self.gameday.league,
)
slt.teams.add(official_team)
```

- [ ] **Step 3: Fix call site 2 (~line 394) — playing team registration**

Replace:
```python
# OLD:
SeasonLeagueTeam.objects.get_or_create(
    season=self.gameday.season,
    league=self.gameday.league,
    team=team,
)

# NEW:
slt, _ = SeasonLeagueTeam.objects.get_or_create(
    season=self.gameday.season,
    league=self.gameday.league,
)
slt.teams.add(team)
```

- [ ] **Step 4: Run the tests to confirm all 11 pass**

```bash
DJANGO_SETTINGS_MODULE=test_settings python -m pytest gameday_designer/tests/test_template_application_service.py gameday_designer/tests/test_api.py --tb=short -q
```

Expected: `13 passed` (all previously failing + the 2 that were already passing).

- [ ] **Step 5: Commit**

```bash
git add gameday_designer/service/template_application_service.py
git commit -m "fix(gameday_designer): update SeasonLeagueTeam registration to use M2M teams field"
```

---

## Task 4: Fix `SeasonLeagueTeam` M2M in `finance/services.py` and rename/fix `finance/tests.py`

**Files:**
- Modify: `finance/services.py:50-62`
- Rename + Modify: `finance/tests.py` → `finance/test_finance.py`

### services.py changes

The season model iteration must change from iterating `SeasonLeagueTeam` rows (one per team, old FK design) to fetching the single `SeasonLeagueTeam` row for the league/season and iterating its M2M `.teams.all()`.

- [ ] **Step 1: Fix `finance/services.py` season model block (lines ~50–62)**

Replace:
```python
# OLD:
registered_teams = SeasonLeagueTeam.objects.filter(league=config.league, season=config.season).select_related('team')
live_participation_count = registered_teams.count()
for slt in registered_teams:
    team_gross = base_rate
    team_discount = cls._calculate_team_discounts(config, slt.team, team_gross)

    gross_total += team_gross
    discount_total += team_discount
    details.append({
        'team': slt.team,
        'gross': team_gross,
        'discount': team_discount,
        'net': team_gross - team_discount
    })

# NEW:
slt = SeasonLeagueTeam.objects.filter(
    league=config.league, season=config.season
).prefetch_related('teams').first()
registered_teams = slt.teams.all() if slt else []
live_participation_count = len(registered_teams)
for team in registered_teams:
    team_gross = base_rate
    team_discount = cls._calculate_team_discounts(config, team, team_gross)

    gross_total += team_gross
    discount_total += team_discount
    details.append({
        'team': team,
        'gross': team_gross,
        'discount': team_discount,
        'net': team_gross - team_discount
    })
```

### tests.py changes

`finance/tests.py` is not auto-discovered by pytest (wrong filename). Rename to `test_finance.py` and fix the `SeasonLeagueTeam` creation calls.

- [ ] **Step 2: Rename `finance/tests.py` to `finance/test_finance.py`**

```bash
git mv finance/tests.py finance/test_finance.py
```

- [ ] **Step 3: Fix `SeasonLeagueTeam.objects.create(team=...)` calls in `test_finance.py`**

There are three locations in `finance/test_finance.py`. Replace each `create(..., team=X)` with `create(...)` then `.teams.add(X)`.

**Location 1 — `test_calculate_costs_season_model` (~line 29):**
```python
# OLD:
SeasonLeagueTeam.objects.create(league=self.league, season=self.season, team=self.team1)
SeasonLeagueTeam.objects.create(league=self.league, season=self.season, team=self.team2)

# NEW:
slt = SeasonLeagueTeam.objects.create(league=self.league, season=self.season)
slt.teams.add(self.team1, self.team2)
```

**Location 2 — `test_calculate_costs_season_model` expected_teams_count:** Also add `expected_teams_count=2` to the config creation to ensure `expected_gross` is correct:
```python
config = LeagueSeasonFinancialConfig.objects.create(
    league=self.league,
    season=self.season,
    cost_model=LeagueSeasonFinancialConfig.MODEL_SEASON,
    expected_teams_count=2,
)
```

**Location 3 — `test_discounts_fixed_and_percent` (~line 68):**
```python
# OLD:
SeasonLeagueTeam.objects.create(league=self.league, season=self.season, team=self.team1)

# NEW:
slt = SeasonLeagueTeam.objects.create(league=self.league, season=self.season)
slt.teams.add(self.team1)
```

- [ ] **Step 4: Run the finance tests to confirm they all pass**

```bash
DJANGO_SETTINGS_MODULE=test_settings python -m pytest finance/test_finance.py --tb=short -q
```

Expected: `4 passed`

- [ ] **Step 5: Commit**

```bash
git add finance/services.py finance/test_finance.py
git commit -m "fix(finance): update SeasonLeagueTeam to use M2M teams field, rename tests for auto-discovery"
```

---

## Task 5: Full test suite verification

- [ ] **Step 1: Run the full test suite**

```bash
DJANGO_SETTINGS_MODULE=test_settings python -m pytest --tb=short -q
```

Expected: `0 failed` — all previously failing 12 tests pass, plus the 4 finance tests now auto-discovered.

- [ ] **Step 2: If any failures remain, investigate before fixing**

Each failure should be investigated with the systematic debugging process — read the error, trace the data flow, identify root cause before attempting any fix.

- [ ] **Step 3: Commit if any remaining fixes were needed**

```bash
git add <files>
git commit -m "fix: resolve remaining test failures after M2M SeasonLeagueTeam migration"
```

---

## Self-Review

### Spec Coverage

All 12 known failures are addressed:
- ✅ `gameday_designer/tests/test_api.py` (3) → Task 3
- ✅ `gameday_designer/tests/test_template_application_service.py` (8) → Task 3
- ✅ `gamedays/tests/service/test_schedule_resolution_season_league_team.py` (1) → Task 2
- ✅ 4 finance tests (undiscovered due to naming) → Tasks 1 + 4

### Type Consistency

- `slt.teams.all()` returns a QuerySet of `Team` objects — consistent with how `_calculate_team_discounts(config, team, base_amount)` and `details['team']` use them.
- `SeasonLeagueTeam.objects.get_or_create(season=..., league=...)` returns `(instance, created)` — unpacked as `slt, _` consistently across Tasks 2, 3, 4.
- `values_list("teams", flat=True)` on a M2M traversal returns the related `Team` PKs — consistent with comparing `.pk` values in the test assertion.
