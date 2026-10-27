# Contributing to LeagueSphere

Thanks for helping. This file covers the two things you must know before your
first pull request — **the licence** and **the sign-off** — and points you at
the guides for everything else.

## Licence of contributions

LeagueSphere is licensed under
[AGPL-3.0-or-later](LICENSE). By contributing you agree that your contribution
is licensed under the same terms, unless you explicitly state otherwise. There
is **no CLA and no copyright assignment**: you keep the copyright in what you
write, and everybody keeps the same rights you do.

> LeagueSphere is AGPL-3.0-or-later. Any league can self-host it for free,
> forever. Anyone may run it commercially — the only condition is that if you
> run a modified version as a service, you publish that version's source. We
> ask for a DCO sign-off, not a CLA, because we have no plans to relicense.

Releases up to and including **v4.43.x** were published under CC0-1.0. That
dedication is irrevocable, so those releases stay free of copyleft obligations.
AGPL-3.0-or-later applies to this release and to every commit after it. See
[NOTICE](NOTICE) and [the licensing guide](docs/topics/guides/licensing.md).

### Why a DCO and not a CLA

A CLA asks you to hand over rights so the project could relicense later. We do
not want that option, so we do not ask for it. The
[Developer Certificate of Origin](https://developercertificate.org/) is a
one-line statement that you have the right to submit the code under the
project licence.

## Sign-off (required)

Every commit in a pull request must carry a `Signed-off-by` trailer matching its
author. Add it automatically:

```bash
git commit -s -m "feat(scorecard): ..."
```

Forgot on an existing branch? Sign off every commit since `master`:

```bash
git rebase --signoff master
git push --force-with-lease
```

The trailer looks like this and uses your real name and email:

```
Signed-off-by: Your Name <you@example.com>
```

A GitHub Actions workflow (`.github/workflows/dco.yaml`) rejects pull requests
with unsigned commits. A failing DCO check is easy to fix — amend or rebase,
then force-push; nobody has to re-review the code.

## What AGPL means if you self-host

- **Your league runs a stock instance, internally or publicly.** No obligation.
  Nothing to publish.
- **You modify a copy and only use it inside your organisation.** No obligation
  to publish. (If you offer it to users outside your organisation over a
  network, §13 applies.)
- **You run a modified version as a public service.** Publish the corresponding
  source of that version, including your changes, and tell users where to find
  it. The
  [licensing guide](docs/topics/guides/licensing.md) has a compliance checklist.

## Before you open a PR

Read the [Contributor Guide](docs/topics/guides/contributor-guide.md). The
short version:

- **TDD**: reproduce a bug with a failing test, then fix it. New features need
  tests.
- **Tests and lint** must pass before you push:
  ```bash
  uv sync --extra test
  pytest                 # backend
  black .                # formatting
  cd scorecard && npm run test:run && npm run eslint   # per frontend app
  ```
- **Scoped CI**: if you add a tracked file, make sure it is covered by a rule
  in `.circleci/scope-mapping.txt` or listed in `.circleci/scope-exclude.txt`,
  and run `python3 scripts/check_scope_coverage.py`.
- **REUSE**: licensing metadata for new files is covered automatically by
  `REUSE.toml`. If you vendor third-party code or assets with different terms,
  annotate them in `REUSE.toml` and run `reuse lint`.
- **Conventional Commits**: `feat:`, `fix:`, `docs:`, `refactor:`, `test:`,
  `chore:`. Add `!` and a `BREAKING CHANGE:` footer for a major release.
- **Docs** go in `docs/topics/`; see [DOCUMENTATION.md](docs/DOCUMENTATION.md).
- **Help topics**: user-facing behaviour changes need an in-app `/help/`
  entry — see `.opencode/skills/add-help-topic/SKILL.md`.

## Trademarks

The code licence does not grant rights to the LeagueSphere name or logo. If you
publish a fork, read [TRADEMARKS.md](TRADEMARKS.md) first.
