"""Tests for scripts/check_codecov_flags.py.

Guards the invariant behind dachrisch/leaguesphere#2015: CI is
path-scoped, so a PR confined to one app runs only that app's shard(s)
and skips the rest. Codecov needs a fresh upload per flag on every
commit, so without ``carryforward`` the skipped flags' files are dropped
from the project comparison and ``codecov/project`` falsely reports a
large coverage drop. Every flag CI uploads must therefore carry forward
its last known coverage when its shard is skipped.
"""

import importlib.util
import os

import pytest

SCRIPT = os.path.join(os.path.dirname(__file__), "..", "check_codecov_flags.py")
REPO_ROOT = os.path.join(os.path.dirname(__file__), "..", "..")


def load_module():
    spec = importlib.util.spec_from_file_location("check_codecov_flags", SCRIPT)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


@pytest.fixture()
def checker():
    return load_module()


SAMPLE_CONTINUE = """\
version: 2.1
commands:
  python_shard_test:
    parameters:
      paths:
        type: string
      cov_flag:
        type: string
    steps:
      - codecov/upload:
          flags: << parameters.cov_flag >>
          files: coverage.xml
jobs:
  python-core:
    steps:
      - python_shard_test:
          paths: "league_manager/tests/"
          cov_flag: "python-core"
  scorecard_js:
    steps:
      - codecov/upload:
          dir: scorecard/coverage
          flags: scorecard
"""

SAMPLE_FLAG_MANAGEMENT_TRUE = """\
coverage:
  status:
    project:
      default:
        target: 80
flag_management:
  default_rules:
    carryforward: true
"""


def test_extract_ci_flags_reads_shard_and_js_flags(checker):
    assert checker.extract_ci_flags(SAMPLE_CONTINUE) == ["python-core", "scorecard"]


def test_extract_ci_flags_ignores_upload_template_parameter(checker):
    flags = checker.extract_ci_flags(SAMPLE_CONTINUE)
    assert all("parameters" not in flag for flag in flags)


def test_lookup_scalar_reads_nested_value(checker):
    assert (
        checker.lookup_scalar(
            SAMPLE_FLAG_MANAGEMENT_TRUE,
            "flag_management.default_rules.carryforward",
        )
        == "true"
    )


def test_lookup_scalar_returns_none_when_missing(checker):
    assert (
        checker.lookup_scalar(SAMPLE_FLAG_MANAGEMENT_TRUE, "flags.foo.carryforward")
        is None
    )


def test_missing_carryforward_empty_when_default_enabled(checker):
    assert (
        checker.missing_carryforward(["python-core"], SAMPLE_FLAG_MANAGEMENT_TRUE) == []
    )


def test_missing_carryforward_lists_all_without_config(checker):
    assert checker.missing_carryforward(
        ["python-core", "scorecard"], "coverage:\n  status: {}\n"
    ) == ["python-core", "scorecard"]


def test_missing_carryforward_accepts_explicit_enabled_flag(checker):
    enabled = "flags:\n  python-core:\n    carryforward: true\n"
    assert checker.missing_carryforward(["python-core"], enabled) == []


def test_missing_carryforward_rejects_explicit_disabled_flag(checker):
    disabled = "flags:\n  scorecard:\n    carryforward: false\n"
    assert checker.missing_carryforward(["scorecard"], disabled) == ["scorecard"]


def test_real_ci_flags_all_carryforward(checker):
    with open(
        os.path.join(REPO_ROOT, ".circleci", "continue.yml"), encoding="utf-8"
    ) as handle:
        ci_flags = checker.extract_ci_flags(handle.read())
    with open(os.path.join(REPO_ROOT, ".codecov.yml"), encoding="utf-8") as handle:
        codecov_text = handle.read()

    assert ci_flags, "expected CI to upload at least one Codecov flag"
    assert checker.missing_carryforward(ci_flags, codecov_text) == []
