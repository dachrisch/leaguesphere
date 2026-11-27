# Fresh multi-tenant RBAC — requirements and implementation plan

| | |
|---|---|
| **Status** | Planning — **Phase 1 (foundation) can start now** on the settled defaults (D1, D6, D9-library); Phase 2 is gated by D7/D8 and Phase 3 by D2–D4 ([§4](#4-decisions--settled-defaults-and-open-questions)) |
| **Date** | 2026-11-27 |
| **Origin** | [2026-02-25 Multi-Tenant RBAC Implementation Proposal](../history/2026-02-25-multi-tenant-rbac-thesis-implementation-proposal.md) — the response to Niklas Just's bachelor thesis *"Entwurf und Implementierung eines multimandantenfähigen Rechtemanagementsystems"* |
| **Thesis basis** | Bachelorarbeit, Niklas Just (2123394), Feb 2026 — actor/role definitions, tenant grain, library survey, sport-agnostic requirement and Model 3 decision (§3–4); chapters 5–7 contain no implementation or conclusion text, so the detailed requirements below come from the response document |
| **Decision** | start fresh; do **not** resurrect `feat/multi-tenancy` (`da87406d`, 2026-03-18) |
| **Supersedes** | nothing. The 2026-02-25 response document stays as the historical requirement source; this document turns it into buildable, testable requirements. |
| **Related** | [Snapshot as the only public API](./2026-10-04-snapshot-only-public-api.md), [Architecture Remediation Roadmap](./2026-11-25-architecture-remediation-roadmap.md), [Phase 0 plan](./2026-11-25-phase0-plan.md) |
| **Tracking** | [#2594](https://github.com/dachrisch/leaguesphere/issues/2594) — epic and status checklist |

---

## 1. Executive summary and decision

### 1.1 Decision

**Start a fresh implementation.** The old branch is not a foundation to build on; it is a
useful source of *ideas* and a checklist of *mistakes*.

One-line reason: the old branch predates 4,118 commits of master, implements **role
assignment, not tenancy** (`"tenant"` appears zero times in its diff), carries **no tests, no
docs and no API changes**, and 12 of the 15 files it touches no longer merge cleanly — so
rebasing it would cost more than re-deriving it from the response document's requirements
against today's models.

### 1.2 Why fresh — the evidence

| Dimension | Old branch `da87406d` | Consequence |
|---|---|---|
| Base | `a8b1e08a` (2025-11-17); master has moved **4,118 commits** and grown **3.4×** | Merge is a rewrite, not a rebase |
| Size | 46 files, +1,588 / −78 | Too small to be a tenancy layer, too large to cherry-pick |
| Tests / docs / API | **0 / 0 / 0** files | Nothing verifies behaviour; every requirement must be re-proven |
| Tenancy | `"tenant"` occurs **0 times**; roles are derived from Django **group names** | Group names are global strings, not tenant-scoped rows — no isolation primitive |
| Spec coverage | **1 of 15** requirements, partially | 14 requirements start from zero |
| Security | Unauthenticated delete views; create views open to any logged-in user; role checks not object-scoped; API untouched | Porting it would import exploitable endpoints |
| Compatibility | 12/15 touched files conflict (~29 hunks); 9 migration filename collisions; `Association` relocation collides with 74 master references; new circular app dependency | The architecture itself is incompatible |
| Model fit | Assumes `Team.league`; master has **no such FK** (league membership is per-season via `SeasonLeagueTeam`) | The core scoping assumption is wrong for this domain |

### 1.3 Goals

1. **A tenant is a league.** The thesis evaluates the German league landscape, rejects federal
   states as tenants, and models its thirteen 2026 leagues as thirteen tenants (§4.1). Every
   isolatable row has a tenant key or a deterministic path to one, and every request runs under
   exactly one resolved tenant (or an explicit, audited global scope).
2. **Isolation is enforced by the data layer**, not by remembering `.filter(league=...)` in
   300 views. A forgotten filter must produce a loud failure, not a cross-tenant leak.
3. **Authorization is tenant- and object-scoped.** "Is staff" becomes "holds role X in
   tenant Y, for object Z".
4. **The public contract does not move.** `/api/snapshot/` stays identical; the sitemap,
   liveticker and share surfaces keep working anonymously.
5. **Migration is reversible and observable.** Old and new authority run side by side
   (write → shadow-read → enforce → deprecate), with logs that prove equivalence before each
   enforcement step.

### 1.4 Non-goals

- **No schema-per-tenant or database-per-tenant.** The thesis's Model 3 (shared database,
  shared schema, tenant key) is the decision; PostgreSQL row-level security and separate
  schemas are out of scope (see [D9](#d9-tenancy-library-and-database-platform)).
- **No rewrite of the domain model.** No `Team.league`, no league-owned seasons, no changes to
  season rollover semantics.
- **No auth-provider change.** Knox tokens, session auth and Moodle official sessions stay.
- **No new public API.** No per-tenant public endpoints; the snapshot remains the only
  public API.
- **No frontend redesign.** Permission-aware UI only; no new visual language.
- **No "organisation" tenancy above federations.** Association grouping is modelled where it
  already exists, not invented as a third level.
- **No sport-specific logic in the tenancy layer.** The thesis asks for a system that can be
  adapted to other sports, with youth leagues as a first scaling exercise (§3.4). Tenancy
  primitives SHALL stay sport-agnostic; this is a design constraint, not a new module.

### 1.5 What "tenant" means in this document

A **tenant** is a `gamedays.League` row (e.g. "DFFL", "DFFL2", "DFFL-F"). The thesis counts
**13 leagues** as tenants as of 2026 and explicitly rejects federal states (*Bundesländer*):
federal leagues, state leagues and cross-state divisions overlap, and the structure changes
from year to year (§4.1). It is the unit of data isolation, role scope, URL prefix, cache
partition and audit attribution. A **membership** is a `UserRole` row binding a user to a
tenant with a role. An **object scope** is the narrower ownership inside a tenant (a team, a
gameday's author, an official's own signup).

---

## 2. Verified baseline

Facts B1–B19 were measured on this branch's base commit; B20–B22 come from the thesis. Together
they are the ground truth the requirements are written against.

**Counting protocol.** Run these from the repo root on the base commit. `rg` honours
`.gitignore`, so a local virtualenv is never counted; `tests/` directories are excluded except
where stated. Numbers are **occurrences**, not matching lines.

```bash
rg -o "is_staff" -g '*.py' -g '!**/tests/**' . --no-filename | wc -l        # 144
rg -l "is_staff" -g '*.py' -g '!**/tests/**' . | wc -l                       # 30
rg -l "^class Command\b" -g '*.py' . | wc -l                                 # 14
rg -c "^class .*\(.*models\.Model" -g '*/models.py' . | awk -F: '{s+=$2} END {print s}'   # 59
rg -n "admin.site.register" -g '*/admin.py' . | wc -l                        # 24
rg -n "\.raw\(|cursor\(|connection\.cursor|RawSQL" -g '*.py' -g '!**/tests/**' . | wc -l  # 4
```

The 30 files include `journey/tests.py` (a test module whose path has no `tests/` segment);
excluding every path containing `test` gives **137 occurrences in 29 files**. The plan quotes
**144/30** because that is what the single command produces.

| # | Fact | Where | Why it matters |
|---|---|---|---|
| B1 | `is_staff` appears **144 times in 30 Python files** outside `tests/` directories (137/29 if test modules are also excluded; plus 11 template sites and a frontend `useIsStaff` hook) | Counting protocol above | The role migration is the largest mechanical part of the work |
| B2 | `Gameday` has `league` **and** `season` FKs; `League` and `Season` are global tables (`slug` unique, no dates) | `gamedays/models.py:31-55,94-109` | Gameday is already tenant-keyed; Season is not, and "before" is string ordering |
| B3 | `Team` has **no league FK**; `name`/`description` are globally unique; league membership is `SeasonLeagueTeam(season, league, teams M2M)` | `gamedays/models.py:67-92` | A team can move leagues between seasons; a `Team.league` column would be factually wrong |
| B4 | There is **no uniqueness constraint on `SeasonLeagueTeam(season, league)`** — duplicates are prevented in forms/services only | `gamedays/service/season_rollover_service.py:8-12` | Tenant scoping must tolerate/prevent historic duplicate membership rows |
| B5 | Write authorization today is `is_staff` **or** `obj.author == user`; DRF defaults to `IsAuthenticatedOrReadOnly` | `gamedays/permissions.py`, `league_manager/settings/base.py:206-226` | Any logged-in user can attempt any write; only object checks stop them |
| B6 | `Association` lives in `gamedays` (`abbr` unique) and is referenced by `Team.association` and `officials.Official.association` | `gamedays/models.py:57-64` | The old branch's `accesscontrol.Association` would fork a live model |
| B7 | Legacy `UserProfile.team` + `Permissions`/`UserPermissions` + `check_teammanager()` is the *de facto* team-scoped role system | `gamedays/models.py:365-412`, `teammanager/views.py` | This is what `UserRole` replaces; it also carries a real bug (`check_teammanager` without parens, `teammanager/views.py:59`) |
| B8 | Identity is partly encoded in `username`: `team.name == request.user.username`, `association == username`, `username == "offd"` | `league_manager/utils/view_utils.py:15-23`, `officials/views.py:196,897,776` | Tenant identity must move to explicit FKs; username-as-identity cannot survive RBAC |
| B9 | `Person` and `Official` have **no `user` FK** (`home_service` documents "there is no User–Official relation in the schema") | `gamedays/models.py:448`, `officials/models.py:20-41`, `home/service/home_service.py:1-20` | Player/referee roles need an identity link, backfilled |
| B10 | Cross-tenant relations already exist and are load-bearing: `EligibilityRule.eligible_in` (league↔leagues), `TeamRelationship.additional_teams`, `LeagueSeasonConfig.leagues_for_league_points` | `passcheck/models.py:122-131`, `league_table/models.py:131-150` | A naive "one tenant per row" filter breaks these features |
| B11 | Public surface: `/api/snapshot/` is the only public API; sitemaps, `/share/widget/`, liveticker and the game-progress page plus its read-only feed read globally and anonymously | `gamedays/api/snapshot.py`, `league_manager/sitemaps.py`, `share/views.py`, `journey/progress_view.py`, `journey/api/progress_views.py` | These need a first-class `unscoped()` path, not an exception bolted on later |
| B12 | Middleware chain has 10 entries; the project already ships custom middleware (`DatabaseGuardMiddleware`, `MaintenanceModeMiddleware`) with `league_manager/middleware/` as the home | `league_manager/settings/base.py:81-92` | There is an established place and pattern for new middleware |
| B13 | `scripts/check_app_boundaries.py` forbids `gamedays` importing `league_table`, `gameday_designer`, `officials`, `passcheck`, `liveticker` (allowlist may only shrink) | `scripts/check_app_boundaries.py` | The RBAC app must not create a new back-edge |
| B14 | **59** model classes across 9 apps that own tables; `gamedays` alone has 25 | `rg "^class .*Model"` (measured) | The tenant-key audit is a bounded but non-trivial matrix |
| B15 | Four raw-SQL sites: migrations (2), DB guard health probe, `reset_demo_database` | `rg "cursor\("` | Small enough to audit exhaustively |
| B16 | **14 invocable management commands** in 15 modules (22 files once `__init__.py` is included), including projectors (`rebuild_game_projection`, `check_game_projection`) and seeders | Counting protocol above | Every command is a tenant-context bypass candidate |
| B17 | `gameevents` writes `gamedays` projection tables through a projector boundary (`project_submission`, `project_game`) | `gameevents/service/append.py:212`, `projector.py:675` | Writes can bypass views entirely; the projector must stamp or derive the tenant |
| B18 | `scorecard_v2` is an offline PWA with an IndexedDB outbox and a device lock on `GameSetup.device_id` | `gamedays/api/game_views.py`, `gamedays/service/device_lock.py` | Offline caches and device locks are cross-tenant state that must be namespaced |
| B19 | Repo gates: TDD, mandatory query-count assertions, `black .`, `npm run eslint`, scope coverage, app-boundary check, **100% branch coverage of every created/changed/moved function** (`python3 scripts/check_branch_coverage.py --coverage coverage.json --base origin/master --shard <shard>`; pragmas need an inline reason), DCO-signed conventional commits | [AGENTS.md](../../../../AGENTS.md) | Every phase's exit criteria must include these; the branch-coverage rule is detailed in §7.6 |
| B20 | The thesis counts **13 leagues** as tenants and rejects federal states: federal leagues, state leagues and merged divisions overlap and the structure changes annually | Thesis §4.1 | Confirms D1's League grain with an explicit source |
| B21 | The thesis reviews `django-tenants`, `django-tenant-schemas`, `django-multitenant` and `django-db-multitenant` and extends `django.contrib.auth` instead of adopting a library | Thesis §3.3, §4.3 | The bespoke `access` app follows the thesis; no third-party tenancy dependency |
| B22 | The thesis asks for adaptability to other sports and names youth leagues as a first scalability exercise | Thesis §3.4 | Tenancy primitives stay sport-agnostic; youth leagues belong in the load scenario (R56) |

---

## 3. Source requirements extracted from the thesis and the response document

Requirements are numbered **R1…R64** and grouped by area. Each is written to be testable:
the "Verified by" column names the artefact that proves it (a test, a check, or an audit).
Where the thesis or the response document is technically wrong or underspecified, the
requirement says so and corrects it — those corrections are the most valuable part of this
document.

### 3.1 Data model

| ID | Requirement | Verified by |
|---|---|---|
| **R1** | The tenant entity SHALL be the existing `gamedays.League` row. No parallel tenant table SHALL be introduced; `League.slug` is the tenant key used in URLs, cache keys and audit records. | Migration review; no second tenant table in `sqlmigrate` output |
| **R2** | `UserRole` SHALL be a single table: `user` FK, `role` (choices), `league` FK nullable, `team` FK nullable, `created_at`, `created_by`, plus a **`scope_key`** CharField (`sys`, `league:<id>`, `team:<id>`, `global`) derived in `save()` and covered by `UniqueConstraint(user, role, scope_key)`. This realises the thesis's "Zuordnungstabellen" between users, roles and tenants (§4.3.2): one row per user–role–scope, so a user can be `LEAGUE_ADMIN` of one league, `TEAM_MANAGER` of two teams and `REFEREE` globally at the same time. The derived key is required because **MariaDB has no partial unique indexes and permits duplicate NULLs in a unique index**, so a constraint over the nullable FK columns would not prevent duplicate `SYSTEM_ADMIN` rows. `UserRole` SHALL NOT encode the role in a Django `Group` name. | Model review; DB constraint test inserting duplicate `SYSTEM_ADMIN` and duplicate `LEAGUE_ADMIN` rows |
| **R3** | Role scope SHALL be exactly the combinations in [§3.1.2](#312-userrole-scope-combinations), enforced by `CheckConstraint`s on `(league, team)` nullness and by the `scope_key` family; `scope_key` SHALL be the canonical value for the row's role and id. `Association` is NOT a role scope — see D1. | Constraint tests for every invalid combination in §3.1.2, including a mismatched `scope_key` |
| **R4** | Every tenant-owned root table SHALL carry exactly one tenant key or a deterministic, indexed path to one. The audit table in [§3.1.1](#311-tenant-key-matrix) is the definition of "tenant-owned" and SHALL be updated whenever a model is added. | `scripts/check_tenancy_coverage.py` (new) failing on an unlisted model |
| **R5** | `Team` SHALL NOT gain a `league` FK. Team read scope SHALL be derived from `SeasonLeagueTeam` membership for the resolved tenant (and the requested season, where supplied). | Isolation test: a team that only ever played in league B is invisible under tenant A; scope test proves the join |
| **R6** | Team *administration* (create/rename/logo) MAY use a denormalised `Team.home_league` FK if the team-admin UX needs a stable owner; if added, it SHALL be documented as an ownership hint, never used for read isolation. | Decision [D2](#d2-how-team-is-scoped--no-league-fk-seasonal-league-movement); test that hiding a team does not depend on `home_league` |
| **R7** | `Person.user` and `Official.user` SHALL be nullable FKs with `on_delete=SET_NULL` and a uniqueness rule. Backfill SHALL begin with a mandatory audit (`audit_identity_links --league <slug>`) reporting matched / ambiguous / unmatched counts per tenant. The **only** permitted mapping sources are (a) `UserProfile.user → Person` matched on first name + last name + year of birth within the same team roster, and (b) an explicitly confirmed official↔user mapping from Moodle `external_id`/email. Username comparisons (B8) SHALL NOT be used as an identity source. Unmatched officials keep `user=NULL`, are administered by `LEAGUE_ADMIN`, and are listed and accepted at the phase exit. | Migration + backfill test on seeded demo data; audit report with zero **ambiguous** rows and a reviewed unmatched list |
| **R8** | `Gameday.author`, `TeamLog.author`, `GameEvent.author` and `ScheduleTemplate.created_by` SHALL be understood as **object ownership**, not authority; the permission layer SHALL treat ownership as one input alongside role. | Permission matrix tests |
| **R9** | The legacy `gamedays.Permissions`, `gamedays.UserPermissions` and `UserProfile.check_teammanager()` SHALL be retired in favour of `UserRole`. `UserProfile` SHALL remain only as a player profile (avatar, name, jersey). | Migration removing the two tables; `rg check_teammanager` returns only a compatibility shim |
| **R10** | Cross-tenant relations SHALL be explicit bridge tables with their own audit columns: existing `EligibilityRule.eligible_in`, `TeamRelationship.additional_teams`, `LeagueSeasonConfig.leagues_for_league_points` are the pattern. A bridge row SHALL require a `granted_by`/`created_at` pair. | Schema review; test that a bridge does not widen default read scope |
| **R11** | Every tenant key SHALL have an index whose leading column matches the dominant query shape: `(league, date)`, `(league, season)`, `(league, status)`, `(team, ...)`. Blanket single-column indexes on `league_id` are insufficient. | Scripted `EXPLAIN` review of the top 10 list views recorded in the phase exit (§7.2); no brittle plan assertion |
| **R12** | A tenant-scoped row SHALL be `NOT NULL` on its tenant key once backfilled; nullable tenant keys SHALL be limited to genuinely global rows (`League`, `Season`, `Team`, `Person`, `Association`, `SiteConfiguration`). | `check_tenancy_coverage.py` allowlist review |

#### 3.1.1 Tenant key matrix

| Model / app | Tenant key | Notes |
|---|---|---|
| `gamedays.Gameday` | `league` (exists) | Already correct; add composite indexes |
| `gamedays.Gameinfo`, `Gameresult`, `GameOfficial`, `GameSetup`, `GameLogSubmission`, `TeamLog`, `GamedayDesignerState` | via `gameday` (exists) | No column; derived, cached on read. Projector must derive from `gameinfo.gameday.league_id` |
| `gamedays.SeasonLeagueTeam` | `league` + `season` (exists) | The team↔league bridge. Requires a uniqueness constraint (R4/B4) |
| `gamedays.Team` | **none** — derived via `SeasonLeagueTeam` | See [D2](#d2-how-team-is-scoped--no-league-fk-seasonal-league-movement) |
| `gamedays.Season`, `Person`, `Association`, `League` | global | Deliberately shared |
| `gamedays.Tournament*` | `league` (new, nullable for cross-league tournaments) | Tournament can span leagues by design |
| `gamedays.ResourceUrl` | via `gameday`/`tournament` | |
| `gameevents.GameEvent`, `GameState` | via `gameinfo.gameday.league` | Never trusted from the client payload |
| `league_table.LeagueGroup`, `LeagueSeasonConfig`, `TeamPointAdjustments`, `OverrideOfficialGamedaySetting` | `league` (+`season`) | `leagues_for_league_points` stays a bridge |
| `league_table.LeagueRuleset`, `TieBreakStep`, `LeagueRulesetTieBreak` | `league` (new, nullable = global default) | Rulesets are reusable; nullable means "platform default" |
| `officials.Official`, `OfficialLicenseHistory` | **no tenant key** — scope by assignment (`OfficialGamedaySignup`, `GameOfficial`) | Referees work across leagues; `Official.association` is an attribute, not a tenant or role scope |
| `officials.OfficialGamedaySignup` | via `gameday` (exists) | |
| `officials.CrewPosition` | global | |
| `passcheck.Playerlist`, `Player` | via `team` → derived | League scope via team membership in season |
| `passcheck.PasscheckVerification`, `PlayerlistGameday` | via `gameday` (exists) | |
| `passcheck.PlayerlistTransfer` | via `current_team`/`new_team` → derived | A transfer can cross tenants; requires explicit approval authority in **both** |
| `passcheck.EligibilityRule` | `league` (exists) + bridge | Cross-league by design |
| `journey.Journey`, `JourneyEvent` | user-scoped, not league-scoped | Staff dashboards aggregate; see [D4](#d4-cross-league-and-global-reads) |
| `gameday_designer.ScheduleTemplate` | `league` (new, nullable = shared template) | The existing `sharing` choices and `association` FK are *sharing* attributes, not tenancy; association/global templates are deliberately global reads |
| `scorecard`, `scorecard_v2`, `liveticker`, `teammanager`, `accounts`, `home`, `share`, `matchreport`, `dbaccess` | no owned models (or pure config) | Thin/consumer apps; behaviour covered by API and permission requirements |

#### 3.1.2 `UserRole` scope combinations

Every row must satisfy exactly one line. `league` and `team` are the only scope FKs; `role` and
`scope_key` must agree with them.

| Role | `league` | `team` | `scope_key` | Meaning |
|---|---|---|---|---|
| `SYSTEM_ADMIN` | NULL | NULL | `sys` | Platform actions (league creation, seeds, `dbaccess`); cross-tenant reads need the audited god-mode opt-in (R48) |
| `LEAGUE_ADMIN` | set | NULL | `league:<id>` | Admin of one tenant (R32 matrix) |
| `TEAM_MANAGER` | **NULL** | set | `team:<id>` | Own team only; the league is derived per season via `SeasonLeagueTeam` (R36). Storing `league` here would freeze a moving team into one league |
| `REFEREE` | NULL | NULL | `global` | Identity only; authority comes from assignment rows (R37) |
| `PLAYER` | NULL | NULL | `global` | Identity only; reads own data (R32 matrix) |

- `CheckConstraint`s on `(league, team)` nullness are the portable part (MariaDB/MySQL enforce
  them since 8.0.16 / 10.2).
- The `scope_key` family (`sys`, `league:`, `team:`, `global`) is validated in `save()` and
  asserted by a constraint test. A DB-level `LIKE` check is added only where the target MariaDB
  version supports it, because `CHECK` semantics differ across versions.
- `UniqueConstraint(user, role, scope_key)` makes duplicate `sys`/`global` rows impossible —
  the case a nullable-FK unique index would miss on MariaDB.
- `bulk_create()` and `queryset.update()` bypass `save()`: the `UserRole` manager SHALL override
  both to derive/validate `scope_key`, so the constraint cannot be sidestepped by a batch job.
- `System-Admin`, `Referee` and `Player` rows are found for **every** tenant; the kernel's tenant
  lookup must include them explicitly (see [§5.6](#56-authorization-kernel)).

### 3.2 Tenant context and middleware

The response document proposes three middleware layers. **Layers 1 and 2 are implementable as
middleware; layer 3 is not** — Django middleware cannot intercept querysets, so
"TenantFilteringMiddleware" is restated as the data-layer guarantee R19–R23. This is a
deliberate deviation and the single most important architectural correction in this document.

| ID | Requirement | Verified by |
|---|---|---|
| **R13** | `TenantResolutionMiddleware` SHALL resolve the tenant before the view runs, from a fixed precedence: (1) URL kwarg `league_slug`; (2) explicit `X-LeagueSphere-League` header on token-authenticated requests; (3) session key `active_league` set by the league switcher; (4) Knox token claim; (5) subdomain. It SHALL NOT resolve from POST/PUT bodies or from an arbitrary query parameter. | Unit tests for each source and for precedence |
| **R14** | Conflicting sources (e.g. URL says `dffl`, token claim says `dffl2`) SHALL be a **403** with audit event `tenant_source_conflict`, never a silent preference. | Test with forged header + mismatched token |
| **R15** | An **unknown** tenant slug SHALL be a **404**. A known tenant without membership SHALL be a **403** for every action that is not declared **public-read**; public-read actions (published schedule, standings, snapshot) SHALL be allowed without membership and return published data only. `SYSTEM_ADMIN` bypasses membership only for non-public actions. | Test matrix over {unknown, known-no-role, known-role, system-admin} × {public-read, member action} |
| **R16** | Global routes SHALL be exempt through a **code-level route manifest**, not a `/api/` prefix rule: `/api/snapshot/`, sitemaps, `/health/*`, `/login/`, `/logout/`, static/agent files, `/share/widget/`, `/liveticker/` public read routes. Adding a route to the manifest requires a comment naming its public contract. | Test that an unlisted `/api/` route under no tenant is rejected loudly |
| **R17** | `TenantContextMiddleware` SHALL store the resolved tenant in a `contextvars.ContextVar` (never `threading.local`), expose `current_tenant()`, `require_tenant()` and `tenant_scope()`, and reset the var with the saved `Token` in a `finally` block. Nested scopes SHALL restore the **previous** value, not `None`. | Unit tests for set/reset, nesting, exception paths |
| **R18** | Context SHALL survive Django's sync/async boundary: `sync_to_async`/`async_to_sync` copy the context (asgiref), so `contextvars` is the only correct choice. Streaming responses (SSE liveticker) SHALL re-establish the tenant inside the generator, because middleware `finally` runs before the iterator is consumed. | Streaming test asserting the generator sees the tenant |
| **R19** | Tenant-aware managers/querysets SHALL be **opt-in per model** (`TenantScopedManager`), not global monkey-patching. When the context is unset, a tenant-aware query SHALL raise `TenantContextMissing` — a loud programming error, not an empty result. | Test asserting the exception (not `[]`, not `DoesNotExist`) |
| **R20** | `unscoped()` SHALL be the only escape: `Model.objects.unscoped()` (optionally with `reason="..."`), audited at `DEBUG`-and-above in one place. It SHALL be greppable and rare; a new `unscoped()` call site requires a code-review note. | `rg "unscoped\("` inventory reviewed per phase; test that `unscoped()` logs |
| **R21** | `TenantEnforcementMiddleware` (the corrected layer 3) SHALL detect bypasses via **manager hooks** (`TenantScopedManager` / `unscoped()` register into a request-local registry) and **`connection.execute_wrapper`** for every executed statement, then assert the unscoped set against `access/routing.py::ROUTE_TENANT_POLICY`; violations raise `IsolationViolation` under `DEBUG`/`TENANCY_STRICT` and log `isolation_bypass` + a metric in production. Mechanism, timing and cost: [§5.4.1](#541-how-enforcement-detects-a-bypass). | Test that `Team.objects.unscoped()` on a non-allowlisted route raises `IsolationViolation` in DEBUG and logs in strict-off mode; `assertNumQueries` delta is 0 |
| **R22** | Management commands and projectors SHALL have no implicit tenant. They SHALL accept `--league <slug>` (or iterate explicitly) and use `unscoped()` where they are intentionally global, logging the reason. | Command tests without `--league` fail loudly |
| **R23** | Raw SQL (`cursor()`, `.raw()`, `RawSQL`) SHALL remain forbidden except in migrations and health probes; the four existing sites (B15) SHALL be reviewed and annotated. | `rg` audit in CI (new check) |
| **R24** | A request that resolves no tenant and is not on the global manifest SHALL fail with **400 `tenant_required`** for API routes and a redirect to tenant selection for HTML routes — never a fallback to "all data". | Test matrix; no code path returns unfiltered rows |

**Failure-mode table (required reading for reviewers)**

| Failure | Required behaviour | Forbidden behaviour |
|---|---|---|
| Unknown slug | 404 + audit `tenant_not_found` | 403 (leaks tenant existence) or empty page |
| Known slug, no membership | 403 + audit `tenant_forbidden` for a member action; public-read returns published data only | 200 with non-public data |
| No tenant, non-global route | 400 `tenant_required` (API) / redirect (HTML) | Global query |
| Context unset in tenant-aware manager | raise `TenantContextMissing` | return `[]` |
| Conflicting sources | 403 + audit | silently prefer URL |
| View raises | context reset in `finally` | leaked context into next request/thread |
| Streaming response | tenant re-set inside generator | context already reset mid-stream |
| Background task/projector | explicit `tenant_scope()` or loud failure | inherit stale context from a reused thread |

### 3.3 REST routing and API shape

| ID | Requirement | Verified by |
|---|---|---|
| **R25** | New tenant-scoped routes SHALL be nested: `/api/leagues/<slug>/gamedays/`, `/api/leagues/<slug>/teams/`, `/api/leagues/<slug>/standings/`. The slug — not the numeric id — SHALL be the tenant segment, so URLs survive environment clones. | URL tests; route map review |
| **R26** | Existing flat routes SHALL remain during migration (R44) and SHALL resolve the tenant from the object they load, never from an unfiltered queryset. | Test: `/api/gamedays/<id>/` where the gameday is in another tenant → 404 |
| **R27** | A membership endpoint SHALL exist: `GET /api/me/leagues/` returning `[{slug, name, roles: [...], teams: [...]}]`, plus `GET /api/me/permissions/?league=<slug>` returning the effective action list. It SHALL be the single source for frontend guards. | Contract test; frontend consumes it |
| **R28** | Error envelopes SHALL be machine-readable: `{"error": {"code": "tenant_forbidden", "message": "...", "request_id": "..."}}`. `request_id` SHALL appear in the server log line for the same request. | API tests; log-correlation test |
| **R29** | `/api/snapshot/` SHALL remain byte-identical in shape and semantics for v1 and SHALL NOT require a tenant. It SHALL be the reference implementation of `unscoped()`. | Existing snapshot tests unchanged; ETag parity check |
| **R30** | The API surface SHALL NOT be split into `/api/v2/` for tenancy alone. Tenancy is a routing/authorization change, not a payload change; only a genuinely breaking payload change justifies a new version. | ADR review |
| **R31** | Every DRF `ViewSet`/`APIView` SHALL declare its tenant behaviour explicitly: `tenant_scoped = True` (default) or `is_global = True` with a docstring naming the public contract. | New check that scans view classes for the attribute |

### 3.4 Roles and the permission matrix

The role set follows the thesis's five actor groups (§4.1): Spieler → `PLAYER`, Teammanager →
`TEAM_MANAGER`, Schiedsrichter → `REFEREE`, Liga-Admin → `LEAGUE_ADMIN`, and the thesis's
explicitly added System-Admin → `SYSTEM_ADMIN`. No association-level role is introduced:
`Association` stays a grouping attribute (D1), which also matches the non-goal of no
organisation tier above federations. `PUBLIC` is the absence of a role, not a row.

| ID | Requirement | Verified by |
|---|---|---|
| **R32** | Roles SHALL be exactly `SYSTEM_ADMIN`, `LEAGUE_ADMIN`, `TEAM_MANAGER`, `REFEREE`, `PLAYER`. Adding a new role SHALL require an update to this matrix and an ADR, not a one-off group name. | `UserRole.Role` review; role-set diff against thesis §4.1 |
| **R33** | Django's per-model permissions (`gamedays.change_gameday`) SHALL **not** be used for tenant authorization. They are global and cannot express "admin of league A"; they MAY be mirrored for the Django admin only. | `rg permission_required` returns only admin/project uses; authorization tests use `UserRole` |
| **R34** | Authorization SHALL short-circuit **public-read** actions first (published data only, R15) and then be a two-step check for everything else: **tenant membership with role** (row scope), then **object ownership/relationship** (object scope). A role check that ignores the object SHALL fail review. | Permission matrix tests per role × resource × action, including anonymous published/unpublished cases |
| **R35** | Effective permissions SHALL be computed by one kernel (`access.policy.can(user, action, tenant, obj=None)`), so API, HTML views, admin and frontend guards cannot drift. | One test suite; `rg "is_staff"` count only in the kernel and deprecated paths |
| **R36** | `TEAM_MANAGER` SHALL be scoped to a team and derive its league from `SeasonLeagueTeam` for the active season. It SHALL NOT grant rights in another league that the same team plays in during a different season. | Test with a team that changed leagues |
| **R37** | `REFEREE` SHALL be scoped by assignment (`OfficialGamedaySignup`, `GameOfficial`), not by a league-wide role. | Test: referee sees assigned gamedays, not the league's drafts |
| **R38** | Field-level protection SHALL be preserved and made role-driven: official name obfuscation currently keyed on `is_staff` SHALL key on `REFEREE`/`LEAGUE_ADMIN` scope. | Serializer tests for obfuscation per role |
| **R39** | Device-lock release (`DELETE /api/game/<pk>/device`) SHALL require `LEAGUE_ADMIN` in that game's tenant or `SYSTEM_ADMIN`, not `is_staff`. | API test with staff-of-another-league |
| **R40** | Role changes SHALL be audited (actor, subject, role, tenant, before/after) and SHALL take effect on the next request without re-login. | Audit row assertion; cache-invalidation test |

**Role → permission matrix (initial; the contract to be signed off in [D1](#d1-tenant-grain--league-association-or-two-level))**

`✓` allowed, `o` allowed for own object only, `–` denied.

| Resource / action | PUBLIC | PLAYER | TEAM_MANAGER | REFEREE | LEAGUE_ADMIN | SYSTEM_ADMIN |
|---|---|---|---|---|---|---|
| Snapshot / liveticker / sitemap reads | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| League schedule, published gamedays | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| Draft gamedays | – | – | – | – | ✓ | ✓ |
| Create / edit / publish gameday | – | – | – | – | ✓ | ✓ |
| Enter / correct results | – | – | – | – | ✓ | ✓ |
| Read own roster | – | o | o | – | ✓ | ✓ |
| Edit roster, jersey numbers | – | – | o | – | ✓ | ✓ |
| Approve player transfer | – | – | o (both teams) | – | ✓ | ✓ |
| Read passcheck verification | – | – | o | ✓ | ✓ | ✓ |
| Submit passcheck verification | – | – | – | ✓ | ✓ | ✓ |
| Sign up as official, read own assignments | – | – | – | o | ✓ | ✓ |
| Assign officials to gamedays | – | – | – | – | ✓ | ✓ |
| Read official names unmasked | – | – | – | o | ✓ | ✓ |
| League config, ruleset, eligibility rules | – | – | – | – | ✓ | ✓ |
| Create league / assign league admins | – | – | – | – | – | ✓ |
| Platform config, seeds, `dbaccess` | – | – | – | – | – | ✓ |
| Cross-league standings / aggregate | ✓ (published) | ✓ | ✓ | ✓ | ✓ | ✓ |

### 3.5 Phased migration

| ID | Requirement | Verified by |
|---|---|---|
| **R41** | Migration SHALL follow **write → shadow-read → enforce-read → enforce-write → deprecate** for `is_staff`; each stage SHALL be independently deployable and reversible. | Stage table in [§6.1](#61-is_staff-write--view--deprecate); one PR per stage |
| **R42** | Write stage: every place that sets `is_staff` SHALL also create the corresponding `UserRole` (management command + signal + seeders). Reading code is unchanged. | Dual-write test: after seeding, authority and `is_staff` agree for every user |
| **R43** | Shadow-read stage: the new kernel SHALL be evaluated on every authorization decision, the result compared with `is_staff`, and **disagreements logged** without changing the outcome. Exit criterion: zero disagreements for one full gameday weekend in production. | Log dashboard/report; a disagreement count of 0 |
| **R44** | Enforce-read stage: tenant filtering SHALL be switched on per app (feature flag), starting with read-only list endpoints; exit criterion per app: isolation suite green and query counts within the R54 budget. | Per-app flag matrix; query-count assertions |
| **R45** | Enforce-write stage: the permission kernel SHALL replace `is_staff` checks app by app; old checks remain behind a flag for one release, then are deleted. | `rg is_staff` count monotonically decreasing; per-app tests |
| **R46** | Deprecate stage: legacy `Permissions`/`UserPermissions` tables, `check_teammanager`, and the `is_staff`-based helpers SHALL be removed; `is_staff` MAY remain only as Django-admin gate (documented) or be removed entirely (see [D7](#d7-role-migration-from-144-is_staff-occurrences)). | Migration dropping tables; `rg` inventory in §10 |

### 3.6 Security and audit

| ID | Requirement | Verified by |
|---|---|---|
| **R47** | Audit SHALL cover **writes and denials**, not reads: role changes, tenant membership changes, cross-tenant bridge changes, 403s, god-mode use, `unscoped()` on a non-global route. Reads are covered by access logs, not a DB table. | Audit model review; events emitted in tests |
| **R48** | Cross-tenant "god mode" SHALL be explicit: a per-request opt-in available to `SYSTEM_ADMIN` (header or UI toggle), audited, time-bounded to the request and visible in the UI. It SHALL NOT be the silent default for superusers, and `SYSTEM_ADMIN` without the opt-in stays tenant-filtered ([§5.6](#56-authorization-kernel)). | Test: superuser without opt-in gets normal tenant scoping; with opt-in gets an unscoped read plus an audit row |
| **R49** | Cross-tenant data SHALL NOT be enumerable **for non-public data**: object lookups outside the tenant return **404**, list endpoints return empty, and error bodies SHALL NOT reveal existence. Public-read routes (R15) are the explicit exception: they may return **published** rows of the tenant named in the URL to anonymous visitors, never drafts, private rosters or another tenant's rows. | Isolation matrix (§7.1), including published/draft public-read cases |
| **R50** | Tenant-scoped rate limits SHALL exist for expensive aggregations (standings rebuild, snapshot rebuild) so one tenant cannot exhaust another's capacity. | Throttle tests with two tenants |
| **R51** | A per-tenant export/delete path SHALL exist before tenancy ships, so a league leaving the platform can be extracted without hand-written SQL. | Command test producing a manifest + row counts |
| **R52** | Secrets and credentials SHALL NOT be tenant-keyed (DB credentials, Knox keys stay global); `dbaccess` grants SHALL be attributed to a tenant where the request concerns one tenant's data. | Config review; `dbaccess` audit test |

### 3.7 Testing and load

| ID | Requirement | Verified by |
|---|---|---|
| **R53** | Every tenant-aware model SHALL have isolation tests: cross-tenant read → 404/empty, cross-tenant write → 403, unset tenant → loud failure, public endpoint → allowed. | Generated matrix test, one row per model |
| **R54** | Every modified endpoint SHALL keep its query count constant in result-set size and add **at most two** cached queries — one tenant resolution, one request role set — neither scaling with the result. | `assertNumQueries` in every touched test; the delta is asserted explicitly |
| **R55** | A bypass audit SHALL cover raw SQL, management commands, projectors, admin actions, signals and offline replay, each with a named test or an allowlist entry. | Audit checklist in [§7.3](#73-bypass-audit) signed off per phase |
| **R56** | A load test SHALL simulate ≥3 tenants with skewed traffic and assert p95 latency and error rate do not regress versus the current baseline. The scenario SHALL include a youth-league tenant — the thesis's proposed first scalability exercise (§3.4). | k6 scenario + Grafana comparison |
| **R57** | The isolation suite SHALL be generative: for each tenant-aware model, create two tenants, one row each, and assert every list/detail route never returns the other's row. | Parametrised test over the R4 matrix |
| **R58** | A "tenant stamping" property test SHALL assert that every object created through any write path (view, serializer, projector, command) carries the resolved tenant, or fails. | Property/invariant test |

### 3.8 Frontend

| ID | Requirement | Verified by |
|---|---|---|
| **R59** | The tenant SHALL be part of the route (`/leagues/<slug>/...`) or, for existing SPAs, of the boot payload; SPAs SHALL NOT infer a tenant from the first row they receive. | Frontend tests with two tenants |
| **R60** | UI guards SHALL consume `GET /api/me/permissions/?league=<slug>` once per tenant and cache it; guards SHALL be **cosmetic** (hide/disable), with the server as the only authority. | Test that a forged client permission still gets 403 |
| **R61** | Client caches (React Query/SWR, `localStorage`, service worker, IndexedDB) SHALL be keyed by tenant. `scorecard_v2`'s IndexedDB SHALL namespace databases/outboxes by tenant and drop entries for a tenant the device no longer holds a lock in. | Storage-key test; offline replay test |
| **R62** | The league switcher SHALL be the only way to change the active tenant, SHALL persist to the session (not only `localStorage`), and SHALL clear tenant-scoped caches on switch. | E2E test of switching |
| **R63** | Staff-only navigation today (`is_staff` in templates and menus, 11 template sites) SHALL become permission-driven; a user with no role in the active tenant SHALL see no admin entries, not disabled ones. | Menu tests per role |
| **R64** | Offline writes queued under tenant A SHALL be rejected, not silently applied, if the device's lock is now held under tenant B. | `scorecard_v2` outbox conflict test |

---

## 4. Decisions — settled defaults and open questions

Each decision records its status. **D1 is settled by the thesis (§4.1)**, **D6 is settled by the
technical constraints**, and the tenancy-library half of **D9 is settled by the thesis's library
survey (§3.3)**; these are recorded so the plan has one source of truth, not reopened. The
remaining decisions are **Awaiting decision** — the recommendation is the default the plan is
written against, and changing it changes the named requirements.

### D1. Tenant grain — League, Association, or two-level?

- **Question**: Is the isolation unit a `League` (DFFL, DFFL2, DFFL-F), an `Association`
  (e.g. a regional federation), or both (Association owns Leagues)?
- **Recommended default**: **League**, with `Association` kept as a grouping/reporting layer.
- **Rationale**: The thesis settles this itself in §4.1: it evaluates federal states
  (*Bundesländer*) as tenants and rejects them because federal leagues, state leagues and
  merged divisions cross boundaries and the structure changes annually, settling on the 13
  leagues as 13 tenants. `Gameday` already carries `league`; the thesis's own examples
  ("DFFL", "DFFL2", "DFFL-F") are leagues; roles like "league admin" are named after it; the
  snapshot and league-table URLs are already league-keyed. Making Association the tenant
  would force a second key on every gameday for no current product need.
- **Alternatives**: (a) Association as tenant — simpler federation reporting, but every
  league would become a sub-scope and cross-association sharing gets harder; (b) two-level
  → `Tenant` table with `parent` — most flexible, largest migration, and `Association` would
  need a `parent` FK it does not have today.
- **Impact**: R1, R2, R25, R32 and the whole URL shape depend on it. The thesis settles it, so
  this is recorded rather than open; only a deliberate rejection of the thesis would reopen it.
- **Status**: **Settled by the thesis §4.1** — 13 leagues as 13 tenants; federal states
  rejected. No further decision needed.

### D2. How `Team` is scoped — no league FK, seasonal league movement

- **Question**: `Team` has no league FK and a team can play in different leagues in different
  seasons. What is a team's tenant?
- **Recommended default**: **Derived membership.** Team read scope = teams that appear in
  `SeasonLeagueTeam` for the resolved tenant (and requested season). Add **no** `Team.league`.
  For team administration, derive the admin's scope from `UserRole(team=...)`, not from a
  league column.
- **Rationale**: The thesis's §4.3.2 names "Gamedays **or Teams**" as objects receiving a
  `tenantId`. That proposal does not stand against the current domain: `Team` has no league FK
  (B3) and moves between leagues by season, so a `Team.league` column would be factually wrong
  and would break season rollover and eligibility. The derived `SeasonLeagueTeam` path keeps the
  thesis's *intent* — every tenant-owned row has a tenant key — without inventing data the
  domain does not have. This is also exactly why the old branch's assumption fails.
- **Alternatives**: (a) `Team.home_league` FK as an ownership hint — cheap for the admin UX,
  but it will be mistaken for the isolation key and cause leaks; if adopted, R6 constrains it
  to non-security use. (b) A `TeamTenant` join table with validity dates — correct but
  duplicates `SeasonLeagueTeam`.
- **Impact if deferred**: Blocks R5, R6, R36 and all passcheck/teammanager isolation tests.
- **Status**: **Awaiting decision.**

### D3. Which reads stay public — and therefore which routes get `unscoped()`

- **Question**: The snapshot is the only *public API*, but sitemaps, the liveticker widget,
  `/share/widget/`, the game-progress page and the anonymous league-table pages read across
  all leagues. Do they stay global?
- **Recommended default**: **Yes — they stay global and explicitly unscoped.** Encode them in
  the route manifest (R16) and make each one an `unscoped(reason=...)` call site. Do not
  tenant-scope public reads: a fan following a league should not need a tenant cookie. A public
  read MAY still carry a tenant in the URL (e.g. `/api/leagues/<slug>/standings/`) to pick the
  subject; the tenant then scopes *what* is shown, never *whether* the visitor is a member
  (R15). The snapshot stays tenant-less and cross-league.
- **Rationale**: The snapshot-only policy already decided what is public; tenancy must not
  silently break embeds, SEO or the liveticker worker. The risk is *forgetting* one, not
  allowing them.
- **Alternatives**: (a) Require `?league=` on public reads — breaks existing embeds and the
  sitemap; (b) public reads stay on the global manager with no audit — loses the bypass
  inventory that R21 provides.
- **Impact if deferred**: Blocks R16, R21, R29 and the public-surface regression tests.
- **Status**: **Awaiting decision.**

### D4. Cross-league and global reads

- **Question**: National rankings, multi-league playoffs, `leagues_for_league_points`,
  `EligibilityRule.eligible_in`, `TeamRelationship.additional_teams`, the journey 21-day
  window and staff dashboards all span leagues. How do they work under a single-tenant context?
- **Recommended default**: **Two explicit mechanisms, no implicit third.** (1) *Read
  aggregation*: a route declared `is_global` that composes per-tenant queries via
  `tenant_scope()` in a loop (or a documented bridge query), returning only published data to
  non-admins. (2) *Bridge tables*: cross-tenant relationships are rows (R10), and a bridge
  never widens default scope — it grants access to a named resource.
- **Rationale**: A single global flag on a queryset is how leaks happen; making the two
  mechanisms explicit keeps them auditable. `leagues_for_league_points` is the proof that
  cross-tenant aggregation is a real product feature, not an edge case.
- **Alternatives**: (a) A "multi-tenant context" (set of tenants) — powerful but multiplies
  every test; (b) forbid cross-league features until tenancy ships — a product regression.
- **Impact if deferred**: Blocks the league-table aggregation work, journey dashboard and
  national-ranking features; does **not** block core CRUD isolation.
- **Status**: **Awaiting decision.**

### D5. Superuser god mode and audit depth

- **Question**: Should `is_superuser` bypass tenant filtering silently? What is logged?
- **Recommended default**: **No silent bypass.** Superusers get the same tenant scoping;
  cross-tenant access requires an explicit, per-request "god mode" opt-in that writes an audit
  row (R48). Audit writes and denials, never bulk reads (R47).
- **Rationale**: A silent superuser bypass makes every isolation test meaningless in
  production and turns one compromised admin account into a full data breach. Audit tables
  that record every read become an unbearable write load on gameday.
- **Alternatives**: (a) superuser bypasses always, audit only writes — simplest, weakest;
  (b) audit every read for superusers — noisy but defensible for a small admin set.
- **Impact if deferred**: Blocks R47, R48 and the security audit; also blocks the admin
  isolation design ([§5.7](#57-admin-isolation)).
- **Status**: **Awaiting decision.**

### D6. Sync vs async tenant context

- **Question**: The response document asks whether `threading.local` or `contextvars` is
  required.
- **Recommended default**: **`contextvars`, unconditionally** (R17). The project is sync WSGI
  today, but the liveticker already runs an SSE worker process, `health_check` documents a
  past async deadlock, and Django 6 is async-first in its own internals. `contextvars` is
  correct in both worlds; `threading.local` is correct in neither under async and leaks across
  reused threads.
- **Rationale**: It costs nothing to be correct here, and switching later means re-auditing
  every context read.
- **Alternatives**: `threading.local` — only if the project freezes on sync WSGI forever, and
  even then it is the weaker choice.
- **Impact**: R17, R18 and the streaming guarantee are built on it; choosing otherwise would
  rewrite both.
- **Status**: **Settled: `contextvars`** — no alternative survives async or streaming (R17/R18).
  Recorded, not open.

### D7. Role migration from 144 `is_staff` occurrences

- **Question**: How do 144 `is_staff` occurrences across 30 Python files (137/29 if test
  modules are also excluded; plus 11 template sites and a frontend hook) become roles without a
  big-bang change?
- **Recommended default**: **Classify, then migrate per app**, in this order: (1) *kernel*
  sites that become the policy check; (2) *authorization* sites that become
  `can(user, action, tenant, obj)`; (3) *presentation* sites that become permission flags in
  the context payload; (4) *seed/demo/test* sites that stay `is_staff` (they create fixtures,
  not authority). Use the write → shadow-read → enforce → deprecate ladder (R41–R46), app by
  app, with the shadow-read disagreement report as the gate.
- **Rationale**: A single mechanical replacement would either over-grant (staff of league A
  gets league B) or under-grant (a volunteer loses access mid-season). The four classes have
  different correctness bars.
- **Alternatives**: (a) keep `is_staff` as a global superuser flag and add roles only for new
  features — fastest, but leaves the old security model in place and doubles the concepts;
  (b) big-bang replacement behind one flag — untestable in practice.
- **Impact if deferred**: Blocks R35, R41–R46 and the frontend guard work. This is the
  longest-running decision to execute even after it is made.
- **Status**: **Awaiting decision.**

### D8. Team ↔ league membership integrity

- **Question**: `SeasonLeagueTeam(season, league)` has no uniqueness constraint, and historic
  duplicates exist. Tenant scoping reads this table on every team query. Do we fix it first?
- **Recommended default**: **Yes — add the constraint in Phase 2**, after the
  `report_duplicate_season_league_teams` command reports zero duplicates in stage and prod.
- **Rationale**: Duplicate membership rows make "a team's league for a season" ambiguous,
  which makes `TEAM_MANAGER` scope ambiguous (R36). This is a prerequisite, not an
  optimisation.
- **Alternatives**: tolerate duplicates and pick `MIN(pk)` — hides a data bug inside an
  authorization decision.
- **Impact if deferred**: Blocks R4 (index/constraint review) and R36.
- **Status**: **Awaiting decision.**

### D9. Tenancy library and database platform

- **Question**: Should a tenancy library be adopted, and should PostgreSQL with row-level
  security replace MySQL?
- **Recommended default**: **No tenancy library — extend `django.contrib.auth` (settled by the
  thesis §3.3), and stay on MariaDB/MySQL without relying on RLS.** Enforce in the application
  layer (managers + policy kernel), with the DB as defence in depth via constraints and
  indexes, not as the isolation mechanism.
- **Rationale**: The thesis's library survey (§3.3, B21) evaluates `django-tenants`,
  `django-tenant-schemas`, `django-multitenant` and `django-db-multitenant` and rejects them
  for this stack in favour of extending `django.contrib.auth`; the bespoke `access` app follows
  that route. The production stack, backups, LXC test DB, `dbaccess` tooling and every
  migration are MariaDB. A platform migration is a separate, larger project; RLS would also
  hide isolation failures from tests unless every test runs as a non-owner role.
- **Alternatives**: Postgres + RLS — genuinely stronger against ORM bypass, but changes
  `dbaccess`, the snapshot cache and the deployment story. A tenancy library — rejected by the
  thesis on maintenance and fit grounds.
- **Impact**: the library decision unblocks R2/R32 and Phase 1; the database platform affects
  nothing structural in this plan.
- **Status**: **Library: settled by the thesis §3.3 (B21).** **Database platform: Awaiting
  decision** — recommendation is to stay on MariaDB.

---

## 5. Proposed target architecture

### 5.1 App layout and import direction

```
league_manager/                  project: settings, root URLs, middleware wiring
├── middleware/tenancy.py        resolution + context + enforcement (imports access.context)
└── settings/base.py             INSTALLED_APPS order, DRF defaults

access/                          NEW app: tenancy + RBAC
├── context.py                   contextvars only — imports NO Django models
├── models.py                    UserRole, RoleAudit, TenantAudit; FKs to gamedays.League/Team
├── policy.py                    can(user, action, tenant, obj) — the single kernel
├── permissions.py               DRF permission classes (import context + policy only)
├── querysets.py                 TenantScopedQuerySet / Manager, unscoped()
├── routing.py                   route manifest (global vs tenant-scoped)
├── admin.py                     tenant-filtered ModelAdmin base
└── management/commands/         seed_roles_from_is_staff, audit_tenancy_coverage

gamedays/                        core domain — imports access.context, access.permissions only
gameevents/  gameday_designer/  officials/  passcheck/  liveticker/  league_table/
                                 consumers — import access.* freely
```

**Import rules**

1. `access.context` and `access.permissions` SHALL import **no** Django models at module
   import time. `access.models` imports `gamedays.models` (League, Team) — allowed, because
   `access` sits *above* the domain.
2. `gamedays` MAY import `access.context` / `access.permissions` / `access.querysets`; it
   SHALL NOT import `access.models` (that would be a circular import and a layering error).
   If `gamedays` needs effective roles, it receives them through the request/context, not by
   querying `UserRole`.
3. `access` SHALL be added to `BOUNDARY_MODULES` in `scripts/check_app_boundaries.py` once
   the first consumer import exists, so `gamedays → access.models` fails CI.
4. `access` SHALL be listed in `INSTALLED_APPS` immediately after `gamedays`.

This keeps the existing boundary intact: no new `gamedays → consumer` edge.

### 5.2 Tenant context

```python
# access/context.py — no model imports
from contextlib import contextmanager
from contextvars import ContextVar

_tenant = ContextVar("leaguesphere_tenant", default=None)

class TenantContextMissing(RuntimeError):
    """Raised when tenant-scoped data is touched without a resolved tenant."""

def current_tenant():
    return _tenant.get()

def require_tenant():
    tenant = _tenant.get()
    if tenant is None:
        raise TenantContextMissing(
            "Tenant-scoped query outside a tenant context; "
            "use tenant_scope(...) or objects.unscoped(reason=...)."
        )
    return tenant

@contextmanager
def tenant_scope(tenant):
    token = _tenant.set(tenant)          # restores the PREVIOUS value on exit
    try:
        yield tenant
    finally:
        _tenant.reset(token)
```

Middleware sets the scope around `get_response`; `tenant_scope()` is what projectors,
commands and aggregation routes use. Because `Token.reset()` restores the previous value,
nesting is correct by construction (R17).

### 5.3 Opt-in tenant-aware querysets and the unscoped path

```python
# access/querysets.py
class TenantScopedQuerySet(models.QuerySet):
    def _tenant_filtered(self):
        tenant = require_tenant()
        return self.filter(**{f"{self.model.tenant_field}": tenant})

class TenantScopedManager(models.Manager.from_queryset(TenantScopedQuerySet)):
    def get_queryset(self):
        return super().get_queryset()._tenant_filtered()

    def unscoped(self, *, reason=""):
        audit_unscoped(self.model, reason)   # one place, one log line
        return super().get_queryset()
```

- `tenant_field` is declared per model (`"league"`, `"gameday__league"`, …) and validated at
  app-ready time, so a typo fails startup rather than a query.
- Opt-in is deliberate: wrapping `models.Manager` globally would change every query in the
  project at once and make the shadow-read stage impossible.
- `unscoped()` is the *only* escape (R20), takes an optional reason, and is logged centrally.

### 5.4 Middleware chain

Order in `MIDDLEWARE` (after authentication, before the view):

```
... django.contrib.auth.middleware.AuthenticationMiddleware
    league_manager.middleware.tenancy.TenantResolutionMiddleware   # 404/403/400 + audit
    league_manager.middleware.tenancy.TenantContextMiddleware      # contextvars + finally
    league_manager.middleware.tenancy.TenantEnforcementMiddleware  # bypass assertion + log
... django.contrib.messages ... etc.
```

- Resolution runs after sessions/auth because it needs `request.user` and the session key.
- Enforcement is last so it can read what the view touched.
- `TenantEnforcementMiddleware` is the corrected third layer of the response document: it
  observes, it cannot filter. That is a feature — a filter that silently fails is worse than
  an assertion that screams.

#### 5.4.1 How enforcement detects a bypass

| Concern | Decision |
|---|---|
| Detection (ORM) | `TenantScopedManager.get_queryset()` registers `(model, "scoped")`; `unscoped(reason=...)` registers `(model, "unscoped", reason)`. The registry is a per-request `contextvar` list — no DB, no global mutable state. |
| Detection (every statement) | `connection.execute_wrapper` inspects **all** executed statements (ORM and raw); a statement touching a tenant-owned table without any tenant predicate (`league_id`/`team_id` join) records `unscoped_statement`. This also catches a tenant-owned model that forgot `TenantScopedManager`, which is the real reason R4's coverage check exists. |
| Allowlist | `access/routing.py::ROUTE_TENANT_POLICY`, keyed by **URL name** (not path, so slugs and ids cannot drift). Each entry is `scope` (one of `tenant` / `global`), an optional `unscoped_models` set, and a non-empty `reason`. A model can be listed unscoped only with a reason. |
| When it runs | In `TenantEnforcementMiddleware`, after `get_response` returns and before the response leaves the middleware; `request.resolver_match.url_name` is available from dispatch time. |
| Violation, `DEBUG` / `TENANCY_STRICT=True` | Raise `IsolationViolation` → HTTP 500. The whole test suite runs strict, so a bypass fails CI. |
| Violation, production default | Log `isolation_bypass` at ERROR with request id, user, url name, model and reason; increment `tenancy_isolation_bypass_total`; return the response (availability over fail-closed). Flip `TENANCY_STRICT=True` per environment once the metric is zero. |
| Cost | In-memory registry + dict lookup: **0 queries** and no per-row work, so R54's budget is untouched. |

### 5.5 URL and API shape

```
/api/leagues/<slug>/gamedays/                 read = public-read; write = LEAGUE_ADMIN
/api/leagues/<slug>/gamedays/<id>/            read = public-read (published); write = LEAGUE_ADMIN
/api/leagues/<slug>/gamedays/<id>/publish/    action (LEAGUE_ADMIN)
/api/leagues/<slug>/teams/                    list = public-read (published teams);
                                              create = LEAGUE_ADMIN;
                                              edit own = TEAM_MANAGER via UserRole(team=...);
                                              edit any = LEAGUE_ADMIN (derived scope, R5/R36)
/api/leagues/<slug>/standings/                published standings (public-read, no membership)
/api/leagues/<slug>/officials/assignments/    LEAGUE_ADMIN
/api/me/leagues/                              memberships (R27)
/api/me/permissions/?league=<slug>            effective actions (R27)
/api/snapshot/                                public, global, unscoped (R29)
```

Flat legacy routes stay valid through the migration and resolve the tenant from the object
they load (R26).

### 5.6 Authorization kernel

```python
# access/policy.py
GLOBAL_ROLES = {Role.SYSTEM_ADMIN, Role.REFEREE, Role.PLAYER}   # scope_key sys / global

def can(user, action, tenant, obj=None) -> bool:
    # 1. Public-read short-circuit (R15): anonymous is fine for PUBLISHED data.
    #    obj is None means a collection endpoint; its queryset is still filtered to published rows.
    if action.public and is_publicly_readable(obj):
        return True
    if not user.is_authenticated:
        return False
    # 2. Roles that apply in this tenant, including global identities (see below).
    roles = roles_in_tenant(user, tenant)
    if Role.SYSTEM_ADMIN in roles:
        if action.platform:                 # league creation, seeds, dbaccess (matrix, §3.4)
            return True
        roles |= {Role.LEAGUE_ADMIN}        # in-tenant admin rights, rows stay tenant-filtered
    # 3. Role + object scope (R34), per the matrix in §3.4.
    return any(rule.allows(role, action, obj) for role in roles)
```

- `is_publicly_readable()` SHALL be an **explicit per-model predicate map** in `access/policy.py`
  (`Gameday: status == "PUBLISHED"`, `ScheduleTemplate: sharing != PRIVATE`, …),
  not a bare `getattr`. A draft gameday, a private roster or an unpublished template SHALL
  return `False`; the sketch above is illustrative, the map is the contract.

```python
def roles_in_tenant(user, tenant) -> set:
    rows = (
        UserRole.objects.filter(user=user)
        .filter(
            Q(league=tenant)                                                     # LEAGUE_ADMIN
            | Q(league__isnull=True, team__isnull=True, role__in=GLOBAL_ROLES)    # sys / global
            | Q(team__in=SeasonLeagueTeam.teams_for(tenant, active_season()))     # TEAM_MANAGER (new helper)
        )
        .values_list("role", flat=True)
        .distinct()
    )
    return set(rows)
```

- **Global rows must be included by the tenant lookup.** `SYSTEM_ADMIN` (`sys`) and
  `REFEREE`/`PLAYER` (`global`) carry no tenant (R3); a `league=`-only filter would never find
  them and the kernel would deny every global role.
- **`TEAM_MANAGER` rows must be resolved through the team**, because R3 deliberately stores no
  league on them. `SeasonLeagueTeam.teams_for(tenant, season)` is the same derived scope as R5.
  Referee/player authority is only identity here: it still needs the assignment/ownership
  predicates from R37/R34 before any action is allowed.
- **`SYSTEM_ADMIN` is not a global read bypass.** It passes `action.platform` actions and
  otherwise acts as a `LEAGUE_ADMIN` inside the resolved tenant; its rows stay tenant-filtered.
  Cross-tenant reads require the audited god-mode opt-in (R48, D5), implemented at the context
  layer as an explicit, logged `unscoped()` scope — never as a silent `True` in the kernel.
- The result is cached per request and invalidated on role change (R40); at most **one** query
  for the role set (R54's second cached query).
- `action` is a small enum/constant (`"gameday.publish"`, `"roster.edit"`), not a Django
  permission string (R33). `action.public` is the same flag the route manifest uses (R16) and
  `action.platform` is the narrow set the matrix grants to `SYSTEM_ADMIN` only (league creation,
  seeds, `dbaccess`). The matrix in [§3.4](#34-roles-and-the-permission-matrix) is the table
  this implements.
- DRF permission classes are thin adapters over `can()`; HTML views use a mixin over the same
  function; admin uses `has_*_permission` over the same function.
- Object scope is a separate predicate (`owns`, `team_of`, `assigned_to`) so "role check that
  ignores the object" is visible in review (R34).

### 5.7 Admin isolation

- A shared `TenantModelAdmin` sets `get_queryset()` to the tenant-scoped manager and
  `has_change_permission()` via the kernel.
- `SYSTEM_ADMIN` sees a tenant column and must switch tenant (session) to act; god mode (D5)
  is a visible banner, not a silent state.
- `gameevents` admin is already read-only (append-only store) and stays that way.
- `dbaccess` admin stays system-scoped but records the tenant of the accessed data (R52).

### 5.8 Write paths that bypass views

| Path | Tenant source | Requirement |
|---|---|---|
| DRF serializers / views | request context | R34 |
| `gameevents` projector (`project_submission`) | derived from `gameinfo.gameday.league_id`; never from the payload | R58; test that a forged payload league is ignored |
| Management commands | `--league` or explicit iteration | R22 |
| Seeders (`seed_demo_data`, `seed_scorecard_demo`) | fixture data, may use `unscoped()` | R22, R47 |
| Signals / `save()` overrides | must not query tenant implicitly | Reviewed in bypass audit |
| Offline replay (`scorecard_v2` outbox) | device lock + tenant namespacing | R61, R64 |
| Admin actions | `TenantModelAdmin` | §5.7 |

---

## 6. Phased delivery plan

**Eight phases (P0–P7).** Each is independently shippable and testable; each has an exit gate
that must be green before the next starts. Phase numbering is separate from the six phases in
the 2026-02-25 response document (which underestimated testing and frontend and assumed the old
data model).

### Phase 0 — Decisions and invariants (no product code)

**Entry**: this plan accepted; gate 0a defaults recorded in §4.
**Work**: record the thesis-settled defaults (D1, D6, the library half of D9) as adopted;
resolve the open decisions (D2–D5, D7–D9); sign off the permission matrix; write the
tenant-key matrix (R4) as code (`scripts/check_tenancy_coverage.py`) with every model listed;
add the boundary entry for `access`.
**Exit (two gates)**:
- **0a — settled defaults recorded** (D1, D6, D9-library). This is already satisfied by §4 and
  **unblocks Phase 1**; Phase 1 does not depend on the open decisions.
- **0b — all decisions recorded** (D2–D5, D7–D8, D9 database platform), the coverage script runs
  and fails on an unlisted model, and the matrix is reviewed by a second person. **0b gates
  Phase 3** (read isolation), not Phase 1.
**Blocked by**: D2, D3, D4, D5, D7, D8, D9 (database platform) — for gate 0b only.

### Phase 1 — Foundation: `access` app, context, managers, middleware

**Entry**: Phase 0 **gate 0a** — D1, D6 and the D9 library half are recorded in §4. Phase 1 is
independent of the open decisions: D7/D8 gate Phase 2, D2–D4 gate Phase 3, D5 gates Phase 4.
**Work**: `access/context.py`, `querysets.py`, `models.py` (`UserRole` + audit), middleware
1/2/3 with the route manifest, `access/routing.py`, the bypass registry and enforcement
mechanism (§5.4.1), `/api/me/leagues/`, `TenantModelAdmin`, feature flags default **off**. No
model is converted yet.
**Exit**: unit tests for context (nesting, exception, streaming), resolution (precedence,
404/403/400), kernel (anonymous published/unpublished, global roles, team-scoped manager), and
enforcement (violation strict/log, zero extra queries); `black .`; boundary check green;
100% branch coverage of every function the phase creates or changes (§7.6); zero behaviour
change in staging with flags off.

### Phase 2 — Identity and role backfill

**Entry**: Phase 1 exit, with D7 and D8 recorded. Phase 2 starts with the mandatory
`audit_identity_links` report; no backfill runs before it exists.
**Work**: `Person.user`, `Official.user` with the R7 audit and mapping rules;
`seed_roles_from_is_staff` command; dual-write for role changes (R42); fix `SeasonLeagueTeam` uniqueness (D8) after the
duplicate report is clean; retire `check_teammanager` in favour of `UserRole(team=...)` behind a
shim.
**Exit**: on a prod clone, every authority-holding user (`is_staff` or legacy team-manager
permission) has an equivalent `UserRole`; `audit_identity_links` reports **zero ambiguous**
matches, every matched role-holder is linked, and the unmatched-official list is reviewed and
accepted; `report_duplicate_season_league_teams` returns zero; tests for every mapping rule;
100% branch coverage of every function the phase creates or changes (§7.6).

### Phase 3 — Read isolation, app by app

**Entry**: Phase 2 exit **and Phase 0 gate 0b** (D2, D3, D4 recorded — they decide team scope,
public reads and cross-league behaviour).
**Work**: convert tenant-aware models in order `gamedays` → `league_table` → `passcheck` →
`officials` → `journey` → `gameday_designer`; route manifest entries for public reads;
shadow-read disagreement report (R43) running in production.
**Exit**: per app — isolation suite green (R53/R57), query counts flat or +1 (R54), zero
shadow-read disagreements over a gameday weekend, no unlisted `unscoped()` site, 100% branch
coverage of every function the phase creates or changes (§7.6).

### Phase 4 — Write authorization

**Entry**: Phase 3 exit for an app, with D5 and D7 recorded.
**Work**: replace `is_staff` write checks with `can(...)`; object-scope predicates; device
lock release (R39); transfer approval across two teams (R10); projector stamping (R58);
admin actions.
**Exit**: permission matrix tests per role; cross-tenant write returns 403; admin isolation
tests; bypass audit (R55) signed off; 100% branch coverage of every function the phase creates
or changes (§7.6).

### Phase 5 — API surface

**Entry**: Phase 4 exit for the endpoints being moved, with D4 recorded.
**Work**: nested `/api/leagues/<slug>/...` routes; deprecation headers on flat routes;
`/api/me/permissions/`; error envelope (R28); throttle per tenant (R50); export command
(R51).
**Exit**: contract tests for new routes; snapshot byte-identical; no public endpoint change;
deprecation plan published; 100% branch coverage of every function the phase creates or changes
(§7.6).

### Phase 6 — Frontend and offline

**Entry**: Phase 5 exit, with D3 and D5 recorded.
**Work**: tenant-aware routes/boot payload; permission-driven menus (R63); league switcher
(R62); cache keying (R61); `scorecard_v2` outbox namespacing and conflict rule (R64);
remove `useIsStaff` in favour of permissions. UI work follows the existing button patterns
(`docs/topics/guides/ui-button-patterns.md`: primary CTA full width, cancel
`btn-outline-danger`) — permission-aware only, within the non-goal of no visual redesign.
**Exit**: frontend tests per role; eslint zero errors; offline replay test across a tenant
switch; no `is_staff` reads in frontend code; 100% branch coverage of every function the phase
creates or changes (§7.6).

### Phase 7 — Deprecate `is_staff` and legacy permissions

**Entry**: Phase 6 exit, with D7 recorded; remaining `is_staff` sites are only
seeds/tests/Django-admin gate.
**Work**: delete legacy `Permissions`/`UserPermissions`, `check_teammanager`, the
`is_staff`-based helpers; decide `is_staff`'s fate (D7); remove flat API routes; security
audit; load test (R56); documentation + in-app help update.
**Exit**: final `rg` inventory in §10 matches reality; security audit signed; load test
within budget; docs updated; 100% branch coverage of every function the phase creates or changes
(§7.6).

### 6.1 `is_staff`: write → view → deprecate

| Stage | Code change | Reads authority from | Rollback | Gate to next stage |
|---|---|---|---|---|
| **Write** | `seed_roles_from_is_staff`, dual-write on role changes | `is_staff` (unchanged) | Delete `UserRole` rows | every authority-holding user (`is_staff` or legacy team-manager permission) has an equivalent `UserRole`; 0 unknown users |
| **View** (shadow-read) | Kernel evaluated next to `is_staff`; disagreements logged | `is_staff` | Turn off logging | 0 disagreements over one gameday weekend |
| **Enforce-read** | Tenant managers on, per app flag | `UserRole` | Flag off per app | Isolation + query-count suites green |
| **Enforce-write** | `can()` replaces `is_staff` writes | `UserRole` | Flag off per app | Matrix tests + bypass audit |
| **Deprecate** | Delete legacy tables/helpers, then `is_staff` reads | `UserRole` | Restore from migration | `rg` inventory matches §10 |

### 6.2 Indicative sizing — planning estimates, not commitments

One engineer, order-of-magnitude, to be re-baselined after Phase 1. Parallel work shortens
elapsed time, not the total.

| Phase | Estimate | Depends on | Notes |
|---|---|---|---|
| 0 — Decisions | 1–2 weeks elapsed | — | Workshop + an owner per decision; no code |
| 1 — Foundation | 3–4 weeks | 0a | `access` app, context, managers, middleware, kernel, enforcement |
| 2 — Identity/role backfill | 2–3 weeks | 1, D7, D8 | The identity data audit dominates |
| 3 — Read isolation | 5–8 weeks | 2, 0b, D2–D4 | Six apps, one PR per app |
| 4 — Write authorization | 4–6 weeks | 3 per app, D5, D7 | Matrix, admin, projectors |
| 5 — API surface | 3–4 weeks | 4 per endpoint, D4 | Nested routes + deprecation |
| 6 — Frontend/offline | 3–4 weeks | 5, D3, D5 | Six apps + offline outbox |
| 7 — Deprecate/audit | 2–3 weeks | 6, D7 | Security audit + load test |
| **Total** | **≈ 23–34 engineer-weeks** | | Excludes review latency and staging waits |

---

## 7. Test strategy

### 7.1 Isolation test matrix (mandatory per tenant-aware model)

| Case | Setup | Expected | Assertion |
|---|---|---|---|
| Cross-tenant read (detail) | Row in tenant B, request under A | **404** | status code + body has no tenant B fields |
| Cross-tenant read (list) | Rows in A and B | Only A's rows | row ids + count |
| Cross-tenant write | `POST`/`PATCH` into B under A | **403** (object) or 404 (detail) | status + DB unchanged |
| Cross-tenant relation | Bridge row A→B | Readable only with the bridge grant | row visibility |
| Unset tenant | Tenant-aware manager, no context | `TenantContextMissing` raised | exception type, not empty list |
| Public endpoint | `/api/snapshot/`, sitemap | Allowed, global | 200 + cross-tenant rows present |
| Public-read detail, published | published gameday, anonymous, tenant in URL | 200 | body contains published fields only |
| Public-read detail, draft | draft gameday, anonymous | 404 | no draft fields in body |
| Public-read, other tenant's row | published gameday in B via A's detail URL | 404 | R49 exception does not leak across tenants |
| God mode off | superuser, no opt-in | Tenant-scoped | 404 for other tenant |
| God mode on | superuser + opt-in | Allowed | 200 + audit row |
| Unknown tenant | `/api/leagues/nope/` | 404 | audit `tenant_not_found` |
| No membership, member action | known tenant, no role | 403 | audit `tenant_forbidden` |
| No membership, public-read | known tenant, no role, published data | 200, published rows only | no draft/private row in body |

### 7.2 Query counts

- Every touched endpoint keeps `assertNumQueries` and the count must not grow with result
  size (repo policy).
- Tenant resolution and the role set cost **at most two** queries per request, both cached in
  the request object; tests assert the delta explicitly (R54).
- The top ten list views get a scripted `EXPLAIN` review recorded in the phase exit, not a
  unit-test assertion: plan shapes vary across MariaDB versions, and a brittle assertion would
  be disabled the first time it flakes. The review must show the R11 composite index is
  chosen.

### 7.3 Bypass audit

A checklist, signed per phase, covering: raw SQL (4 sites, B15), management commands (22,
B16), projectors (B17), admin actions (24 `admin.site.register` calls), signals, seeders,
offline replay (B18), and any `unscoped()` call site. Each gets either a named test or an
allowlist entry with a reason. **No entry without a reason.**

### 7.4 Security audit

Before Phase 7 exits: re-run the isolation matrix against stage with realistic multi-league
data; attempt IDOR on every detail route; verify 404-vs-403 consistency (R49); verify audit
coverage for role changes and god mode; verify no secret is tenant-keyed (R52); verify the
snapshot and embed surfaces are unchanged.

### 7.5 Load test

k6 scenario with three tenants and skewed traffic (one heavy league, one youth league, one
light league) on stage; compare p95 and error rate against the current baseline; assert the
tenant resolution and policy kernel add no measurable overhead at 10 VUs (the repo's existing
ramp). Per-tenant throttles (R50) are exercised.

### 7.6 Branch coverage of changed functions

CI runs the repo's branch-coverage gate **per shard**:

```bash
python3 scripts/check_branch_coverage.py --coverage coverage.json --base origin/master --shard <shard>
```

It scopes the report to **functions created, changed or moved by the PR** and requires **100%
branch coverage in each of them**. A `# pragma: no cover` is accepted only with an inline reason
on the same line; a bare pragma fails the gate. See
`docs/topics/planning/current/2026-11-25-phase1-plan.md` for the check's own contract.

This complements rather than replaces the other gates: TDD (B19) proves the behaviour was
specified first, query-count assertions (R54) prove the data access does not scale with the
result set, and branch coverage proves **every new decision path actually executes**. For this
plan the prime targets are:

- the policy kernel's role branches and the published/draft predicate map (§5.6) — every role
  and both public-read outcomes;
- the enforcement mechanism's strict/log split and allowlist hit/miss (§5.4.1);
- the resolver's 404 / 403 / 400 outcomes and the conflict path (R13–R15);
- `unscoped()` reason validation (R20).

Because the gate is per shard, a phase must keep **its own** shard green; a broad suite in
another shard does not cover a changed function.

---

## 8. Risk register

| ID | Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|---|
| K1 | A forgotten filter leaks cross-tenant data in production | Medium | Critical | Loud `TenantContextMissing`, enforcement middleware, isolation suite, shadow-read |
| K2 | Scope creep into a full domain-model rewrite (`Team.league`) | High | High | Explicit non-goal; R5/R6; D2 decided before any team-scoped read (Phase 3) |
| K3 | `is_staff` migration over- or under-grants a volunteer mid-season | High | High | Write → shadow-read → enforce; disagreement report; per-app flags |
| K4 | Cross-league features (league points, eligibility, transfers) break | High | High | Bridge tables + explicit global routes (D4); feature tests before isolation flips |
| K5 | Public surfaces (snapshot, sitemap, embeds, liveticker) regress | Medium | High | Route manifest, byte-identical snapshot contract, embed tests |
| K6 | Projector/management-command writes bypass the tenant | Medium | High | Tenant derived from `gameinfo.gameday`, `--league`, bypass audit |
| K7 | `contextvars` leaks or is lost across streaming/async boundaries | Low | High | R17/R18 tests, token reset, streaming generator test |
| K8 | Query-count or latency regression on gameday weekend | Medium | High | Composite indexes, +1-query budget, scripted EXPLAIN review, load test |
| K9 | Offline scorecard queues replay into the wrong tenant | Medium | High | Tenant-namespaced outbox, device-lock conflict rule (R64) |
| K10 | Admin interface exposes other tenants to a scoped admin | Medium | High | `TenantModelAdmin`, admin isolation tests, god-mode banner |
| K11 | Duplicate `SeasonLeagueTeam` rows make scope ambiguous | Medium | Medium | D8: constraint after duplicate report is clean |
| K12 | The new app recreates the old circular dependency | Low | High | Import rules §5.1, boundary check includes `access` |
| K13 | Audit logging becomes a write bottleneck on gameday | Medium | Medium | Writes/denials only (R47), async/batched, no read audit |
| K14 | Plan stalls on decisions and never ships | High | Medium | Run a decision workshop with the league administrators; assign an **owner and due date for each** of D2–D5, D7, D8 and D9-DB; start Phase 1 in parallel on the settled grain/context so the programme is never fully blocked |

---

## 9. Status tracker

| Phase | State | Blocking decisions | Notes |
|---|---|---|---|
| 0 — Decisions & invariants | **0a done; 0b in progress** | 0b: D2–D5, D7, D8, D9 (database platform) | D1, D6 and the D9 library half are settled and recorded |
| 1 — Foundation (`access`, context, middleware) | **Ready to start** | none — gate 0a satisfied | Design in §5; flags off by default; independent of 0b |
| 2 — Identity & role backfill | Planning | D7, D8 | `Person.user`, `Official.user`, `UserRole` seed |
| 3 — Read isolation | Planning | D2, D3, D4 | App order: gamedays → league_table → passcheck → officials → journey → designer |
| 4 — Write authorization | Planning | D5, D7 | Kernel replaces `is_staff` writes |
| 5 — API surface | Planning | D4 | Nested routes, `/api/me`; grain settled by D1 |
| 6 — Frontend & offline | Planning | D3, D5 | Cache keys, permissions payload, outbox |
| 7 — Deprecate `is_staff` | Planning | D7 | Security audit + load test gate |

**Current state**: `Planning` — no implementation branch, no code. Phase 0 gate 0a is satisfied;
gate 0b is open. The only artefacts are this document and its tracking issue.
**Next action**: start Phase 1 on the thesis-settled grain (D1) and context (D6) now; run the
decision workshop with an owner per decision (D2–D5, D7, D8, D9-DB) and close gate 0b before
Phase 3.

---

## 10. What gets ported from the old branch, and what is dropped

### Ported (rewritten, not cherry-picked)

| Idea | From | How it lands |
|---|---|---|
| Scoped assignment tables | `accesscontrol.LeagueAdminAssignment`, `TeamAdminAssignment` | Collapsed into one `UserRole` with an explicit `role` field and constraints (R2/R3) — the old separate tables per scope lose the role dimension |
| `Person.user` / `Official.user` identity links | `gamedays/migrations/0024_person_user.py`, `officials/migrations/0014_official_user.py` | Re-derived against current models, with backfill and uniqueness (R7, Phase 2) |
| "Type emails → assignments" form UX | `accesscontrol/forms.py` | Reused as the *bulk role assignment* screen for `LEAGUE_ADMIN` (Phase 4) |
| "My leagues / my teams" page concept | `accesscontrol/menu.py`, views | Becomes the league switcher + `GET /api/me/leagues/` (R27, R62) |
| The nine role-check predicate families (eleven call sites) | listed below | Conversion checklist for Phase 4 |

**Role-check conversion checklist** (predicate families; line numbers move, names do not):

1. `gamedays/permissions.py` — `IsAuthenticatedOrOwnerOrStaff`
2. `gamedays/permissions.py` — `IsAuthenticatedOrGamedayOwnerOrStaff`
3. `gamedays/views.py` — `StaffOnlyMixin` (7 subclasses)
4. `gameday_designer/permissions.py` — `IsStaffOrReadOnly`, `IsOwnerOrStaff`
5. `gamedays/api/game_views.py` — log-edit ownership + device-lock release
6. `matchreport/views.py` — `test_func` / detail-view staff gate
7. `journey/views.py` — `_is_authorized_user`
8. `officials/views.py` — `is_user_allowed_to_see_official_names` (username hacks)
9. `league_manager/utils/view_utils.py` — `has_staff_or_user_permission`,
   `get_user_request_permission` (username == team.name)
10. `passcheck/views.py` + `passcheck/forms.py` + `passcheck/menu.py` — staff gates
11. `teammanager/views.py` — `check_teammanager` (note the missing `()` at line 59)

### Dropped deliberately

| Dropped | Why |
|---|---|
| The `accesscontrol` app as a whole | Group-name roles, no tenant key, unauthenticated deletes, create views open to any logged-in user |
| Moving `Association` out of `gamedays` | It is live (74 references on master); the new app imports it instead (B6) |
| `League.association` FK as a tenant path | No product need; Association stays a grouping attribute (D1) |
| `Team.league` | Factually wrong for seasonal movement (B3, D2) |
| Association-scoped admin roles (the old branch's association assignment table) | The thesis defines five actor roles (§4.1); `Association` is a grouping attribute, not a tenant or role scope (D1, R3) |
| Django group names as roles | Global strings with no tenant dimension (R2, R33) |
| Unauthenticated delete views and open create views | Security defects, not features |
| `django.contrib.auth` per-model permissions as the authorization mechanism | Cannot express tenant scope (R33; the response document's `@permission_required` example is unsound here) |
| The old migration chain | 9 filename collisions; rebuilt from the current schema |
| Big-bang `is_staff` removal | Replaced by the five-stage ladder (§6.1) |

---

## 11. Traceability and glossary

| Requirement area | Requirements | Phases |
|---|---|---|
| Data model | R1–R12 | 1, 2, 3 |
| Context & middleware | R13–R24 | 1, 3 |
| Routing & API | R25–R31 | 5 |
| Roles & permissions | R32–R40 | 2, 4 |
| Migration | R41–R46 | 2–7 |
| Security & audit | R47–R52 | 4, 5, 7 |
| Testing & load | R53–R58 | every phase |
| Frontend | R59–R64 | 6 |
| Thesis alignment (13 tenants, five roles, no library, sport-agnostic) | R1, R32, R56 (facts B20–B22; decision D1, library half of D9) | 0 |

**Glossary**

- **Tenant** — a `League`; the isolation boundary (13 leagues as of 2026, thesis §4.1).
- **Actor role** — the thesis's term for its five role groups: Spieler, Teammanager,
  Schiedsrichter, Liga-Admin and System-Admin.
- **Membership** — a `UserRole` row binding a user to a tenant with a role.
- **Object scope** — ownership/relationship inside a tenant (author, team, assignment).
- **Global route** — a route on the manifest that explicitly reads across tenants.
- **`unscoped()`** — the audited escape hatch from tenant filtering.
- **Shadow-read** — computing the new authority alongside the old without changing the
  outcome, to measure disagreement.
- **Bypass** — any write path that does not pass through a tenant-scoped view (projector,
  command, signal, offline replay).
