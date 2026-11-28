# SOLID and Architecture Scan: Proposal (2026-11-28)

> **Status:** proposal, not agreed. No issue filed, no code changed.
> **Baseline:** `origin/master` at `15889175e` (after Phases 0–3 merged; release 6.x).
> **Builds on:** the [Architecture Remediation Roadmap](./2026-11-25-architecture-remediation-roadmap.md)
> and its issues #2536–#2541, and the RBAC epic #2594. Nothing here re-proposes a filed phase.

## 1. Executive summary

1. Phases 0–3 worked. `gamedays` has zero forbidden imports, and the backend already uses registries where it switches on type (schedule strategies, wizard steps, projector `_HANDLERS`).
2. The dependency graph is still **one 10-app cycle**, because `league_manager` is project config *and* a shared kernel that imports `gamedays` models (B1).
3. Two hidden cycles bypass the import graph: `gameevents` reaches into **private helpers of `gamedays.api.game_views`** through lazy imports and `getattr` (B2), and `matchreport` and `officials` import each other (B3).
4. Phase 3 shrank its named files, but a **second wave** of large modules now exists: 4 backend modules of 767–916 lines and 30 frontend files over 400 lines. One of them, `TrackingPanelsProps`, has **110 members**: the god component became a god props object (B4, F4, F5).
5. #2540's premise is partly wrong: `authToken` is **read 6× and written 0×**, so the designer's token path is dead. There are **10** HTTP client modules, not 5 (F1, F2).
6. API types are hand-written in each app (`Gameday` ×4), and the event vocabulary is copied as string literals (`"Touchdown"` appears in 8 backend modules and 14 frontend files). Nothing guards the contract (B8, F3).
7. Five cheap correctness fixes:
   - LSP breaks in `passcheck` validators and two `Form.save` overrides
   - an untested register endpoint open to any logged-in user
   - test data imported in scorecard v1 production code
8. Proposal: **five new issues** (§5): a quick-win batch, kernel and cycle untangling, the designer canvas moved home, a Phase 3b split wave, and a shared domain contract. Plus scope additions for #2540, #2541 and #2594 (§4).

## 2. Method and evidence

| What | Tool / command | Result |
|---|---|---|
| Inter-app import graph | stdlib `ast` walk over every non-test `.py` (module and function level), Tarjan SCC | 39 edges, 8 mutual pairs, **1 SCC of 10 apps** |
| Lazy imports | `ast` walk restricted to function bodies | 11 cross-app lazy imports in production code |
| Boundary guardrail | `python3 scripts/check_app_boundaries.py --root .` | OK: `gamedays` imports only `gameevents` (11 statements, allowed) |
| Size | `wc -l` over non-test files | Tables in B4 / F4 |
| Complexity | `uvx radon cc -n D` | 2× E, 12× D (B10) |
| Duplication | `uvx pylint --enable=duplicate-code --min-similarity-lines=10`, `md5sum`, `difflib` | B8, F9 |
| Type switches | `ast` if/elif chains on one subject (≥4), TS `switch` with ≥8 cases | Backend clean; frontend: 3 switches (F7) |
| LSP | `ast`: `save`/`delete` overrides without `super()`, `NotImplementedError` hierarchies | B7 |
| Query assertions | grep for DB-touching test files without `assertNumQueries` / `django_assert_*` | 175 / 210 files (B11) |
| Frontend | inventory, props member count, client/error/token grep, md5 groups | §3.2 (scan scripts are not committed) |

Line numbers are from `15889175e` and will drift. Severity reflects **blast radius × likelihood**, the same scale the roadmap uses. Effort: S ≤ 1 week, M 1–3 weeks, L > 3 weeks.

## 3. Findings

### 3.1 Backend

| ID | Area | Principle | Evidence | Sev | Effort |
|---|---|---|---|---|---|
| B1 | `league_manager` is config + kernel + domain consumer | DIP / layering | Kernel imports domain: `league_manager/utils/view_utils.py:1` (`gamedays.models.Team`), `league_manager/dal/views.py:5`, `league_manager/views.py:149`, `league_manager/sitemaps.py:21`. Root URLconf imports `journey.progress_view` and `liveticker.stream.views` (`league_manager/urls.py:86-87`). Seed commands import 4 apps (`management/commands/seed_demo_data.py:18-25`). Reverse direction: `gamedays/menu.py:2`, `gamedays/service/gameday_service.py:7,11`; `officials` 7×, `passcheck` 9× into `league_manager.utils`. Result: one SCC of 10 apps (`gamedays, gameevents, league_manager, league_table, officials, matchreport, passcheck, liveticker, gameday_designer, journey`). | **High** | M |
| B2 | Hidden `gameevents` → `gamedays.api` cycle | DIP / layering, encapsulation | `gameevents/api/serializers.py:104` lazy-imports private `_validate_gamelog_payload` from `gamedays.api.game_views`. `gameevents/api/views.py:133-153` uses `getattr(game_views, "_device_lock_response", None)` and `"_finished_game_response"`, so if those names change **the canonical endpoint silently loses its device lock and its finished-game guard** (returns `None` → "allow"). Service level is bidirectional too: `gameevents/service/feed.py:38` and `legacy.py:32` import `gamedays.service.gamelog`, which imports `gameevents.service.log_payload` (`gamedays/service/gamelog.py:8`). | **High** | S–M |
| B3 | `matchreport` ↔ `officials` cycle | DIP / ADP | `officials/service/officiated_games_service.py:26` imports `matchreport.service.model_wrapper`, and `officials/views.py:174` imports `matchreport.constants`. In the other direction `matchreport` imports `officials` 7× (`matchreport/service/model_wrapper.py:20-21,421`, `matchreport/views.py:24,136`, `gameday_list_csv_service.py:20,27`). | Medium | S |
| B4 | Second wave of god modules (not in Phase 3) | SRP | `officials/selfservice.py` 916 l: Moodle session identity, name-matching policy, permission rules (`can_edit_official` :128, `can_reclaim_official` :301) and 8 views. `gameday_designer/views.py` 898 l: `ScheduleTemplateViewSet` :64 is 445 l, and `_flatten_errors` is duplicated at :779 and :887. `gamedays/api/views.py` 842 l: `GamedayViewSet` :141-416, 31 ORM calls, inline permission check `_check_gameday_mutation_permission` :78, designer JSON sync :578. `home/service/home_service.py` 767 l imports internals of 4 apps (:40-53). | Medium | L |
| B5 | Designer canvas lives in core | SRP / cohesion | `GamedayDesignerState` is in `gamedays/models.py:166`. ~965 l of designer canvas logic sits in `gamedays/service/`: `canvas_progression_service.py` 233, `canvas_progression_validation_service.py` 293, `canvas_publish_service.py` 191, `auto_assign_officials_service.py` 248 (`_assign_from_designer_state` :129, CC 37 = E). `gamedays/api/views.py:578-611` edits canvas node JSON in place. The import guard passes, but the concept is inverted: core knows the designer's node schema. | Medium | M–L |
| B6 | Untyped hook registry | ISP / DIP | `gamedays/service/registry.py:21-57`: 29 string hook names. `league_table` alone exposes 13. `get(name)` returns an untyped callable with no `Protocol`/signature, so a changed signature fails only at call time. The startup check (`gamedays/checks.py:19`) proves a hook is registered, not that it matches. | Medium | S–M |
| B7 | Contract-breaking overrides | **LSP** | `passcheck/service/eligibility_validation.py:83` declares `is_valid(...) -> bool`. Three subclasses raise `ValidationError` instead (:96, :111, :132), while two return `False` (:143-147, :155-159), so one chain mixes two failure protocols and `check()` (:76-78) handles only one. In the same file, OCP and DIP smells: rules fire on substrings of the gameday name (`"relegation"` :108, `"final4"/"final8"/"final6"` :125-129), and the service imports field constants from `passcheck.api.serializers` (:144, :156). `gamedays/forms.py:241` `GamedayForm.save(self, user=None)` drops `commit`, so `form.save(commit=False)` **persists anyway** (`False` binds to `user`). `passcheck/forms.py:135` `PlayerlistTransferForm.save(commit=True)` ignores `commit` and runs a transfer side effect. Null objects disagree: `EmptySchedule.to_html` returns the string `"None"`, while `EmptyQualifyTable` returns `None` (`gamedays/service/gameday_service.py:86-99`). | Medium | S |
| B8 | Event vocabulary and log grouping duplicated | DRY / OCP | `"Touchdown"` appears as a literal in 8 backend modules (`gamedays/api/serializers.py`, `gamedays/service/{gamelog,model_wrapper,model_statistics_wrapper}.py`, `gameevents/service/{legacy,projector,rules}.py`, `liveticker/api/serializers.py`). The same grouping if-chain is copy-pasted in `gamedays/service/gamelog.py:319-330` and `gamedays/api/serializers.py:358-369`. pylint clones: `gamedays/api/serializers.py:182-202` ≈ `gamedays/serializers/game_results.py:94-112`; `league_manager/middleware/db_guard.py:21-53` ≈ `league_manager/views.py:11-39`. | Medium | M |
| B9 | Auth issuer untested, register endpoint open | Security / test seam | `accounts/api.py:9` `RegisterAPI` has no `permission_classes`, so the default `IsAuthenticatedOrReadOnly` (`settings/base.py:207-209`) lets **any logged-in user create accounts**. No password validators run (`accounts/serializers.py:18-25`) and no client calls it. `accounts/tests.py` is one comment line, yet this app issues the Knox tokens that every client uses. | Medium | S |
| B10 | Complexity hotspots | SRP | radon E: `gameevents/service/rules.py:120` `_validate` (32), `gamedays/service/auto_assign_officials_service.py:129` (37). D: `gamedays/api/snapshot.py:533` `build_snapshot_payload` (24), `gameevents/service/append.py:464` `append_submission` (29), `gameday_designer/service/swiss_tournament_service.py:588,664` (27, 28), `gamedays/management/schedule_update.py:73` (21) | Low | S–M |
| B11 | Enforcement covers 1 of 17 apps | Enforcement | `scripts/check_app_boundaries.py` guards `gamedays` only. There is no import-linter, no static type gate, no complexity or size gate. 175 of 210 DB-touching test files have no query assertion (83%). | Medium | S |
| B12 | Official identity read from a views module | DIP / RBAC input | `home/views.py:18` imports `MOODLE_LOGGED_IN_USER` from `officials.views`. The only link between a person and an `Official` row is a session key defined in a view module, and `home`, `officials/selfservice.py:81` and `officials/views.py:170` each read it. | Low | S |
| B13 | Staff checks scattered | Policy / RBAC input | `is_staff` 148× in 9 apps (#2594 counts 144), `is_superuser` 16×; ad-hoc permission helpers in views (`gamedays/api/views.py:78`, `officials/selfservice.py:128,301`) | covered by #2594 | — |

**What is already good (keep it):** `gamedays/service/schedule_strategies.py` (ordered strategy registry), `gamedays/wizard/registry.py`, `gameevents/service/projector.py:696` `_HANDLERS`, the Phase 1 hook registry with its startup system check, and `share/src/lib/api.ts`'s injected `Fetcher`. Backend if-chains on one subject never exceed 4 branches. No frontend app imports another app's sources.

### 3.2 Frontend

Inventory (src LOC non-test / test ratio): `scorecard_v2` 23.6k / 1.47, `gameday_designer` 22.7k / 1.49, `scorecard` (JS, Redux) 3.8k / **0.57**, `liveticker` (v1 JS+Redux, v2 TS) 2.3k / 1.19, `share` 2.3k / 0.87, `journey_dashboard` 2.1k / 1.45, `passcheck` 1.6k / 1.15.

| ID | Area | Principle | Evidence | Sev | Effort |
|---|---|---|---|---|---|
| F1 | `authToken` is never written | Bug / contract | `localStorage.getItem('authToken')` is called 6× (`gameday_designer/src/api/designerApi.ts:123`, `gamedayApi.ts:46`, `journey_dashboard/src/App.tsx:24`, `trackEvent.ts:12`, `utils/api.ts:6,76`), and **nothing writes it** (Python, templates, src). The only writer of a token is `scorecard/src/reducers/authReducer.js:32` (`'token'`). The designer's `Authorization: Token` path is dead, and journey's `trackEvent` always bails out. The e2e tests set `'token'` (`gameday_designer/tests/e2e/test_designer_scorecard_flow.py:41`). `passcheck/src/utils/api.ts:45` echoes the token into an `alert()` in non-prod builds. #2540's "`authToken` written 1×" is wrong. | **High** | S |
| F2 | 10 HTTP clients, 3 shapes named `ApiError` | DIP / DRY | Clients: `gameday_designer/src/api/{designerApi,gamedayApi}.ts`, `journey_dashboard/src/{utils/api.ts,api/progressApi.ts}`, `liveticker/src/{actions/utils/api.js,v2/api.ts}`, `passcheck/src/utils/api.ts`, `scorecard/src/actions/utils/api.js`, `scorecard_v2/src/api/client.ts`, `share/src/lib/api.ts`. Plus 6 ad-hoc `fetch` (4× `trackEvent.ts`, `useTourSeen.ts:25`, `scorecard_v2/.../logout.ts:138`). `axios.defaults.xsrf*` is mutated at module load in 3 apps (`gamedayApi.ts:21-23`), so `designerApi` gets CSRF only if `gamedayApi` was imported first. Error models: interface (`gameday_designer/src/types/api.ts:131`), type (`passcheck/src/utils/api.ts:8`), class (`scorecard_v2/src/api/client.ts:39`), `HttpError` (`share/src/lib/api.ts:19`). | High | (in #2540) |
| F3 | Hand-written API types per app | DIP / contract drift | `Gameday` ×4 (`gameday_designer/src/types/api.ts:193`, `liveticker/src/v2/types.ts:20`, `passcheck/src/common/types.ts:7`, `scorecard_v2/src/api/types.ts:14`), `Game` ×3, `Team` ×2, `TeamDirectoryEntry` ×2, `CurrentUser` ×2. No OpenAPI schema in Python or JS. | **High** | M |
| F4 | Frontend god files beyond Phase 3 | SRP / OCP | 30 non-test files over 400 l. `gameday_designer/src/hooks/useFlowValidation.ts` 1,567 l: 25 rule functions, the hook itself 12 l at :1555, so it is a rule bag that wants a registry. `scorecard_v2`: `components/sheets/PlaySheet.tsx` 1,070, `offline/sync.ts` 960, `App.tsx` 823, `sheets/PenaltySheet.tsx` 837. `gameday_designer`: `components/ListDesignerApp.tsx` 920, `types/flowchart.ts` 930. | High | L |
| F5 | God props after the Phase 3 split | **ISP** | `scorecard_v2/src/screens/tracking-flow/TrackingPanels.tsx:63` `TrackingPanelsProps` has **110** members. Designer prop drilling: `ListCanvas.tsx:22` 59, `list/FieldSection.tsx:24` 31, `list/StageSection.tsx:28` 28, `MetadataTeamPoolRow.tsx:22` 28, `list/GameTable.tsx:44` 25. | High | M |
| F6 | Test data in scorecard v1 production code | Bug / boundaries | `scorecard/src/components/accounts/Login.jsx:8` imports `__tests__/testdata/gameLogData`, and :40 calls `useDispatch` inside an `if` (breaks the rules of hooks). `scorecard/src/reducers/gamesReducer.jsx:8,40` imports `GAME_LOG_ONLY_FIRSTHALF`. | High | S |
| F7 | Switches on event display names | OCP | `scorecard_v2/src/components/EventLog.tsx:430` (18 cases on `row.event`), `session/events.ts:283` (10), `app/state.ts:43` (9). `"Touchdown"` is a literal in 14 frontend files. `gamedayApi.ts` repeats `isDev && !forceClient` 19× to pick its mock instead of injecting it. | Medium | M |
| F8 | Components bound to concrete API modules | DIP / test seam | 47 direct API calls in 18 component files (designer 35 in 10; `ListDesignerApp.tsx` 12). Tests: 179 `vi.mock`, 70 of them on API modules, no MSW. Only `share` injects a fetcher. | Medium | M |
| F9 | Copy-paste across apps | DRY | Byte-identical across liveticker and scorecard: `store.js`, `reportWebVitals.js`, `setupTests.js`, `__tests__/Utils.js`. Across designer and journey: `i18n/testConfig.ts` + 4 locale JSONs. `type Side` declared 8× inside scorecard_v2. 14 date formatters in 6 apps, and only `liveticker/src/v2/format.ts` pins `Europe/Berlin`. | Medium | S–M |
| F10 | Dependency drift | Ops | 4 apps pin exact versions, 3 use caret ranges; axios at 1.21.1, ^1.16.0 and ^1.13.2. 7 lockfiles. Unused dependencies: passcheck `react-redux`, `knox`, `replace-in-file`; journey `axios`, `react-bootstrap`, `react-select`, `uuid`; scorecard `jquery`, `redux-thunk`; liveticker `react-router-dom`, `redux-thunk`. | Low | S |
| F11 | No frontend boundary rules | Enforcement | No `eslint-plugin-boundaries`, `import/no-restricted-paths`, `no-restricted-imports` or dependency-cruiser in any app. scorecard v1 has no tsconfig. Branch thresholds exist only in the two `vitest.phase3.config.*` files. | Medium | S |

## 4. Mapping to existing issues

| Issue | Already covers | Missing, proposed as a **scope addition** (comment draft in §6) |
|---|---|---|
| #2537 Phase 1 (closed) | `gamedays` no longer imports its consumers (verified: 0 allowlisted) | Not reopened. B1, B2, B3 and B5 are cycles **outside** its `gamedays`-only rule → new issue N2/N3 |
| #2538 Phase 2 (closed) | Event store is truth for v2; legacy branching confined to `gameevents` (verified) | B2's private-helper reach-back came with the canonical endpoint → N2 |
| #2539 Phase 3 (closed) | Named files are now under ~900 l | B4, F4, F5 (incl. `TrackingPanelsProps` 110) → new issue N4 "Phase 3b" |
| **#2540** Phase 4 (open) | Shared client, error model, token key, `trackEvent` | **Correct the premise** (F1: `authToken` is never written, so the job is fixing a dead path, not dual-reading). Count **10** clients + 6 ad-hoc fetches (F2). Replace the global `axios.defaults` mutation. Ship a `Fetcher`/client **injection seam** and MSW handlers in the package (F8). Move `getCookie`, the Berlin date formatter and the i18n test config into the package (F9). Align React/axios versions and drop unused deps before the `file:` spike (F10). Generated API types (F3) belong in the same package but are a separate issue (N5). |
| **#2541** Phase 5 (open) | Query gate, docs/ADR refresh, verify-per-app, GHA audit | **Import-linter** contracts for the whole backend graph (layers + independence), replacing the `gamedays`-only script once N2 lands (B11). **ESLint boundaries** per app: components may not import `api/*` directly; src may not import `__tests__` (catches F6); `no-restricted-imports` for `axios` outside the shared client (F11). **Size/complexity budget** on changed files: no new file > 900 l, no new radon grade E, props interfaces ≤ 25 members. Baseline numbers for the query gate: 175 of 210 files today. Add `accounts` to the tested set (B9). |
| **#2594** RBAC epic (open) | `is_staff` → roles, policy kernel, tenant context | B13 count is 148 (not 144). B12: `Official` identity is a session key in `officials.views` and needs the planned `Official.user` link. Policy helpers to fold into the kernel: `gamedays/api/views.py:78`, `officials/selfservice.py:128,301`, `SelfServiceWriteMixin` :224. B9: `RegisterAPI` must be closed or role-gated before roles exist. **Dependency:** the tenant middleware and `access` app need a home that is not `league_manager`'s domain-importing kernel, so N2 should land before RBAC Phase 1. |
| #1926 League table modes (open) | — | Model the three modes as a `TableMode` strategy (registry like `schedule_strategies`), not `if table_mode ==` branches in `get_standing()`. No new issue. |
| #1185 Spielberichtsbogen (open) | — | Touches `matchreport` ↔ `officials`; do N2's B3 cut first or the cycle grows. No new issue. |

## 5. Proposed new work

Numbering continues the roadmap. The delivery workflow (refine → `gh stack` → equivalence report → user merges) applies unchanged.

| Issue | Phase | Goal / scope | Depends on | Size | Exit criteria | Risk & rollback |
|---|---|---|---|---|---|---|
| **N1** | **Q** Correctness quick wins | In: B7 (validators return `bool` or the contract says "raises"; `GamedayForm.save(commit=True, user=None)`; `PlayerlistTransferForm` honours `commit` or stops being a `ModelForm.save`; null objects return one type), B9 (close or role-gate `RegisterAPI`, add `accounts` tests), F6 (remove test data from scorecard v1 src, fix the conditional hook), F1 only if #2540 does not start within 2 weeks (fix the designer/journey token read). Out: refactors. | none | S (~1 w) | Every item has a failing test first; `accounts` covered; equivalence clean (intended diffs: register endpoint status codes only) | Tiny blast radius; per-commit revert |
| **N2** | **6** Acyclic app graph | In: split `league_manager` into **config** (settings, root URLs) and a **`core`** kernel (menu base, utils, decorators) with no domain imports. Move `view_utils`' `Team` use and `dal/views.py` into their domain app. Move seed commands to a `devtools` app. Replace `gameevents`' lazy/`getattr` reach-back with a public `gamedays.service.write_guards` API (lock, finished-game, payload validation) (B2). Cut `officials` → `matchreport` by moving `REPORT_TABLE_RENDER_CONFIG` and the officiated-games query behind an `officials` port (B3). Expose official identity from `officials.identity` (B12). Typed `Protocol` per hook group in `registry.py` (B6). Out: schema changes, RBAC. | Phase 0 guardrails | M (2–3 w) | Inter-app graph acyclic except the declared `gamedays` ↔ `gameevents` projector boundary; no `getattr(module, "_…")` across apps; import-linter layers contract (`core` < domain apps < aggregators `home`/`matchreport`/`journey` < `config`) green in CI; equivalence clean | Mechanical moves with re-exports; rollback per commit. Re-export shims are removed in the last layer. |
| **N3** | **7** Designer canvas home | In: move `canvas_progression*`, `canvas_publish_service`, the designer half of `auto_assign_officials_service` and `_sync_designer_node_scores` from `gamedays` to `gameday_designer`, invoked through `designer_hooks`. Keep `GamedayDesignerState` in `gamedays/models.py` for now (moving a model is a migration; see roadmap:38). Out: model move, UX. | N2 | M–L (3–4 w) | `gamedays` has no code that reads canvas `nodes`/`data`; `_assign_from_designer_state` ≤ grade C; equivalence clean incl. the designer publish and result-sync scenarios | Characterization tests on publish/progression first; rollback per commit |
| **N4** | **3b** Second split wave | Orchestration-only like Phase 3. Backend: `officials/selfservice.py` (identity / policy / views), `gameday_designer/views.py` (`ScheduleTemplateViewSet` actions into services), `gamedays/api/views.py` (`GamedayViewSet`, result update), `home/service/home_service.py` (card providers via registry). Frontend: `useFlowValidation.ts` into a rule registry (one rule per module); `TrackingPanelsProps` into panel-scoped view models (each panel ≤ 25 props); `ListCanvas` prop drilling into a context slice; `PlaySheet.tsx`, `offline/sync.ts`, `ListDesignerApp.tsx`. Out: UX, features. | Phase 3 harness; N2 for the backend half | L (4–6 w) | No orchestration file > ~900 l in the named modules; no props type > 25 members there; 100% branch coverage on moved code; equivalence clean (backend + frontend journeys) | Same as Phase 3: two-commit extraction, per-slice revert |
| **N5** | **8** Shared domain contract | In: OpenAPI schema from DRF (`drf-spectacular`), committed and diff-checked in CI; generated TS types published from the Phase 4 shared package, replacing the hand-written `Gameday`/`Game`/`Team` (F3). **One event-code vocabulary**: codes + display labels served from the rules definition (`gameevents/service/rules.py`), consumed by backend serializers (B8) and by the frontend in place of the `row.event` switches (F7). Delete the duplicated grouping block (B8). Out: changing payloads. | #2540 spike (package exists) | M–L (3–5 w) | Schema check in CI; no hand-written API type that duplicates a generated one; `"Touchdown"` literal only in the vocabulary module and tests; equivalence clean (schema generation must not change responses) | Generated types are additive; rollback = keep the hand types |

**Recommended order:** N1 now (independent, a week). Then N2 before RBAC Phase 1 and alongside #2540. Then N3, then N4 and N5 in parallel (N5 waits for the #2540 package). Add the #2541 additions so N2's contracts land in CI as soon as N2 does.

## 6. Issue drafts (to file only after approval)

### N1: Architecture follow-up Q: correctness quick wins

```markdown
## Goal
Fix five small contract and safety defects found by the 2026-11-28 SOLID scan
(`docs/topics/planning/current/2026-11-28-solid-architecture-scan.md`, B7/B9/F6/F1).

## Scope
- passcheck validators: `BaseValidator.is_valid -> bool`, but three subclasses raise and two return `False`
  (`passcheck/service/eligibility_validation.py:83,96,111,132,143-159`); pick one failure protocol.
- `GamedayForm.save(self, user=None)` drops `commit` (`gamedays/forms.py:241`): `save(commit=False)` persists.
- `PlayerlistTransferForm.save(commit=True)` ignores `commit` (`passcheck/forms.py:135`).
- Null renderers return `"None"` vs `None` (`gamedays/service/gameday_service.py:86-96`).
- `RegisterAPI` lets any authenticated user create accounts, no password validation (`accounts/api.py:9`);
  `accounts/tests.py` is empty. Close or role-gate it; add tests for register/login/user/logout.
- scorecard v1 imports test data in production (`scorecard/src/components/accounts/Login.jsx:8,40`,
  `scorecard/src/reducers/gamesReducer.jsx:8,40`) and calls a hook conditionally.
- Only if #2540 has not started: the designer and journey read `authToken`, which nothing writes.

## Exit criteria
- [ ] Failing test first for every item; 100% branch coverage of changed functions
- [ ] Equivalence report clean (only declared diff: register endpoint status)
- [ ] black / eslint / scope coverage green

Size: S (~1 week). No dependencies.
```

### N2: Architecture remediation Phase 6: acyclic app graph

```markdown
## Goal
Turn the backend import graph into a DAG. Today all 10 core apps form one strongly connected
component because `league_manager` is config *and* a domain-importing kernel.

## Today (master 15889175e)
- `league_manager/utils/view_utils.py:1`, `dal/views.py:5`, `views.py:149`, `sitemaps.py:21` import `gamedays`;
  `gamedays/menu.py:2`, `gamedays/service/gameday_service.py:7,11` import `league_manager`.
- `gameevents/api/serializers.py:104` and `gameevents/api/views.py:133-153` reach private helpers of
  `gamedays.api.game_views` via lazy import / `getattr(..., None)`; a rename silently drops the device lock.
- `matchreport` <-> `officials` (`officials/service/officiated_games_service.py:26`, `officials/views.py:174`).
- `home/views.py:18` imports the official session key from `officials.views`.
- Hook registry is string-keyed and untyped (`gamedays/service/registry.py:21-57`).

## Scope
- `league_manager` -> `config` (settings, root URLs) + `core` kernel without domain imports; seed commands to a dev-only app.
- Public `gamedays` write-guard API for lock / finished-game / payload validation; `gameevents` calls it directly.
- Cut `officials -> matchreport`; expose official identity from `officials.identity`.
- `typing.Protocol` per hook group; registry `get()` returns the typed port.
- import-linter layers contract in CI (core < domain < aggregators < config), `gamedays`<->`gameevents` declared.
- Out: schema migrations, RBAC, UX.

## Exit criteria
- [ ] Graph acyclic except the declared projector boundary
- [ ] No cross-app `getattr(module, "_...")` or private-name import
- [ ] import-linter green in `scope_coverage`
- [ ] Equivalence report clean

Depends on: Phase 0 guardrails. Should land before RBAC (#2594) Phase 1. Size: M (2–3 weeks).
```

### N3: Architecture remediation Phase 7: move the designer canvas out of gamedays

```markdown
## Goal
`gamedays` stops knowing the designer canvas schema.

## Today
~965 lines of canvas logic in `gamedays/service/` (`canvas_progression_service.py`, `canvas_progression_validation_service.py`,
`canvas_publish_service.py`, `auto_assign_officials_service.py:129` CC 37) and `gamedays/api/views.py:578-611`
edits node JSON in `GamedayDesignerState` (`gamedays/models.py:166`).

## Scope
- Move those services into `gameday_designer`, called through `designer_hooks`.
- Keep the `GamedayDesignerState` model where it is (no migration in this phase).
- Out: model move, UX.

## Exit criteria
- [ ] No `gamedays` code reads canvas `nodes`/`data`
- [ ] `_assign_from_designer_state` at radon grade C or better
- [ ] Characterization tests first; equivalence clean incl. designer publish + result sync

Depends on: Phase 6. Size: M–L (3–4 weeks).
```

### N4: Architecture remediation Phase 3b: second split wave

```markdown
## Goal
Split the large modules Phase 3 did not name, orchestration-only, no UX change.

## Targets (master 15889175e)
Backend: `officials/selfservice.py` 916, `gameday_designer/views.py` 898 (`ScheduleTemplateViewSet` 445 l),
`gamedays/api/views.py` 842 (`GamedayViewSet` :141-416), `home/service/home_service.py` 767.
Frontend: `gameday_designer/src/hooks/useFlowValidation.ts` 1,567 (rule registry), `TrackingPanelsProps` 110 members
(`scorecard_v2/src/screens/tracking-flow/TrackingPanels.tsx:63`), `ListCanvas` 59 props, `PlaySheet.tsx` 1,070,
`offline/sync.ts` 960, `ListDesignerApp.tsx` 920.

## Exit criteria
- [ ] No orchestration file > ~900 lines and no props type > 25 members in the named modules
- [ ] 100% branch coverage on moved code (two-commit extraction)
- [ ] Equivalence clean (backend probes + frontend journeys)

Depends on: Phase 3 harness; backend half after Phase 6. Size: L (4–6 weeks).
```

### N5: Architecture remediation Phase 8: shared domain contract

```markdown
## Goal
One API contract and one event vocabulary for backend and every frontend.

## Today
`Gameday` typed by hand 4×, `Game` 3×, `Team` 2×; no OpenAPI. `"Touchdown"` literal in 8 backend modules and
14 frontend files; switches on display names (`scorecard_v2/src/components/EventLog.tsx:430`, 18 cases);
copy-pasted log grouping (`gamedays/service/gamelog.py:319` = `gamedays/api/serializers.py:358`).

## Scope
- OpenAPI via drf-spectacular, committed, diff-checked in CI.
- Generated TS types published from the Phase 4 shared package; hand types removed app by app.
- Event codes + labels served from the rules definition; serializers and frontend switch on codes, not labels.
- Out: payload changes.

## Exit criteria
- [ ] Schema check in CI; no duplicate hand-written API type
- [ ] Event-label literals only in the vocabulary module and tests
- [ ] Equivalence clean

Depends on: #2540 package spike. Size: M–L (3–5 weeks).
```

### Scope-addition comments (drafts for #2540, #2541, #2594)

- **#2540:** "Scan 2026-11-28 (§4 of the scan doc): `authToken` is read 6× and **written 0×**, so the designer's `Authorization: Token` path and journey's `trackEvent` are dead. Fix the read; no dual-read is needed for `authToken`. Clients: 10 modules + 6 ad-hoc fetches, not 5. Also in scope: drop the global `axios.defaults` mutation (import-order CSRF); a `Fetcher` injection seam + MSW handlers in the package; move `getCookie`, a Berlin date formatter and the i18n test config into the package; align React/axios and drop unused deps before the `file:` spike."
- **#2541:** "Add: import-linter contracts for the whole graph (after Phase 6); per-app ESLint boundaries (no `api/*` in components, no `__tests__` from src, `axios` only in the shared client); a changed-file budget (≤ 900 lines, no new radon E, props ≤ 25 members); query-gate baseline 175/210 files; `accounts` tests."
- **#2594:** "Inputs from the scan: `is_staff` is at 148; official identity is a session key in `officials.views` (needs `Official.user`); fold `gamedays/api/views.py:78` and `officials/selfservice.py:128,301` into the policy kernel; close or role-gate `RegisterAPI` first; land Phase 6 (acyclic graph, `core` kernel) before RBAC Phase 1 so the `access` app does not inherit the cycle."
