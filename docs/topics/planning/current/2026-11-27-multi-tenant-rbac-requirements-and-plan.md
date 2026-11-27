# Fresh multi-tenant RBAC — requirements and implementation plan

| | |
|---|---|
| **Status** | Planning — **blocked on the decisions in [§4](#4-open-decisions-requiring-a-human-call)** |
| **Date** | 2026-11-27 |
| **Origin** | [2026-02-25 Multi-Tenant RBAC Implementation Proposal](../history/2026-02-25-multi-tenant-rbac-thesis-implementation-proposal.md) — the response to Niklas Just's bachelor thesis *"Entwurf und Implementierung eines multimandantenfähigen Rechtemanagementsystems"* |
| **Decision** | start fresh; do **not** resurrect `feat/multi-tenancy` (`da87406d`, 2026-03-18) |
| **Supersedes** | nothing. The thesis response stays as the historical requirement source; this document turns it into buildable, testable requirements. |
| **Related** | [Snapshot as the only public API](./2026-10-04-snapshot-only-public-api.md), [Architecture Remediation Roadmap](./2026-11-25-architecture-remediation-roadmap.md), [Phase 0 plan](./2026-11-25-phase0-plan.md) |

---

## 1. Executive summary and decision

### 1.1 Decision

**Start a fresh implementation.** The old branch is not a foundation to build on; it is a
useful source of *ideas* and a checklist of *mistakes*.

One-line reason: the old branch predates 4,118 commits of master, implements **role
assignment, not tenancy** (`"tenant"` appears zero times in its diff), carries **no tests, no
docs and no API changes**, and 12 of the 15 files it touches no longer merge cleanly — so
rebasing it would cost more than re-deriving it from the thesis requirements against today's
models.

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

1. **A tenant is a league.** Every isolatable row has a tenant key or a deterministic path to
   one, and every request runs under exactly one resolved tenant (or an explicit, audited
   global scope).
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
  schemas are out of scope (see [D9](#d9-database-platform--row-level-security)).
- **No rewrite of the domain model.** No `Team.league`, no league-owned seasons, no changes to
  season rollover semantics.
- **No auth-provider change.** Knox tokens, session auth and Moodle official sessions stay.
- **No new public API.** No per-tenant public endpoints; the snapshot remains the only
  public API.
- **No frontend redesign.** Permission-aware UI only; no new visual language.
- **No "organisation" tenancy above federations.** Association grouping is modelled where it
  already exists, not invented as a third level.

### 1.5 What "tenant" means in this document

A **tenant** is a `gamedays.League` row (e.g. "DFFL", "DFFL2", "DFFL-F"). It is the unit of
data isolation, role scope, URL prefix, cache partition and audit attribution. A
**membership** is a `UserRole` row binding a user to a tenant with a role. An **object scope**
is the narrower ownership inside a tenant (a team, a gameday's author, an official's own
signup).

---

## 2. Verified baseline

Every number below was measured on this branch's base commit. It is the ground truth the
requirements are written against.

| # | Fact | Where | Why it matters |
|---|---|---|---|
| B1 | `is_staff` appears **119 times in 29 non-test Python files** (plus 11 template sites and a frontend `useIsStaff` hook) | `rg is_staff` | The role migration is the largest mechanical part of the work |
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
| B16 | 22 management commands, including projectors (`rebuild_game_projection`, `check_game_projection`) and seeders | `*/management/commands/` | Every command is a tenant-context bypass candidate |
| B17 | `gameevents` writes `gamedays` projection tables through a projector boundary (`project_submission`, `project_game`) | `gameevents/service/append.py:212`, `projector.py:675` | Writes can bypass views entirely; the projector must stamp or derive the tenant |
| B18 | `scorecard_v2` is an offline PWA with an IndexedDB outbox and a device lock on `GameSetup.device_id` | `gamedays/api/game_views.py`, `gamedays/service/device_lock.py` | Offline caches and device locks are cross-tenant state that must be namespaced |
| B19 | Repo gates: TDD, mandatory query-count assertions, `black .`, `npm run eslint`, scope coverage, app-boundary check, DCO-signed conventional commits | [AGENTS.md](../../../../AGENTS.md) | Every phase's exit criteria must include these |

---

## 3. Source requirements extracted from the thesis response

Requirements are numbered **R1…R64** and grouped by area. Each is written to be testable:
the "Verified by" column names the artefact that proves it (a test, a check, or an audit).
Where the thesis response is technically wrong or underspecified, the requirement says so and
corrects it — those corrections are the most valuable part of this document.

### 3.1 Data model

| ID | Requirement | Verified by |
|---|---|---|
| **R1** | The tenant entity SHALL be the existing `gamedays.League` row. No parallel tenant table SHALL be introduced; `League.slug` is the tenant key used in URLs, cache keys and audit records. | Migration review; no second tenant table in `sqlmigrate` output |
| **R2** | `UserRole` SHALL be a single table: `user` FK, `role` (choices), `association` FK nullable, `league` FK nullable, `team` FK nullable, `created_at`, `created_by`, plus a **`scope_key`** CharField (`sys`, `assoc:<id>`, `league:<id>`, `team:<id>`) derived in `save()` and covered by `UniqueConstraint(user, role, scope_key)`. The derived key is required because **MariaDB has no partial unique indexes and permits duplicate NULLs in a unique index**, so a constraint over the nullable FK columns would not prevent duplicate `SYSTEM_ADMIN` rows. `UserRole` SHALL NOT encode the role in a Django `Group` name. | Model review; DB constraint test inserting duplicate `SYSTEM_ADMIN` and duplicate `LEAGUE_ADMIN` rows |
| **R3** | Role scope SHALL be expressed by which nullable columns are set, enforced by `CheckConstraint`s: `SYSTEM_ADMIN` → association, league and team all NULL; `ASSOCIATION_ADMIN` → association set, league/team NULL; `LEAGUE_ADMIN` → league set, association/team NULL; `TEAM_MANAGER` → team set (league derived via `SeasonLeagueTeam`); `REFEREE`/`PLAYER` → identity is global, all three scopes NULL. `scope_key` SHALL agree with the populated columns. | Constraint tests for every invalid combination, including `scope_key` mismatch |
| **R4** | Every tenant-owned root table SHALL carry exactly one tenant key or a deterministic, indexed path to one. The audit table in [§3.1.1](#311-tenant-key-matrix) is the definition of "tenant-owned" and SHALL be updated whenever a model is added. | `scripts/check_tenancy_coverage.py` (new) failing on an unlisted model |
| **R5** | `Team` SHALL NOT gain a `league` FK. Team read scope SHALL be derived from `SeasonLeagueTeam` membership for the resolved tenant (and the requested season, where supplied). | Isolation test: a team that only ever played in league B is invisible under tenant A; scope test proves the join |
| **R6** | Team *administration* (create/rename/logo) MAY use a denormalised `Team.home_league` FK if the team-admin UX needs a stable owner; if added, it SHALL be documented as an ownership hint, never used for read isolation. | Decision [D2](#d2-how-team-is-scoped--no-league-fk-seasonal-league-movement); test that hiding a team does not depend on `home_league` |
| **R7** | `Person.user` and `Official.user` SHALL be nullable FKs with `on_delete=SET_NULL`, a uniqueness rule (one user per person/official), and a documented backfill. | Migration + backfill test on seeded demo data |
| **R8** | `Gameday.author`, `TeamLog.author`, `GameEvent.author` and `ScheduleTemplate.created_by` SHALL be understood as **object ownership**, not authority; the permission layer SHALL treat ownership as one input alongside role. | Permission matrix tests |
| **R9** | The legacy `gamedays.Permissions`, `gamedays.UserPermissions` and `UserProfile.check_teammanager()` SHALL be retired in favour of `UserRole`. `UserProfile` SHALL remain only as a player profile (avatar, name, jersey). | Migration removing the two tables; `rg check_teammanager` returns only a compatibility shim |
| **R10** | Cross-tenant relations SHALL be explicit bridge tables with their own audit columns: existing `EligibilityRule.eligible_in`, `TeamRelationship.additional_teams`, `LeagueSeasonConfig.leagues_for_league_points` are the pattern. A bridge row SHALL require a `granted_by`/`created_at` pair. | Schema review; test that a bridge does not widen default read scope |
| **R11** | Every tenant key SHALL have an index whose leading column matches the dominant query shape: `(league, date)`, `(league, season)`, `(league, status)`, `(team, ...)`. Blanket single-column indexes on `league_id` are insufficient. | `EXPLAIN` review + query-plan test on the top 10 list views |
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
| `officials.Official`, `OfficialLicenseHistory` | via `team` → no; via `Official.association` and assignment rows | Referees work across leagues; scope by assignment, not ownership |
| `officials.OfficialGamedaySignup` | via `gameday` (exists) | |
| `officials.CrewPosition` | global | |
| `passcheck.Playerlist`, `Player` | via `team` → derived | League scope via team membership in season |
| `passcheck.PasscheckVerification`, `PlayerlistGameday` | via `gameday` (exists) | |
| `passcheck.PlayerlistTransfer` | via `current_team`/`new_team` → derived | A transfer can cross tenants; requires explicit approval authority in **both** |
| `passcheck.EligibilityRule` | `league` (exists) + bridge | Cross-league by design |
| `journey.Journey`, `JourneyEvent` | user-scoped, not league-scoped | Staff dashboards aggregate; see [D4](#d4-cross-league-and-global-reads) |
| `gameday_designer.ScheduleTemplate` | `league` (new, nullable = association/global) | Existing `sharing` field already encodes private/association/global |
| `scorecard`, `scorecard_v2`, `liveticker`, `teammanager`, `accounts`, `home`, `share`, `matchreport`, `dbaccess` | no owned models (or pure config) | Thin/consumer apps; behaviour covered by API and permission requirements |

### 3.2 Tenant context and middleware

The thesis proposes three middleware layers. **Layers 1 and 2 are implementable as
middleware; layer 3 is not** — Django middleware cannot intercept querysets, so
"TenantFilteringMiddleware" is restated as the data-layer guarantee R19–R23. This is a
deliberate deviation and the single most important architectural correction in this document.

| ID | Requirement | Verified by |
|---|---|---|
| **R13** | `TenantResolutionMiddleware` SHALL resolve the tenant before the view runs, from a fixed precedence: (1) URL kwarg `league_slug`; (2) explicit `X-LeagueSphere-League` header on token-authenticated requests; (3) session key `active_league` set by the league switcher; (4) Knox token claim; (5) subdomain. It SHALL NOT resolve from POST/PUT bodies or from an arbitrary query parameter. | Unit tests for each source and for precedence |
| **R14** | Conflicting sources (e.g. URL says `dffl`, token claim says `dffl2`) SHALL be a **403** with audit event `tenant_source_conflict`, never a silent preference. | Test with forged header + mismatched token |
| **R15** | An **unknown** tenant slug SHALL be a **404**, a known tenant without membership SHALL be a **403**. `SYSTEM_ADMIN` bypasses membership only. | Test matrix over {unknown, known-no-role, known-role, system-admin} |
| **R16** | Global routes SHALL be exempt through a **code-level route manifest**, not a `/api/` prefix rule: `/api/snapshot/`, sitemaps, `/health/*`, `/login/`, `/logout/`, static/agent files, `/share/widget/`, `/liveticker/` public read routes. Adding a route to the manifest requires a comment naming its public contract. | Test that an unlisted `/api/` route under no tenant is rejected loudly |
| **R17** | `TenantContextMiddleware` SHALL store the resolved tenant in a `contextvars.ContextVar` (never `threading.local`), expose `current_tenant()`, `require_tenant()` and `tenant_scope()`, and reset the var with the saved `Token` in a `finally` block. Nested scopes SHALL restore the **previous** value, not `None`. | Unit tests for set/reset, nesting, exception paths |
| **R18** | Context SHALL survive Django's sync/async boundary: `sync_to_async`/`async_to_sync` copy the context (asgiref), so `contextvars` is the only correct choice. Streaming responses (SSE liveticker) SHALL re-establish the tenant inside the generator, because middleware `finally` runs before the iterator is consumed. | Streaming test asserting the generator sees the tenant |
| **R19** | Tenant-aware managers/querysets SHALL be **opt-in per model** (`TenantScopedManager`), not global monkey-patching. When the context is unset, a tenant-aware query SHALL raise `TenantContextMissing` — a loud programming error, not an empty result. | Test asserting the exception (not `[]`, not `DoesNotExist`) |
| **R20** | `unscoped()` SHALL be the only escape: `Model.objects.unscoped()` (optionally with `reason="..."`), audited at `DEBUG`-and-above in one place. It SHALL be greppable and rare; a new `unscoped()` call site requires a code-review note. | `rg "unscoped\("` inventory reviewed per phase; test that `unscoped()` logs |
| **R21** | `TenantEnforcementMiddleware` (the corrected layer 3) SHALL, per request, record every model+manager access that bypassed tenant scoping and assert the set is a subset of the route's declared allowlist; a violation SHALL log an `isolation_bypass` event with request id, user and route. | Test: a read-only route that touches `Team.objects.unscoped()` raises/logs |
| **R22** | Management commands and projectors SHALL have no implicit tenant. They SHALL accept `--league <slug>` (or iterate explicitly) and use `unscoped()` where they are intentionally global, logging the reason. | Command tests without `--league` fail loudly |
| **R23** | Raw SQL (`cursor()`, `.raw()`, `RawSQL`) SHALL remain forbidden except in migrations and health probes; the four existing sites (B15) SHALL be reviewed and annotated. | `rg` audit in CI (new check) |
| **R24** | A request that resolves no tenant and is not on the global manifest SHALL fail with **400 `tenant_required`** for API routes and a redirect to tenant selection for HTML routes — never a fallback to "all data". | Test matrix; no code path returns unfiltered rows |

**Failure-mode table (required reading for reviewers)**

| Failure | Required behaviour | Forbidden behaviour |
|---|---|---|
| Unknown slug | 404 + audit `tenant_not_found` | 403 (leaks tenant existence) or empty page |
| Known slug, no membership | 403 + audit `tenant_forbidden` | 200 with empty list |
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

| ID | Requirement | Verified by |
|---|---|---|
| **R32** | Roles SHALL be: `SYSTEM_ADMIN`, `ASSOCIATION_ADMIN`, `LEAGUE_ADMIN`, `TEAM_MANAGER`, `REFEREE`, `PLAYER`. `PUBLIC` is the absence of a role, not a row. | `UserRole.Role` review |
| **R33** | Django's per-model permissions (`gamedays.change_gameday`) SHALL **not** be used for tenant authorization. They are global and cannot express "admin of league A"; they MAY be mirrored for the Django admin only. | `rg permission_required` returns only admin/project uses; authorization tests use `UserRole` |
| **R34** | Authorization SHALL be a two-step check: **tenant membership with role** (row scope) and then **object ownership/relationship** (object scope). A role check that ignores the object SHALL fail review. | Permission matrix tests per role × resource × action |
| **R35** | Effective permissions SHALL be computed by one kernel (`access.policy.can(user, action, tenant, obj=None)`), so API, HTML views, admin and frontend guards cannot drift. | One test suite; `rg "is_staff"` count only in the kernel and deprecated paths |
| **R36** | `TEAM_MANAGER` SHALL be scoped to a team and derive its league from `SeasonLeagueTeam` for the active season. It SHALL NOT grant rights in another league that the same team plays in during a different season. | Test with a team that changed leagues |
| **R37** | `REFEREE` SHALL be scoped by assignment (`OfficialGamedaySignup`, `GameOfficial`), not by a league-wide role. | Test: referee sees assigned gamedays, not the league's drafts |
| **R38** | Field-level protection SHALL be preserved and made role-driven: official name obfuscation currently keyed on `is_staff` SHALL key on `REFEREE`/`LEAGUE_ADMIN` scope. | Serializer tests for obfuscation per role |
| **R39** | Device-lock release (`DELETE /api/game/<pk>/device`) SHALL require `LEAGUE_ADMIN` in that game's tenant or `SYSTEM_ADMIN`, not `is_staff`. | API test with staff-of-another-league |
| **R40** | Role changes SHALL be audited (actor, subject, role, tenant, before/after) and SHALL take effect on the next request without re-login. | Audit row assertion; cache-invalidation test |

**Role → permission matrix (initial; the contract to be signed off in [D1](#d1-tenant-grain--league-association-or-two-level))**

`✓` allowed, `o` allowed for own object only, `–` denied.

| Resource / action | PUBLIC | PLAYER | TEAM_MANAGER | REFEREE | LEAGUE_ADMIN | ASSOC_ADMIN | SYSTEM_ADMIN |
|---|---|---|---|---|---|---|---|
| Snapshot / liveticker / sitemap reads | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| League schedule, published gamedays | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| Draft gamedays | – | – | – | – | ✓ | ✓ | ✓ |
| Create / edit / publish gameday | – | – | – | – | ✓ | ✓ | ✓ |
| Enter / correct results | – | – | – | – | ✓ | ✓ | ✓ |
| Read own roster | – | o | o | – | ✓ | ✓ | ✓ |
| Edit roster, jersey numbers | – | – | o | – | ✓ | ✓ | ✓ |
| Approve player transfer | – | – | o (both teams) | – | ✓ | ✓ | ✓ |
| Read passcheck verification | – | – | o | ✓ | ✓ | ✓ | ✓ |
| Submit passcheck verification | – | – | – | ✓ | ✓ | ✓ | ✓ |
| Sign up as official, read own assignments | – | – | – | o | ✓ | ✓ | ✓ |
| Assign officials to gamedays | – | – | – | – | ✓ | ✓ | ✓ |
| Read official names unmasked | – | – | – | o | ✓ | ✓ | ✓ |
| League config, ruleset, eligibility rules | – | – | – | – | ✓ | ✓ | ✓ |
| Create league / assign league admins | – | – | – | – | – | ✓ | ✓ |
| Platform config, seeds, `dbaccess` | – | – | – | – | – | – | ✓ |
| Cross-league standings / aggregate | ✓ (published) | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |

### 3.5 Phased migration

| ID | Requirement | Verified by |
|---|---|---|
| **R41** | Migration SHALL follow **write → shadow-read → enforce-read → enforce-write → deprecate** for `is_staff`; each stage SHALL be independently deployable and reversible. | Stage table in [§6.1](#61-is_staff-write--view--deprecate); one PR per stage |
| **R42** | Write stage: every place that sets `is_staff` SHALL also create the corresponding `UserRole` (management command + signal + seeders). Reading code is unchanged. | Dual-write test: after seeding, authority and `is_staff` agree for every user |
| **R43** | Shadow-read stage: the new kernel SHALL be evaluated on every authorization decision, the result compared with `is_staff`, and **disagreements logged** without changing the outcome. Exit criterion: zero disagreements for one full gameday weekend in production. | Log dashboard/report; a disagreement count of 0 |
| **R44** | Enforce-read stage: tenant filtering SHALL be switched on per app (feature flag), starting with read-only list endpoints; exit criterion per app: isolation suite green, query counts flat. | Per-app flag matrix; query-count assertions |
| **R45** | Enforce-write stage: the permission kernel SHALL replace `is_staff` checks app by app; old checks remain behind a flag for one release, then are deleted. | `rg is_staff` count monotonically decreasing; per-app tests |
| **R46** | Deprecate stage: legacy `Permissions`/`UserPermissions` tables, `check_teammanager`, and the `is_staff`-based helpers SHALL be removed; `is_staff` MAY remain only as Django-admin gate (documented) or be removed entirely (see [D7](#d7-role-migration-from-119-is_staff-sites)). | Migration dropping tables; `rg` inventory in §10 |

### 3.6 Security and audit

| ID | Requirement | Verified by |
|---|---|---|
| **R47** | Audit SHALL cover **writes and denials**, not reads: role changes, tenant membership changes, cross-tenant bridge changes, 403s, god-mode use, `unscoped()` on a non-global route. Reads are covered by access logs, not a DB table. | Audit model review; events emitted in tests |
| **R48** | `SYSTEM_ADMIN` ("god mode") SHALL be explicit: a per-request opt-in (header or UI toggle) that is audited, time-bounded to the request, and visible in the UI. It SHALL NOT be the silent default for superusers. | Test: superuser without opt-in gets normal tenant scoping; with opt-in gets audit row |
| **R49** | Cross-tenant data SHALL NOT be enumerable: object lookups outside the tenant return **404**, list endpoints return empty, and error bodies SHALL NOT reveal existence. | Isolation matrix (§7.1) |
| **R50** | Tenant-scoped rate limits SHALL exist for expensive aggregations (standings rebuild, snapshot rebuild) so one tenant cannot exhaust another's capacity. | Throttle tests with two tenants |
| **R51** | A per-tenant export/delete path SHALL exist before tenancy ships, so a league leaving the platform can be extracted without hand-written SQL. | Command test producing a manifest + row counts |
| **R52** | Secrets and credentials SHALL NOT be tenant-keyed (DB credentials, Knox keys stay global); `dbaccess` grants SHALL be attributed to a tenant where the request concerns one tenant's data. | Config review; `dbaccess` audit test |

### 3.7 Testing and load

| ID | Requirement | Verified by |
|---|---|---|
| **R53** | Every tenant-aware model SHALL have isolation tests: cross-tenant read → 404/empty, cross-tenant write → 403, unset tenant → loud failure, public endpoint → allowed. | Generated matrix test, one row per model |
| **R54** | Every modified endpoint SHALL keep its query count constant in result-set size and add **at most one** query for tenant resolution (cached). | `assertNumQueries` in every touched test |
| **R55** | A bypass audit SHALL cover raw SQL, management commands, projectors, admin actions, signals and offline replay, each with a named test or an allowlist entry. | Audit checklist in [§7.3](#73-bypass-audit) signed off per phase |
| **R56** | A load test SHALL simulate ≥3 tenants with skewed traffic and assert p95 latency and error rate do not regress versus the current baseline. | k6 scenario + Grafana comparison |
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

## 4. Open decisions requiring a human call

Each decision below is **Awaiting decision**. The recommendation is the default the plan is
written against; changing it changes the named requirements.

### D1. Tenant grain — League, Association, or two-level?

- **Question**: Is the isolation unit a `League` (DFFL, DFFL2, DFFL-F), an `Association`
  (e.g. a regional federation), or both (Association owns Leagues)?
- **Recommended default**: **League**, with `Association` kept as a grouping/reporting layer.
- **Rationale**: `Gameday` already carries `league`; the thesis's own examples ("DFFL",
  "DFFL2", "DFFL-F") are leagues; roles like "league admin" are named after it; the snapshot
  and league-table URLs are already league-keyed. Making Association the tenant would force a
  second key on every gameday for no current product need.
- **Alternatives**: (a) Association as tenant — simpler federation reporting, but every
  league would become a sub-scope and cross-association sharing gets harder; (b) two-level
  → `Tenant` table with `parent` — most flexible, largest migration, and `Association` would
  need a `parent` FK it does not have today.
- **Impact if deferred**: R1, R2, R25, R32 and the whole URL shape are blocked. This must be
  decided first.
- **Status**: **Awaiting decision.**

### D2. How `Team` is scoped — no league FK, seasonal league movement

- **Question**: `Team` has no league FK and a team can play in different leagues in different
  seasons. What is a team's tenant?
- **Recommended default**: **Derived membership.** Team read scope = teams that appear in
  `SeasonLeagueTeam` for the resolved tenant (and requested season). Add **no** `Team.league`.
  For team administration, derive the admin's scope from `UserRole(team=...)`, not from a
  league column.
- **Rationale**: A `Team.league` column would be wrong for any team that ever moves; the
  existing season-rollover and eligibility features depend on per-season membership. This is
  also exactly why the old branch's assumption fails.
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
  tenant-scope public reads: a fan following a league should not need a tenant cookie.
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

- **Question**: The thesis asks whether `threading.local` or `contextvars` is required.
- **Recommended default**: **`contextvars`, unconditionally** (R17). The project is sync WSGI
  today, but the liveticker already runs an SSE worker process, `health_check` documents a
  past async deadlock, and Django 6 is async-first in its own internals. `contextvars` is
  correct in both worlds; `threading.local` is correct in neither under async and leaks across
  reused threads.
- **Rationale**: It costs nothing to be correct here, and switching later means re-auditing
  every context read.
- **Alternatives**: `threading.local` — only if the project freezes on sync WSGI forever, and
  even then it is the weaker choice.
- **Impact if deferred**: Blocks R17, R18 and streaming-stream behaviour; low risk because the
  default is cheap.
- **Status**: **Awaiting decision** (expected to be confirmed, not debated).

### D7. Role migration from 119 `is_staff` sites

- **Question**: How do 119 `is_staff` occurrences across 29 Python files (plus 11 template
  sites and a frontend hook) become roles without a big-bang change?
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
- **Recommended default**: **Yes — add the constraint as part of Phase 1**, after the
  `report_duplicate_season_league_teams` command reports zero duplicates in stage and prod.
- **Rationale**: Duplicate membership rows make "a team's league for a season" ambiguous,
  which makes `TEAM_MANAGER` scope ambiguous (R36). This is a prerequisite, not an
  optimisation.
- **Alternatives**: tolerate duplicates and pick `MIN(pk)` — hides a data bug inside an
  authorization decision.
- **Impact if deferred**: Blocks R4 (index/constraint review) and R36.
- **Status**: **Awaiting decision.**

### D9. Database platform — row-level security

- **Question**: The thesis asks whether PostgreSQL with row-level security should replace
  MySQL.
- **Recommended default**: **Stay on MariaDB/MySQL; do not rely on RLS.** Enforce in the
  application layer (managers + policy kernel), with the DB as defence in depth via
  constraints and indexes, not as the isolation mechanism.
- **Rationale**: The production stack, backups, LXC test DB, `dbaccess` tooling and every
  migration are MariaDB. A platform migration is a separate, larger project; RLS would also
  hide isolation failures from tests unless every test runs as a non-owner role.
- **Alternatives**: Postgres + RLS — genuinely stronger against ORM bypass, but changes
  `dbaccess`, the snapshot cache and the deployment story.
- **Impact if deferred**: None for the plan's shape; resolves the thesis's open question 5.
- **Status**: **Awaiting decision.**

---

## 5. Proposed target architecture

### 5.1 App layout and import direction

```
league_manager/                  project: settings, root URLs, middleware wiring
├── middleware/tenancy.py        resolution + context + enforcement (imports access.context)
└── settings/base.py             INSTALLED_APPS order, DRF defaults

access/                          NEW app: tenancy + RBAC
├── context.py                   contextvars only — imports NO Django models
├── models.py                    UserRole, RoleAudit, TenantAudit; FKs to gamedays.League/Team/Association
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
- `TenantEnforcementMiddleware` is the corrected thesis "layer 3": it observes, it cannot
  filter. That is a feature — a filter that silently fails is worse than an assertion that
  screams.

### 5.5 URL and API shape

```
/api/leagues/<slug>/gamedays/                 list/create (LEAGUE_ADMIN)
/api/leagues/<slug>/gamedays/<id>/            detail/update
/api/leagues/<slug>/gamedays/<id>/publish/    action
/api/leagues/<slug>/teams/                    teams in tenant (derived, R5)
/api/leagues/<slug>/standings/                published standings (public read)
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
def can(user, action, tenant, obj=None) -> bool:
    if not user.is_authenticated:
        return action.public and obj is None
    roles = UserRole.objects.for_tenant(tenant).roles_of(user)   # cached per request
    if Role.SYSTEM_ADMIN in roles:
        return True
    ...
```

- `action` is a small enum/constant (`"gameday.publish"`, `"roster.edit"`), not a Django
  permission string (R33). The matrix in [§3.4](#34-roles-and-the-permission-matrix) is the
  table it implements.
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

Seven phases. Each is independently shippable and testable; each has an exit gate that must be
green before the next starts. Phase numbering is separate from the thesis's six phases (which
underestimated testing and frontend and assumed the old data model).

### Phase 0 — Decisions and invariants (no product code)

**Entry**: this document merged.
**Work**: resolve D1–D9; sign off the permission matrix; write the tenant-key matrix (R4) as
code (`scripts/check_tenancy_coverage.py`) with every model listed; add the boundary entry
for `access`.
**Exit**: every decision records a choice; the coverage script runs and fails on an unlisted
model; the matrix is reviewed by a second person.
**Blocked by**: D1, D2, D3, D4, D5, D7, D8.

### Phase 1 — Foundation: `access` app, context, managers, middleware

**Entry**: Phase 0 exit.
**Work**: `access/context.py`, `querysets.py`, `models.py` (`UserRole` + audit), middleware
1/2/3 with the route manifest, `/api/me/leagues/`, `TenantModelAdmin`, feature flags default
**off**. No model is converted yet.
**Exit**: unit tests for context (nesting, exception, streaming), resolution (precedence,
404/403/400), and enforcement logging; `black .`; boundary check green; zero behaviour change
in staging with flags off.

### Phase 2 — Identity and role backfill

**Entry**: Phase 1 exit.
**Work**: `Person.user`, `Official.user` with backfill; `seed_roles_from_is_staff` command;
dual-write for role changes (R42); fix `SeasonLeagueTeam` uniqueness (D8) after the duplicate
report is clean; retire `check_teammanager` in favour of `UserRole(team=...)` behind a shim.
**Exit**: on a prod clone, every `is_staff` user has an equivalent `UserRole`; identity
backfill covers demo data; `report_duplicate_season_league_teams` returns zero; tests for
every backfill rule.

### Phase 3 — Read isolation, app by app

**Entry**: Phase 2 exit.
**Work**: convert tenant-aware models in order `gamedays` → `league_table` → `passcheck` →
`officials` → `journey` → `gameday_designer`; route manifest entries for public reads;
shadow-read disagreement report (R43) running in production.
**Exit**: per app — isolation suite green (R53/R57), query counts flat or +1 (R54), zero
shadow-read disagreements over a gameday weekend, no unlisted `unscoped()` site.

### Phase 4 — Write authorization

**Entry**: Phase 3 exit for an app.
**Work**: replace `is_staff` write checks with `can(...)`; object-scope predicates; device
lock release (R39); transfer approval across two teams (R10); projector stamping (R58);
admin actions.
**Exit**: permission matrix tests per role; cross-tenant write returns 403; admin isolation
tests; bypass audit (R55) signed off.

### Phase 5 — API surface

**Entry**: Phase 4 exit for the endpoints being moved.
**Work**: nested `/api/leagues/<slug>/...` routes; deprecation headers on flat routes;
`/api/me/permissions/`; error envelope (R28); throttle per tenant (R50); export command
(R51).
**Exit**: contract tests for new routes; snapshot byte-identical; no public endpoint change;
deprecation plan published.

### Phase 6 — Frontend and offline

**Entry**: Phase 5 exit.
**Work**: tenant-aware routes/boot payload; permission-driven menus (R63); league switcher
(R62); cache keying (R61); `scorecard_v2` outbox namespacing and conflict rule (R64);
remove `useIsStaff` in favour of permissions.
**Exit**: frontend tests per role; eslint zero errors; offline replay test across a tenant
switch; no `is_staff` reads in frontend code.

### Phase 7 — Deprecate `is_staff` and legacy permissions

**Entry**: Phase 6 exit; `rg is_staff` remaining sites are only seeds/tests/Django-admin gate.
**Work**: delete legacy `Permissions`/`UserPermissions`, `check_teammanager`, the
`is_staff`-based helpers; decide `is_staff`'s fate (D7); remove flat API routes; security
audit; load test (R56); documentation + in-app help update.
**Exit**: final `rg` inventory in §10 matches reality; security audit signed; load test
within budget; docs updated.

### 6.1 `is_staff`: write → view → deprecate

| Stage | Code change | Reads authority from | Rollback | Gate to next stage |
|---|---|---|---|---|
| **Write** | `seed_roles_from_is_staff`, dual-write on role changes | `is_staff` (unchanged) | Delete `UserRole` rows | 100% of staff users have a role; 0 unknown users |
| **View** (shadow-read) | Kernel evaluated next to `is_staff`; disagreements logged | `is_staff` | Turn off logging | 0 disagreements over one gameday weekend |
| **Enforce-read** | Tenant managers on, per app flag | `UserRole` | Flag off per app | Isolation + query-count suites green |
| **Enforce-write** | `can()` replaces `is_staff` writes | `UserRole` | Flag off per app | Matrix tests + bypass audit |
| **Deprecate** | Delete legacy tables/helpers, then `is_staff` reads | `UserRole` | Restore from migration | `rg` inventory matches §10 |

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
| God mode off | superuser, no opt-in | Tenant-scoped | 404 for other tenant |
| God mode on | superuser + opt-in | Allowed | 200 + audit row |
| Unknown tenant | `/api/leagues/nope/` | 404 | audit `tenant_not_found` |
| No membership | known tenant, no role | 403 | audit `tenant_forbidden` |

### 7.2 Query counts

- Every touched endpoint keeps `assertNumQueries` and the count must not grow with result
  size (repo policy).
- Tenant resolution costs **at most one** query per request (session/token role cache) and is
  cached in the request object; tests assert the delta.
- The top ten list views get a scripted `EXPLAIN` review recorded in the phase exit, not a
  unit-test assertion: plan shapes vary across MariaDB versions, and a brittle assertion would
  be disabled the first time it flakes. The review must show the R11 composite index is
  chosen.

### 7.3 Bypass audit

A checklist, signed per phase, covering: raw SQL (4 sites, B15), management commands (22,
B16), projectors (B17), admin actions, signals, seeders,
offline replay (B18), admin actions (24 `admin.site.register` calls), and any `unscoped()`
call site. Each gets either a named test or an allowlist entry with a reason. **No entry
without a reason.**

### 7.4 Security audit

Before Phase 7 exits: re-run the isolation matrix against stage with realistic multi-league
data; attempt IDOR on every detail route; verify 404-vs-403 consistency (R49); verify audit
coverage for role changes and god mode; verify no secret is tenant-keyed (R52); verify the
snapshot and embed surfaces are unchanged.

### 7.5 Load test

k6 scenario with three tenants and skewed traffic (one heavy league, two light) on stage;
compare p95 and error rate against the current baseline; assert the tenant resolution and
policy kernel add no measurable overhead at 10 VUs (the repo's existing ramp). Per-tenant
throttles (R50) are exercised.

---

## 8. Risk register

| ID | Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|---|
| K1 | A forgotten filter leaks cross-tenant data in production | Medium | Critical | Loud `TenantContextMissing`, enforcement middleware, isolation suite, shadow-read |
| K2 | Scope creep into a full domain-model rewrite (`Team.league`) | High | High | Explicit non-goal; R5/R6; D2 decided before Phase 1 |
| K3 | `is_staff` migration over- or under-grants a volunteer mid-season | High | High | Write → shadow-read → enforce; disagreement report; per-app flags |
| K4 | Cross-league features (league points, eligibility, transfers) break | High | High | Bridge tables + explicit global routes (D4); feature tests before isolation flips |
| K5 | Public surfaces (snapshot, sitemap, embeds, liveticker) regress | Medium | High | Route manifest, byte-identical snapshot contract, embed tests |
| K6 | Projector/management-command writes bypass the tenant | Medium | High | Tenant derived from `gameinfo.gameday`, `--league`, bypass audit |
| K7 | `contextvars` leaks or is lost across streaming/async boundaries | Low | High | R17/R18 tests, token reset, streaming generator test |
| K8 | Query-count or latency regression on gameday weekend | Medium | High | Composite indexes, +1-query budget, EXPLAIN tests, load test |
| K9 | Offline scorecard queues replay into the wrong tenant | Medium | High | Tenant-namespaced outbox, device-lock conflict rule (R64) |
| K10 | Admin interface exposes other tenants to a scoped admin | Medium | High | `TenantModelAdmin`, admin isolation tests, god-mode banner |
| K11 | Duplicate `SeasonLeagueTeam` rows make scope ambiguous | Medium | Medium | D8: constraint after duplicate report is clean |
| K12 | The new app recreates the old circular dependency | Low | High | Import rules §5.1, boundary check includes `access` |
| K13 | Audit logging becomes a write bottleneck on gameday | Medium | Medium | Writes/denials only (R47), async/batched, no read audit |
| K14 | Plan stalls on decisions and never ships | High | Medium | Phase 0 exit requires recorded decisions; D6/D9 have cheap defaults |

---

## 9. Status tracker

| Phase | State | Blocking decisions | Notes |
|---|---|---|---|
| 0 — Decisions & invariants | **Awaiting decisions** | D1–D9 | This document is the input; no code |
| 1 — Foundation (`access`, context, middleware) | Planning | D1, D6 | Design in §5; flags off by default |
| 2 — Identity & role backfill | Planning | D7, D8 | `Person.user`, `Official.user`, `UserRole` seed |
| 3 — Read isolation | Planning | D2, D3, D4 | App order: gamedays → league_table → passcheck → officials → journey → designer |
| 4 — Write authorization | Planning | D5, D7 | Kernel replaces `is_staff` writes |
| 5 — API surface | Planning | D1, D4 | Nested routes, `/api/me` |
| 6 — Frontend & offline | Planning | D3, D5 | Cache keys, permissions payload, outbox |
| 7 — Deprecate `is_staff` | Planning | D7 | Security audit + load test gate |

**Current state**: `Planning` — no implementation branch, no code. The only artefact is this
document and its tracking issue.
**Next action**: resolve D1/D2/D6 (cheap, unblock Phase 1) and schedule the D3/D4/D5 workshop
with the league administrators.

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
| Django group names as roles | Global strings with no tenant dimension (R2, R33) |
| Unauthenticated delete views and open create views | Security defects, not features |
| `django.contrib.auth` per-model permissions as the authorization mechanism | Cannot express tenant scope (R33, thesis's `@permission_required` example is unsound here) |
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

**Glossary**

- **Tenant** — a `League`; the isolation boundary.
- **Membership** — a `UserRole` row binding a user to a tenant with a role.
- **Object scope** — ownership/relationship inside a tenant (author, team, assignment).
- **Global route** — a route on the manifest that explicitly reads across tenants.
- **`unscoped()`** — the audited escape hatch from tenant filtering.
- **Shadow-read** — computing the new authority alongside the old without changing the
  outcome, to measure disagreement.
- **Bypass** — any write path that does not pass through a tenant-scoped view (projector,
  command, signal, offline replay).
