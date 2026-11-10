"""Tests for scripts/check_ci_gate.py.

Guards the invariant behind dachrisch/leaguesphere#2356: the branch
ruleset can only require contexts that are *always created*. A job that
is switched off with a `filters:` expression publishes no status at all,
so a red scoped suite (scorecard_js on #2353) is invisible to the
required checks and to renovate's platform automerge.

The fix moves every scoped job to the always-scheduled `needed:`
pattern (the one `build_backend` / `test_compose_network` already use):
the job always runs, decides inside whether to do the work, and
`full_gate` fans in all of them so a single required `full_gate` context
means "everything this diff scheduled is green".

These tests pin that structure:
- no workflow job may be gated by a `filters:` expression,
- a `needed:` entry must point at a declared pipeline parameter and its
  job must declare the boolean `needed` parameter,
- every job that runs on tag pipelines must be fanned in by `full_gate`
  (a deploy must never skip part of the matrix),
- every job `full_gate` requires must actually run on tag pipelines,
- no declared `run-*` parameter may be left unconsumed.
"""

import importlib.util
import os

import pytest

SCRIPT = os.path.join(os.path.dirname(__file__), "..", "check_ci_gate.py")
REPO_ROOT = os.path.join(os.path.dirname(__file__), "..", "..")


def load_module():
    spec = importlib.util.spec_from_file_location("check_ci_gate", SCRIPT)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


@pytest.fixture()
def checker():
    return load_module()


VALID_CONFIG = """\
version: 2.1
parameters:
  run-foo:
    type: boolean
    default: false
jobs:
  foo_js:
    parameters:
      needed:
        type: boolean
        default: true
    steps:
      - scoped_job:
          job_name: foo_js
          needed: << parameters.needed >>
          steps:
            - echo foo
  e2e:
    steps:
      - echo e2e
  full_gate:
    steps:
      - echo gate
workflows:
  build_test_deploy:
    jobs:
      - foo_js:
          needed: << pipeline.parameters.run-foo >>
          filters:
            tags:
              only: /.*/
      - e2e:
          filters:
            tags:
              only: /.*/
      - full_gate:
          filters:
            tags:
              only: /.*/
          requires:
            - foo_js
            - e2e
"""


def _edit(text: str, old: str, new: str) -> str:
    assert old in text, f"fixture is stale, {old!r} not found"
    return text.replace(old, new)


def test_repository_config_passes(checker):
    """The checked-in CI config must satisfy the gate invariant."""
    with open(os.path.join(REPO_ROOT, ".circleci", "continue.yml"), encoding="utf-8") as fh:
        errors = checker.check(fh.read())
    assert errors == []


def test_valid_config_passes(checker):
    assert checker.check(VALID_CONFIG) == []


def test_expression_filter_is_rejected(checker):
    """A filtered-out job publishes no status, so it cannot be gated."""
    text = _edit(
        VALID_CONFIG,
        """      - foo_js:
          needed: << pipeline.parameters.run-foo >>
          filters:
            tags:
              only: /.*/
""",
        """      - foo_js:
          filters: "(pipeline.parameters.run-foo == true)"
""",
    )
    errors = checker.check(text)
    assert any("filters:" in error and "foo_js" in error for error in errors)


def test_job_must_declare_needed_parameter(checker):
    text = _edit(
        VALID_CONFIG,
        """  foo_js:
    parameters:
      needed:
        type: boolean
        default: true
""",
        """  foo_js:
    parameters:
      unused:
        type: boolean
        default: true
""",
    )
    errors = checker.check(text)
    assert any("needed" in error and "foo_js" in error for error in errors)


def test_job_steps_must_be_wrapped_in_scoped_job(checker):
    """A declared `needed` parameter that is ignored would run everything."""
    text = _edit(
        VALID_CONFIG,
        """    steps:
      - scoped_job:
          job_name: foo_js
          needed: << parameters.needed >>
          steps:
            - echo foo
""",
        """    steps:
      - echo foo
""",
    )
    errors = checker.check(text)
    assert any("scoped_job" in error and "foo_js" in error for error in errors)


def test_unknown_pipeline_parameter_is_rejected(checker):
    text = _edit(
        VALID_CONFIG,
        "needed: << pipeline.parameters.run-foo >>",
        "needed: << pipeline.parameters.run-bar >>",
    )
    errors = checker.check(text)
    assert any("run-bar" in error for error in errors)


def test_needed_job_must_run_on_tags(checker):
    """A release resolves to a full run; a scoped job must be part of it."""
    text = _edit(
        VALID_CONFIG,
        """      - foo_js:
          needed: << pipeline.parameters.run-foo >>
          filters:
            tags:
              only: /.*/
""",
        """      - foo_js:
          needed: << pipeline.parameters.run-foo >>
""",
    )
    errors = checker.check(text)
    assert any("foo_js" in error and "tag" in error for error in errors)


def test_job_missing_from_gate_is_rejected(checker):
    text = _edit(
        VALID_CONFIG,
        """          requires:
            - foo_js
            - e2e
""",
        """          requires:
            - e2e
""",
    )
    errors = checker.check(text)
    assert any("full_gate" in error and "foo_js" in error for error in errors)


def test_gate_requiring_a_branch_only_job_is_rejected(checker):
    """A dependency that does not run on tags would skip the whole gate."""
    text = _edit(
        VALID_CONFIG,
        """  e2e:
    steps:
      - echo e2e
""",
        """  e2e:
    steps:
      - echo e2e
  branch_only:
    steps:
      - echo pr guard
""",
    )
    text = _edit(
        text,
        """      - e2e:
          filters:
            tags:
              only: /.*/
""",
        """      - e2e:
          filters:
            tags:
              only: /.*/
      - branch_only:
""",
    )
    text = _edit(
        text,
        """          requires:
            - foo_js
            - e2e
""",
        """          requires:
            - foo_js
            - e2e
            - branch_only
""",
    )
    errors = checker.check(text)
    assert any("branch_only" in error and "tag" in error for error in errors)


def test_tag_only_job_need_not_be_in_gate(checker):
    """Deploy jobs run on tags only; they are not part of the gate matrix."""
    text = _edit(
        VALID_CONFIG,
        """  full_gate:
    steps:
      - echo gate
""",
        """  full_gate:
    steps:
      - echo gate
  deploy_staging:
    steps:
      - echo deploy
""",
    )
    text = _edit(
        text,
        """      - full_gate:
          filters:
            tags:
              only: /.*/
""",
        """      - deploy_staging:
          filters:
            tags:
              only: /^v[0-9]+$/
            branches:
              ignore: /.*/
      - full_gate:
          filters:
            tags:
              only: /.*/
""",
    )
    assert checker.check(text) == []


def test_unused_pipeline_parameter_is_rejected(checker):
    text = _edit(
        VALID_CONFIG,
        """  run-foo:
    type: boolean
    default: false
""",
        """  run-foo:
    type: boolean
    default: false
  run-orphan:
    type: boolean
    default: false
""",
    )
    errors = checker.check(text)
    assert any("run-orphan" in error for error in errors)


def test_main_exit_codes(checker, monkeypatch, capsys, tmp_path):
    config = tmp_path / "continue.yml"
    config.write_text(VALID_CONFIG, encoding="utf-8")
    monkeypatch.setattr(checker, "CONTINUE_CONFIG", str(config))

    assert checker.main([]) == 0
    assert "OK" in capsys.readouterr().out

    config.write_text(
        VALID_CONFIG.replace("          requires:\n            - foo_js\n", "          requires:\n"),
        encoding="utf-8",
    )
    assert checker.main([]) == 1
    assert "FAILED" in capsys.readouterr().out
