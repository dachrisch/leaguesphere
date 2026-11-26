---
name: reviewing-leaguesphere-prs
description: Use when reviewing a LeagueSphere pull request or stack, especially
  refactor/move and stacked PRs, at the bar set by the human reviews on Stack 1
type: skill
---

# Reviewing LeagueSphere PRs

Review at the bar of the Stack 1 human reviews: prove behaviour, not just
style. Work through every section; skip only a rule that cannot apply.

## 1. Mindset

- [ ] **Verify every claim in code** at the PR's head *and* its own base.
      For a stacked PR the base is the PR below, not `master`. Post only
      findings you reproduced or traced in code, and cite `file:line`.
      Example: "The predicate now runs before the `try` (`signals.py:41`);
      on the base it ran inside it (`signals.py:38`)."
- [ ] **Treat the PR body and plan doc as claims too.** Flag text that does
      not match the code.
      Example: body says "reads through the FK descriptor, no hook"; code
      calls a hook and catches `ObjectDoesNotExist`.
- [ ] **Label every finding by severity.** `must fix` = behaviour change,
      broken gate, or test that pins nothing; `should fix` = real risk or
      maintenance debt; `nit` = cosmetic.
      Example: "**must fix** — `applies()` outside the `try` propagates."
- [ ] **End with a summary table** listing PR, verdict, and counts by
      severity.
      Example: `| #1234 | request changes | 2 must / 1 should / 3 nit |`.
- [ ] **Reviewing your own account's PR?** GitHub allows only `COMMENT`,
      not request-changes. Post inline comments via the reviews API:

      ```bash
      gh api repos/dachrisch/leaguesphere/pulls/<n>/reviews \
        -f event=COMMENT -f body='...' \
        -f 'comments[][path]=...' -f 'comments[][line]=...'
      ```

## 2. Behaviour-preserving moves (refactor PRs)

- [ ] **Exception guards moved.** Code formerly inside a broad
      `try/except` (log and continue) must not now run outside it, where a
      failure propagates.
      Example: a strategy's `applies()` called before the `try` in a
      post_save signal makes `Gameinfo.save()` fail instead of logging.
- [ ] **None/empty semantics.** Check that `param=None` still matches
      nothing; a refactored query must not silently mean "no filter, return
      all". Ask for a sentinel or a separate function.
      Example: `filter(team=team)` with `team=None` used to return `[]` and
      now returns the whole table.
- [ ] **Lookups that used to raise now return `None`.** A hook returning
      `None` where `LeagueGroup.objects.get()` raised `DoesNotExist` silently
      creates data without the group. Prefer failing loudly, plus a test.
      Example: unknown group id must raise, not save `group=None`.
- [ ] **Order of contributors/hooks.** A later step can see a transformed
      object (a builder dict instead of the raw DataFrame), changing a
      membership check such as `username in qualify_table`. Keep the raw
      value or pin the new semantics in a test.
      Example: check `username in raw_df["username"]`, not the dict.
- [ ] **Unreachable fallbacks.** An `is_registered(...)` fallback can never
      run when `__init__` already calls a hook that raises
      `ImproperlyConfigured`. A test reaching it via `object.__new__` does
      not count.
      Example: delete the fallback or make the hook lazy; do not claim
      coverage from an `__new__` test.
- [ ] **Registry hygiene.** A hook never registered must name its real
      owner, derived from `HOOK_REQUIREMENTS`, not from a cache that
      `reset()` keeps. `register()` by a different owner must raise, not
      silently replace. Remove unused `reset()`/hooks that would drop
      registrations made in `AppConfig.ready()`.
      Example: two `register()` calls from different owners → error.
- [ ] **Dead leftovers.** Remove unused imports (`apps`, `settings`, `Q`,
      `pandas`) and unused draft fields after a move; they also hide dead
      test patches.
      Example: a stale `patch("...settings.INSTALLED_APPS")` hits nothing.
- [ ] **Query counts.** Note any change, even one query fewer, and ask for
      it to be stated. `gamedays` must not import its consumer apps
      (`scripts/check_app_boundaries.py`); check bare `import_module(...)`,
      `__import__(...)`, and keyword `apps.get_model(app_label=...)` too.
      Example: "This drops a query — state it; the keyword `get_model` call
      still crosses the boundary."

## 3. Tests: do they pin anything?

- [ ] **No mock-returns-mock.** A test patching the hook to return `X` and
      asserting `X` pins nothing. Characterization tests must survive the
      move **unchanged** (patch the underlying queryset/model, not the new
      hook). Flag any characterization test rewritten in the move commit.
      Example: patch `Gameinfo.objects.filter`, not the hook; keep the old
      assertion.
- [ ] **No tautological asserts.** `assertGreaterEqual(queries, 1)` cannot
      catch an N+1. Require `assertNumQueries(<exact n>)` (AGENTS.md mandates
      exact counts), ideally with two rows so a per-row query shows.
      Example: `with self.assertNumQueries(3): ...` over two gamedays.
- [ ] **Every branch asserts output.** A branch that merely runs proves
      nothing; require output assertions per case.
      Example: assert the name, the jersey-only fallback, and the
      missing-first-name fallback separately.
- [ ] **Patches still hit something.** After a move, patching
      `settings.INSTALLED_APPS` or `apps.is_installed` may be a no-op and
      the test passes for another reason. Patch what the code now reads and
      assert the fallback output.
      Example: patch `HOOK_REQUIREMENTS`, assert the owner warning.
- [ ] **No early returns before the boundary.** A test that returns before
      the hook is called does not characterize that hook.
      Example: assert a row reaches the hook before checking its result.
- [ ] **No global state leaks.** Tests that `reset()` a registry/contributor
      list and never restore it make later tests take fallback paths and
      pass only by ordering. Require save/restore in a fixture.
      Example: `old = list(registry); yield; registry[:] = old`.
- [ ] **No mock-chain-shape-only asserts.** Asserting `.filter().exclude()`
      was called proves nothing about arguments. Assert call args or use a
      small `django_db` test.
      Example: `mock.assert_called_once_with(team__isnull=True)`.
- [ ] **Captured kwargs not dropped.** If a test patches a factory (e.g. a
      formset builder) and drops `form_kwargs`, the thing under test
      (`group_choices`) is never checked.
      Example: assert `form_kwargs["group_choices"]` has the groups.

## 4. Gates and tooling

- [ ] **`scripts/check_branch_coverage.py`** demands 100% branch coverage on
      created/changed/moved functions. coverage.py JSON has a `""` entry for
      module-level code that owns `def`/decorator lines; fixtures without it
      hide bugs. A changed `def` line must scope its function, while
      import-only edits must not fail on unrelated module-level branches.
      The omit list must mirror `.coveragerc`; repo-root files
      (`conftest.py`, `test_settings.py`, `manage.py`) and `.claude/**` must
      be ignored or mapped. One real `coverage run` + `coverage json` test
      beats synthetic fixtures.
      Example: inspect the JSON `""` entry when a moved `def` loses scope.
- [ ] **Gate base is the merge base with `origin/master`**, not
      `pipeline.git.base_revision`.
      Example: `git merge-base origin/master HEAD` matches the gate base.
- [ ] **Required checks: `full_gate`, `scope_coverage`,
      `check_version_sequence`.** A red `check_version_sequence` on an old
      stack usually means master released a newer version; rebase fixes it,
      not a code change.
      Example: `git rebase origin/master` and push; do not bump a version.
- [ ] **Check PR text against actual route/file names.**
      Example: the wizard route is `/gamedays/gameday/new/` — reject a body
      naming a different path.

## 5. Equivalence (ref vs cand) claims

- [ ] **"0 diffs" counts only if scenarios reach the changed path.** Three
      finalize scenarios that all saved a designer canvas first hit
      `GamedayDesignerState` only; none reached the `TemplateApplication` or
      legacy `ScheduleUpdate` branches the PR rewired. Ask which branch
      each scenario hits.
      Example: "Scenario 2 never leaves `GamedayDesignerState` — re-run
      with a template."
- [ ] **Normalisers must not hide real differences** — check exactly what
      they strip.
      Example: a comparer stripping `updated_at` hides a changed write
      path; compare raw objects too.
- [ ] **Behaviour-changing layers list intended diffs explicitly.** Check
      the list is complete, account for every client of a removed
      field/path (scorecard v1, scorecard_v2, liveticker, share/snapshot
      API), and require rollback after release.
      Example: removed `gameinfo_id` → list each client and the rollback.

## 6. Stacks and PR hygiene

- [ ] **Stacks are built with `gh stack`.** Review each PR against its own
      base; merge only via `gh stack merge <top> --merge`. Never merge a
      middle PR by hand.
      Example: `gh pr view <mid>` shows base = PR below, not `master`.
- [ ] **Titles are Conventional Commits**:
      `<type>(<scope>)[!]: <summary>`, ≤ 72 chars; use `!` for
      behaviour-changing layers.
      Example: `feat(scorecard)!: switch tracking to series v2`.
- [ ] **Every phase/feature issue is closed by a `Closes #N`** in at least
      one PR of its stack.
      Example: stack L7–L12 must collectively contain `Closes #1234`.
- [ ] **No schema migrations in pure refactor stacks**; each layer must be
      revertible with `git revert -m 1`.
      Example: a migration in an "extract hook" layer → must fix.
- [ ] **Commits are signed off (DCO).**
      Example: every commit carries `Signed-off-by: ...`.
