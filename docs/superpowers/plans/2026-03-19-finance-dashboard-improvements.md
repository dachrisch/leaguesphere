# Finance Dashboard Improvements Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Improve the Finance module with pending-config detection, dummy-team filtering, per-config discounts, a redesigned create form, and visual polish.

**Architecture:** All changes are within the `finance` app in the `feat-league-finances` worktree at `/home/cda/dev/leaguesphere/.worktrees/feat-league-finances`. Backend in `finance/services.py`, `finance/models.py`, `finance/views.py`, `finance/forms.py`; templates in `finance/templates/finance/`. Tests in `finance/tests.py`.

**Tech Stack:** Django 6, Bootstrap 5, crispy-forms, pytest-django (SQLite via `test_settings`). Run tests with: `python -m pytest finance/tests.py --ds=test_settings -v`

---

## File Map

| File | What changes |
|---|---|
| `finance/services.py` | Dummy-team filter; remove `_calculate_team_discounts`; change `filter(team=None)` → `all()` |
| `finance/models.py` | Remove `team` FK from `LeagueSeasonDiscount`; update `__str__` |
| `finance/migrations/0004_remove_leagueseasondiscount_team.py` | Migration for field removal |
| `finance/forms.py` | Remove `team` from `DiscountForm` |
| `finance/views.py` | `FinanceDashboardView`: pending configs context; `ConfigCreateView`: `get_form_kwargs` + default rates |
| `finance/templates/finance/dashboard.html` | Header colours; pending section |
| `finance/templates/finance/config_form.html` | Two-column layout; league/season; dual default-rate hint with JS |
| `finance/templates/finance/config_detail.html` | Move discounts into base-rate column; remove team column |
| `finance/tests.py` | Fix existing 2 failing tests; add tests for dummy filter, pending logic, simplified discounts |

---

## Task 0: Commit the already-implemented season-model fix

The change to `finance/services.py` (lines 51–65) that counts teams from actual game results instead of `SeasonLeagueTeam` is already in place but uncommitted.

- [ ] **Step 1: Verify the change is present and unstaged**

```bash
cd /home/cda/dev/leaguesphere/.worktrees/feat-league-finances
git diff finance/services.py
```

Expected: shows the replacement of `SeasonLeagueTeam` query with `get_participation_data` aggregation.

- [ ] **Step 2: Commit**

```bash
git add finance/services.py
git commit -m "fix(finance): count season-model teams from actual game data instead of SeasonLeagueTeam

Teams are now sourced from Gameresult/Gameinfo for the flat-season model,
removing the requirement for explicit SeasonLeagueTeam registration.

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

## Task 1: Fix the two failing tests (season model now uses game data)

The existing tests `test_calculate_costs_season_model` and `test_discounts_fixed_and_percent` use `SeasonLeagueTeam` to register teams, but the service now reads from game results. Rewrite them to create actual gameday/game data instead.

**Files:** `finance/tests.py`

- [ ] **Step 1: Run tests to confirm the two failures**

```bash
python -m pytest finance/tests.py --ds=test_settings -v
```

Expected: `test_calculate_costs_season_model` FAIL, `test_discounts_fixed_and_percent` FAIL, two others PASS.

- [ ] **Step 2: Rewrite `test_calculate_costs_season_model`**

In `finance/tests.py`, replace the test body (it currently creates `SeasonLeagueTeam` records):

```python
def test_calculate_costs_season_model(self):
    config = LeagueSeasonFinancialConfig.objects.create(
        league=self.league,
        season=self.season,
        cost_model=LeagueSeasonFinancialConfig.MODEL_SEASON
    )
    gameday = Gameday.objects.create(
        name="Gameday 1", league=self.league, season=self.season,
        date="2026-03-15", start="10:00", author=self.user
    )
    gi = Gameinfo.objects.create(
        gameday=gameday, scheduled="10:00", field=1,
        officials=self.team2, stage="Main", standing="P1"
    )
    Gameresult.objects.create(gameinfo=gi, team=self.team1, isHome=True)

    costs = FinanceService.calculate_costs(config)
    # team1 plays, team2 officials → 2 unique teams × 100.00
    self.assertEqual(costs['gross'], Decimal("200.00"))
    self.assertEqual(costs['net'], Decimal("200.00"))
```

- [ ] **Step 3: Rewrite `test_discounts_fixed_and_percent`**

Replace to use game data and global-only discounts (no per-team `team=` field):

```python
def test_discounts_fixed_and_percent(self):
    config = LeagueSeasonFinancialConfig.objects.create(
        league=self.league,
        season=self.season,
        cost_model=LeagueSeasonFinancialConfig.MODEL_SEASON,
        base_rate_override=Decimal("100.00")
    )
    gameday = Gameday.objects.create(
        name="Gameday 1", league=self.league, season=self.season,
        date="2026-03-15", start="10:00", author=self.user
    )
    gi = Gameinfo.objects.create(
        gameday=gameday, scheduled="10:00", field=1,
        officials=self.team2, stage="Main", standing="P1"
    )
    Gameresult.objects.create(gameinfo=gi, team=self.team1, isHome=True)

    # Fixed global discount
    LeagueSeasonDiscount.objects.create(
        config=config,
        team=None,
        discount_type=LeagueSeasonDiscount.TYPE_FIXED,
        value=Decimal("10.00")
    )
    # Percent global discount
    LeagueSeasonDiscount.objects.create(
        config=config,
        team=None,
        discount_type=LeagueSeasonDiscount.TYPE_PERCENTAGE,
        value=Decimal("10.00")
    )

    costs = FinanceService.calculate_costs(config)
    # Gross = 2 teams × 100 = 200
    # Fixed discount = 10
    # Percent discount = 10% of 200 = 20
    # Total discount = 30, net = 170
    self.assertEqual(costs['gross'], Decimal("200.00"))
    self.assertEqual(costs['discount'], Decimal("30.00"))
    self.assertEqual(costs['net'], Decimal("170.00"))
```

- [ ] **Step 4: Run tests**

```bash
python -m pytest finance/tests.py --ds=test_settings -v
```

Expected: all 4 pass.

- [ ] **Step 5: Commit**

```bash
git add finance/tests.py
git commit -m "test(finance): update season-model tests to use game data instead of SeasonLeagueTeam

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

## Task 2: Filter dummy teams from participation data

Teams used as schedule placeholders have `location='dummy'` (exact, per project convention). Exclude them from `get_participation_data` so they don't inflate team counts.

**Files:** `finance/services.py`, `finance/tests.py`

- [ ] **Step 1: Write failing test**

Add to `FinanceServiceTest` in `finance/tests.py`:

```python
def test_dummy_teams_excluded_from_participation(self):
    dummy_team = Team.objects.create(
        name="Gewinner Spiel 4", description="", location="dummy"
    )
    config = LeagueSeasonFinancialConfig.objects.create(
        league=self.league,
        season=self.season,
        cost_model=LeagueSeasonFinancialConfig.MODEL_SEASON,
        base_rate_override=Decimal("100.00")
    )
    gameday = Gameday.objects.create(
        name="Gameday 1", league=self.league, season=self.season,
        date="2026-03-15", start="10:00", author=self.user
    )
    # real team plays, dummy team officiates
    gi = Gameinfo.objects.create(
        gameday=gameday, scheduled="10:00", field=1,
        officials=dummy_team, stage="Main", standing="P1"
    )
    Gameresult.objects.create(gameinfo=gi, team=self.team1, isHome=True)

    costs = FinanceService.calculate_costs(config)
    # Only team1 counts (dummy officiating team excluded)
    self.assertEqual(costs['live_participation_count'], 1)
    self.assertEqual(costs['gross'], Decimal("100.00"))
```

- [ ] **Step 2: Run test to confirm it fails**

```bash
python -m pytest finance/tests.py::FinanceServiceTest::test_dummy_teams_excluded_from_participation --ds=test_settings -v
```

Expected: FAIL — dummy team is counted, gross is 200.00.

- [ ] **Step 3: Update `get_participation_data` in `finance/services.py`**

Replace lines 19–28 (the two set queries) with:

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

- [ ] **Step 4: Run all tests**

```bash
python -m pytest finance/tests.py --ds=test_settings -v
```

Expected: all 5 pass.

- [ ] **Step 5: Commit**

```bash
git add finance/services.py finance/tests.py
git commit -m "feat(finance): exclude dummy placeholder teams from participation counts

Teams with location='dummy' are schedule placeholders (e.g. 'Gewinner Spiel 4')
and should not be counted or charged.

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

## Task 3: Remove per-team discounts — model, migration, form, service

Remove the `team` FK from `LeagueSeasonDiscount`. All discounts are now global to the config.

**Files:** `finance/models.py`, `finance/forms.py`, `finance/services.py`, `finance/tests.py`, new migration `0004`

- [ ] **Step 1: Write failing test**

Add to `finance/tests.py`:

```python
def test_discount_has_no_team_field(self):
    """Discounts are per-config, not per-team."""
    config = LeagueSeasonFinancialConfig.objects.create(
        league=self.league, season=self.season,
        cost_model=LeagueSeasonFinancialConfig.MODEL_SEASON,
        base_rate_override=Decimal("50.00")
    )
    # Should be creatable without a team argument
    discount = LeagueSeasonDiscount(
        config=config,
        discount_type=LeagueSeasonDiscount.TYPE_FIXED,
        value=Decimal("5.00"),
        description="Early bird"
    )
    # team field should not exist
    self.assertFalse(hasattr(discount, 'team'))
```

- [ ] **Step 2: Run test to confirm it fails**

```bash
python -m pytest finance/tests.py::FinanceServiceTest::test_discount_has_no_team_field --ds=test_settings -v
```

Expected: FAIL — `hasattr(discount, 'team')` is True.

- [ ] **Step 3: Update `LeagueSeasonDiscount` in `finance/models.py`**

Remove the `team` FK (lines 63–65) and update `__str__`:

```python
class LeagueSeasonDiscount(models.Model):
    """Discount applied globally to a league/season configuration."""
    TYPE_FIXED = 'FIXED'
    TYPE_PERCENTAGE = 'PERCENT'
    DISCOUNT_TYPE_CHOICES = [
        (TYPE_FIXED, 'Fixed Amount'),
        (TYPE_PERCENTAGE, 'Percentage'),
    ]

    config = models.ForeignKey(LeagueSeasonFinancialConfig, on_delete=models.CASCADE, related_name='discounts')
    discount_type = models.CharField(max_length=10, choices=DISCOUNT_TYPE_CHOICES, default=TYPE_FIXED)
    value = models.DecimalField(max_digits=10, decimal_places=2)
    description = models.CharField(max_length=255, blank=True)

    def __str__(self):
        return f"{self.discount_type} {self.value} – {self.config}"
```

- [ ] **Step 4: Generate migration**

```bash
python manage.py makemigrations finance --name remove_leagueseasondiscount_team --settings=test_settings
```

Expected: creates `finance/migrations/0004_remove_leagueseasondiscount_team.py`.

- [ ] **Step 5: Update `DiscountForm` in `finance/forms.py`**

Change the `fields` list (remove `'team'`):

```python
class DiscountForm(forms.ModelForm):
    class Meta:
        model = LeagueSeasonDiscount
        fields = ['discount_type', 'value', 'description']
```

Also remove the `from gamedays.models import Team` import if it is only used for the form (check — if it's used elsewhere in the file, leave it).

- [ ] **Step 6: Simplify `calculate_costs` in `finance/services.py`**

**6a.** Remove `_calculate_team_discounts` entirely (lines 109–119).

**6b.** In the `MODEL_SEASON` branch, update the per-team details loop to zero out discount (since all discounts are now global):

```python
for team in Team.objects.filter(id__in=all_team_ids):
    team_gross = base_rate
    gross_total += team_gross
    details.append({
        'team': team,
        'gross': team_gross,
        'discount': Decimal('0'),
        'net': team_gross,
    })
```

**6c.** In the `MODEL_GAMEDAY` branch, remove the per-team discount loop (lines 77–79):

```python
for p in participation_data:
    gameday_gross = p['team_count'] * base_rate
    live_participation_count += p['team_count']
    gross_total += gameday_gross
```

**6d.** Change the global-discount filter from `filter(team=None)` to `all()`:

```python
global_discounts = config.discounts.all()
```

**6e.** Remove the `from gamedays.models import ... SeasonLeagueTeam` import — `SeasonLeagueTeam` is no longer used.

- [ ] **Step 7: Update `test_gameday_model_team_discount` in `finance/tests.py`**

This test creates a per-team discount which no longer exists. Rewrite it to test a global discount on the gameday model instead:

```python
def test_gameday_model_global_discount(self):
    config = LeagueSeasonFinancialConfig.objects.create(
        league=self.league,
        season=self.season,
        cost_model=LeagueSeasonFinancialConfig.MODEL_GAMEDAY,
        base_rate_override=Decimal("20.00")
    )
    gameday = Gameday.objects.create(
        name="Gameday 1", league=self.league, season=self.season,
        date="2026-03-15", start="10:00", author=self.user
    )
    gi = Gameinfo.objects.create(
        gameday=gameday, scheduled="10:00", field=1,
        officials=self.team2, stage="Main", standing="P1"
    )
    Gameresult.objects.create(gameinfo=gi, team=self.team1, isHome=True)

    LeagueSeasonDiscount.objects.create(
        config=config,
        discount_type=LeagueSeasonDiscount.TYPE_FIXED,
        value=Decimal("5.00")
    )

    costs = FinanceService.calculate_costs(config)
    # Gross = 2 teams × 20 = 40; fixed discount = 5; net = 35
    self.assertEqual(costs['gross'], Decimal("40.00"))
    self.assertEqual(costs['discount'], Decimal("5.00"))
    self.assertEqual(costs['net'], Decimal("35.00"))
```

Also rename the method from `test_gameday_model_team_discount` to `test_gameday_model_global_discount`.

- [ ] **Step 8: Run all tests**

```bash
python -m pytest finance/tests.py --ds=test_settings -v
```

Expected: all 6 pass.

- [ ] **Step 9: Commit**

```bash
git add finance/models.py finance/migrations/0004_remove_leagueseasondiscount_team.py \
        finance/forms.py finance/services.py finance/tests.py
git commit -m "feat(finance): remove per-team discounts, simplify to per-config global discounts

Discounts are now global to a finance config. Removes LeagueSeasonDiscount.team FK,
_calculate_team_discounts helper, and associated form field. Discounts apply
once to the gross total via config.discounts.all().

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

## Task 4: Dashboard — header colours + pending configurations section

**Files:** `finance/views.py`, `finance/templates/finance/dashboard.html`

- [ ] **Step 1: Add pending configs to dashboard context in `finance/views.py`**

In `FinanceDashboardView.get_context_data`, after computing `configs_with_stats`, add:

```python
from django.db.models import Count
from gamedays.models import Gameday, Gameresult

configured = set(
    LeagueSeasonFinancialConfig.objects.values_list('league_id', 'season_id')
)
combos = Gameday.objects.values(
    'league', 'league__name', 'season', 'season__name'
).annotate(gameday_count=Count('id'))

pending = []
for c in combos:
    if (c['league'], c['season']) not in configured:
        team_ids = set(
            Gameresult.objects
            .filter(
                gameinfo__gameday__league=c['league'],
                gameinfo__gameday__season=c['season']
            )
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

Place the imports at the top of `views.py` (add `Count` from `django.db.models` and `Gameresult` from `gamedays.models` if not already imported).

- [ ] **Step 2: Update `dashboard.html` — header colours**

Find the active configs card header (line 69):
```html
<div class="card-header bg-primary text-white d-flex justify-content-between align-items-center py-3">
```
Change to:
```html
<div class="card-header d-flex justify-content-between align-items-center py-3" style="background:#cfe2ff;color:#084298;">
```

Change the "Active" badge (line 71) from `bg-light text-dark` to:
```html
<span class="badge rounded-pill" style="background:rgba(8,66,152,0.15);color:#084298;">{{ configs_with_stats|length }} Active</span>
```

Change the `<thead class="bg-light">` (line 75) to:
```html
<thead style="background:#e9ecef;color:#495057;">
```

- [ ] **Step 3: Add pending section to `dashboard.html`**

After the closing `</div>` of the active configs card (after line 134), add:

```html
{% if pending_configs %}
<div class="card border-0 shadow-sm overflow-hidden mt-4">
    <div class="card-header d-flex justify-content-between align-items-center py-3" style="background:#fff3cd;color:#664d03;">
        <h5 class="mb-0 fw-bold"><i class="bi bi-exclamation-triangle me-2"></i> Unconfigured League/Seasons</h5>
        <span class="badge rounded-pill" style="background:rgba(102,77,3,0.15);color:#664d03;">{{ pending_configs|length }} Pending</span>
    </div>
    <div class="table-responsive">
        <table class="table table-hover align-middle mb-0">
            <thead style="background:#e9ecef;color:#495057;">
                <tr>
                    <th class="ps-4">League / Season</th>
                    <th>Gamedays</th>
                    <th>Teams in games</th>
                    <th class="text-center pe-4">Action</th>
                </tr>
            </thead>
            <tbody>
                {% for item in pending_configs %}
                <tr>
                    <td class="ps-4">
                        <div class="fw-bold text-dark">{{ item.league_name }}</div>
                        <div class="text-muted small">{{ item.season_name }}</div>
                    </td>
                    <td class="text-muted">{{ item.gameday_count }}</td>
                    <td class="text-muted">{{ item.team_count }}</td>
                    <td class="text-center pe-4">
                        <a href="{% url 'finance-config-add' %}?league={{ item.league_id }}&season={{ item.season_id }}" class="btn btn-sm btn-primary">
                            <i class="bi bi-plus-lg me-1"></i> Create Config
                        </a>
                    </td>
                </tr>
                {% endfor %}
            </tbody>
        </table>
    </div>
</div>
{% endif %}
```

- [ ] **Step 4: Verify in browser**

Navigate to `http://127.0.0.1:8000/finance/dashboard/`. Confirm:
- Active configs card header is light blue with dark blue text
- Table column headers are light grey
- Pending section appears in light yellow if any combos are unconfigured

- [ ] **Step 5: Commit**

```bash
git add finance/views.py finance/templates/finance/dashboard.html
git commit -m "feat(finance): add pending configurations section and fix header colours

Dashboard now shows league/season combos with gamedays but no finance config,
with a one-click Create Config link that pre-fills league and season.
Card headers changed to light blue/yellow; thead to light grey.

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

## Task 5: Create form — match edit layout, league/season, default rate hint

**Files:** `finance/views.py`, `finance/templates/finance/config_form.html`

- [ ] **Step 1: Update `ConfigCreateView` in `finance/views.py`**

Add `get_form_kwargs` and `get_context_data` overrides:

```python
class ConfigCreateView(LoginRequiredMixin, StaffRequiredMixin, CreateView):
    model = LeagueSeasonFinancialConfig
    form_class = FinancialConfigForm
    template_name = 'finance/config_form.html'
    success_url = reverse_lazy('finance-dashboard')

    def get_form_kwargs(self):
        kwargs = super().get_form_kwargs()
        kwargs['initial'] = {
            'league': self.request.GET.get('league'),
            'season': self.request.GET.get('season'),
        }
        return kwargs

    def get_context_data(self, **kwargs):
        context = super().get_context_data(**kwargs)
        settings = FinanceService.get_global_defaults()
        context['default_rate_season'] = settings.default_rate_per_team_season
        context['default_rate_gameday'] = settings.default_rate_per_team_gameday
        return context
```

- [ ] **Step 2: Rewrite `config_form.html`**

Replace the entire file with the edit-style two-column layout:

```html
{% extends "base.html" %}
{% load crispy_forms_tags %}

{% block content %}
<div class="container mt-4">
    <nav aria-label="breadcrumb">
        <ol class="breadcrumb">
            <li class="breadcrumb-item"><a href="{% url 'finance-dashboard' %}">Dashboard</a></li>
            <li class="breadcrumb-item active">New Financial Configuration</li>
        </ol>
    </nav>

    <div class="card shadow-sm border-0 overflow-hidden">
        <div class="card-header py-3" style="background:#cfe2ff;color:#084298;">
            <h5 class="mb-0 fw-bold"><i class="bi bi-gear-wide-connected me-2"></i> Create League/Season Financial Configuration</h5>
        </div>
        <div class="card-body bg-white p-4">
            <form method="post">
                {% csrf_token %}
                <!-- League + Season -->
                <div class="row g-4 mb-3">
                    <div class="col-md-6">
                        <div class="p-3 bg-light rounded border border-info border-opacity-25">
                            {{ form.league|as_crispy_field }}
                        </div>
                    </div>
                    <div class="col-md-6">
                        <div class="p-3 bg-light rounded border border-info border-opacity-25">
                            {{ form.season|as_crispy_field }}
                        </div>
                    </div>
                </div>
                <!-- Cost model full width -->
                <div class="row g-4 mb-3">
                    <div class="col-md-12">
                        <div class="p-3 bg-light rounded border border-info border-opacity-25">
                            {{ form.cost_model|as_crispy_field }}
                        </div>
                    </div>
                </div>
                <!-- Base rate + Planning targets -->
                <div class="row g-4">
                    <div class="col-md-6">
                        <div class="p-3 bg-light rounded border border-info border-opacity-25 h-100">
                            {{ form.base_rate_override|as_crispy_field }}
                            <div class="mt-2 text-muted small" id="hint_season" style="display:none;">
                                <i class="bi bi-info-circle"></i> System Default:
                                <span class="fw-bold">{{ default_rate_season }} €</span>
                            </div>
                            <div class="mt-2 text-muted small" id="hint_gameday" style="display:none;">
                                <i class="bi bi-info-circle"></i> System Default:
                                <span class="fw-bold">{{ default_rate_gameday }} €</span>
                            </div>
                        </div>
                    </div>
                    <div class="col-md-6">
                        <div class="p-3 bg-light rounded border border-warning border-opacity-25 h-100">
                            <h6 class="fw-bold mb-3 text-warning-emphasis"><i class="bi bi-calendar-event"></i> Planning Targets</h6>
                            <div id="season_fields" style="display:none;">
                                {{ form.expected_teams_count|as_crispy_field }}
                            </div>
                            <div id="gameday_fields" style="display:none;">
                                {{ form.expected_gamedays_count|as_crispy_field }}
                                {{ form.expected_teams_per_gameday|as_crispy_field }}
                            </div>
                        </div>
                    </div>
                </div>
                <div class="d-flex justify-content-between mt-4">
                    <a href="{% url 'finance-dashboard' %}" class="btn btn-secondary">Cancel</a>
                    <button type="submit" class="btn btn-primary px-4">
                        <i class="bi bi-check2-circle me-1"></i> Create Configuration
                    </button>
                </div>
            </form>
        </div>
    </div>
</div>
{% endblock %}

{% block extra_js %}
<script>
document.addEventListener('DOMContentLoaded', function () {
    const costModelRadios = document.querySelectorAll('input[name="cost_model"]');
    const seasonFields = document.getElementById('season_fields');
    const gamedayFields = document.getElementById('gameday_fields');
    const hintSeason = document.getElementById('hint_season');
    const hintGameday = document.getElementById('hint_gameday');

    function toggleFields() {
        const checked = document.querySelector('input[name="cost_model"]:checked');
        if (!checked) return;
        const isSeason = checked.value === 'SEASON';
        seasonFields.style.display = isSeason ? 'block' : 'none';
        gamedayFields.style.display = isSeason ? 'none' : 'block';
        hintSeason.style.display = isSeason ? 'block' : 'none';
        hintGameday.style.display = isSeason ? 'none' : 'block';
    }

    costModelRadios.forEach(r => r.addEventListener('change', toggleFields));
    toggleFields();
});
</script>
{% endblock %}
```

- [ ] **Step 3: Verify in browser**

Navigate to `http://127.0.0.1:8000/finance/config/add/`. Confirm:
- Two-column layout matches the edit page style
- League and season dropdowns at top
- Default rate hint switches when cost model radio changes
- Click "+ Create Config" from the pending section: league and season should be pre-selected

- [ ] **Step 4: Commit**

```bash
git add finance/views.py finance/templates/finance/config_form.html
git commit -m "feat(finance): redesign create form to match edit layout with league/season and default rate hint

Create page now uses the same two-column layout as the edit page.
League/season dropdowns added. Default rate hint switches via JS based
on selected cost model. Pre-fills from ?league= and ?season= query params.

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

## Task 6: Move discounts into base-rate column on config detail page

**Files:** `finance/templates/finance/config_detail.html`

- [ ] **Step 1: Move discounts section inside the base-rate column**

In `config_detail.html`, find the base rate box (col-md-6, lines 29–37). Extend it to include the discounts inline, below the base rate field and hint:

```html
<div class="col-md-6">
    <div class="p-3 bg-light rounded border border-info border-opacity-25 h-100">
        {{ config_form.base_rate_override|as_crispy_field }}
        <div class="mt-2 text-muted small">
            <i class="bi bi-info-circle"></i> System Default:
            <span class="fw-bold">{{ stats.base_rate }} €</span>
        </div>
        <hr class="my-3">
        <h6 class="fw-bold mb-3 text-secondary"><i class="bi bi-tags me-1 text-primary"></i> Discounts &amp; Grants</h6>
        <!-- Add discount inline form -->
        <form method="post" class="mb-3">
            {% csrf_token %}
            <div class="row g-2 align-items-end">
                <div class="col-4">{{ discount_form.discount_type|as_crispy_field }}</div>
                <div class="col-3">{{ discount_form.value|as_crispy_field }}</div>
                <div class="col-4">{{ discount_form.description|as_crispy_field }}</div>
                <div class="col-1">
                    <button type="submit" name="discount_submit" class="btn btn-success btn-sm w-100 mb-3">+</button>
                </div>
            </div>
        </form>
        <!-- Existing discounts list -->
        {% for discount in config.discounts.all %}
        <div class="d-flex justify-content-between align-items-center py-2 border-bottom small">
            <div>
                <span class="fw-medium">{{ discount.get_discount_type_display }}</span>
                <span class="text-danger fw-bold ms-2">
                    -{{ discount.value }} {% if discount.discount_type == 'PERCENT' %}%{% else %}€{% endif %}
                </span>
                {% if discount.description %}
                <span class="text-muted ms-1">({{ discount.description }})</span>
                {% endif %}
            </div>
            <form method="post" action="{% url 'finance-discount-delete' discount.pk %}"
                  onsubmit="return confirm('Delete this discount?');">
                {% csrf_token %}
                <button type="submit" class="btn btn-sm btn-outline-danger border-0 rounded-circle">
                    <i class="bi bi-trash-fill"></i>
                </button>
            </form>
        </div>
        {% empty %}
        <p class="text-muted small mb-0"><i class="bi bi-tag opacity-25"></i> No discounts applied.</p>
        {% endfor %}
    </div>
</div>
```

- [ ] **Step 2: Remove the old standalone Discounts & Grants card**

Delete the entire second card (`<!-- Discounts Management -->`, lines 61–139 in the original file). The `col-lg-8` div now contains only the Configuration card.

- [ ] **Step 3: Verify in browser**

Navigate to `http://127.0.0.1:8000/finance/config/1/`. Confirm:
- Discounts appear inside the base rate box, below the rate and system default hint
- No separate "Discounts & Grants" card below
- Add/delete discount still works

- [ ] **Step 4: Commit**

```bash
git add finance/templates/finance/config_detail.html
git commit -m "feat(finance): move discounts section into base-rate column on config detail page

Discounts & Grants are now displayed inline with the base rate field,
removing the separate card. No per-team column since discounts are now
global to the config.

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

## Final Verification

- [ ] Run full test suite:

```bash
python -m pytest finance/tests.py --ds=test_settings -v
```

Expected: all tests pass.

- [ ] Manual smoke test:
  1. `http://127.0.0.1:8000/finance/dashboard/` — light blue/yellow headers, grey thead, pending section visible
  2. Click "+ Create Config" from pending — league/season pre-filled
  3. `http://127.0.0.1:8000/finance/config/1/` — discounts inline next to base rate, no separate card
  4. Check that dummy teams (location='dummy') are not counted in any config's live team count
