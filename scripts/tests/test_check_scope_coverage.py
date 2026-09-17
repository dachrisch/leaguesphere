"""Tests for scripts/check_scope_coverage.py (CI scope safety net).

Rule summary (see module docstring):
- Every git-tracked file must match a job regex from
  `.circleci/scope-mapping.txt` or an ignore pattern from
  `.circleci/scope-exclude.txt`.
- Mapping rules are 3-column `<regex> <param> <value>` (orb parity);
  every mapped pipeline parameter must be declared in
  `.circleci/continue.yml`.
"""

import importlib.util
import os

import pytest

SCRIPT = os.path.join(os.path.dirname(__file__), "..", "check_scope_coverage.py")


def load_module():
    spec = importlib.util.spec_from_file_location("check_scope_coverage", SCRIPT)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


@pytest.fixture()
def scope():
    return load_module()


SAMPLE_CONFIG = """\
version: 2.1
setup: true
workflows:
  setup-workflow:
    jobs:
      - path-filtering/filter:
          base-revision: master
          config-path: .circleci/continue.yml
          mapping: |
            gamedays/.* run-python-gamedays true
            passcheck/src/.* run-passcheck true
            # a comment line is not a rule
            docs/.* run-docs true

          other-param: ignored
"""

SAMPLE_CONTINUE = """\
version: 2.1
parameters:
  run-python-gamedays:
    type: boolean
    default: false
  run-passcheck:
    type: boolean
    default: false
  run-docs:
    type: boolean
    default: false
"""


def test_extract_mapping_parses_three_column_lines(scope):
    entries = scope.extract_mapping(SAMPLE_CONFIG)
    assert ("gamedays/.*", "run-python-gamedays", "true") in entries
    assert ("passcheck/src/.*", "run-passcheck", "true") in entries
    assert ("docs/.*", "run-docs", "true") in entries
    assert len(entries) == 3


def test_extract_mapping_empty_without_block(scope):
    assert scope.extract_mapping("version: 2.1\njobs: {}\n") == []


def test_classify_job_match(scope):
    job_rules = scope.compile_rules([("gamedays/.*", "run-python-gamedays", "true")])
    assert scope.classify("gamedays/tests/test_models.py", job_rules, []) == "job"


def test_classify_ignore_match(scope):
    ignore_rules = scope.compile_rules([("docs/.*", "ignore", "ignore")])
    assert scope.classify("docs/foo.md", [], ignore_rules) == "ignore"


def test_classify_uncovered_returns_none(scope):
    assert scope.classify("brand_new_app/foo.py", [], []) is None


def test_classify_job_wins_over_nothing_but_either_counts(scope):
    job_rules = scope.compile_rules([("a/.*", "p", "true")])
    ignore_rules = scope.compile_rules([("a/.*", "ignore", "ignore")])
    assert scope.classify("a/x.py", job_rules, ignore_rules) in ("job", "ignore")


def test_find_uncovered_lists_only_unmatched(scope):
    job_rules = scope.compile_rules([("gamedays/.*", "run-python-gamedays", "true")])
    ignore_rules = scope.compile_rules([("docs/.*", "ignore", "ignore")])
    files = ["gamedays/x.py", "docs/y.md", "mystery_dir/z.py"]
    assert scope.find_uncovered(files, job_rules, ignore_rules) == ["mystery_dir/z.py"]


def test_find_uncovered_empty_when_all_covered(scope):
    assert (
        scope.find_uncovered(["a.py"], [], scope.compile_rules([(".*\\.py", "i", "i")]))
        == []
    )


def test_compile_rules_rejects_bad_regex(scope):
    with pytest.raises(ValueError):
        scope.compile_rules([("([broken", "p", "true")])


def test_check_mapping_params_flags_unknown(scope):
    entries = [("gamedays/.*", "run-nope", "true")]
    errors = scope.check_mapping_params(entries, {"run-python-gamedays"})
    assert any("run-nope" in e for e in errors)


def test_check_mapping_params_ok_for_known(scope):
    entries = scope.extract_mapping(SAMPLE_CONFIG)
    known = scope.extract_parameters(SAMPLE_CONTINUE)
    assert scope.check_mapping_params(entries, known) == []


def test_extract_parameters_reads_continue_config(scope):
    params = scope.extract_parameters(SAMPLE_CONTINUE)
    assert params == {"run-python-gamedays", "run-passcheck", "run-docs"}


def test_ignore_patterns_are_valid_regexes(scope, tmp_path):
    exclude = tmp_path / "scope-exclude.txt"
    exclude.write_text("docs/.*\n" "# a comment\n" "\n" "fe_template/.*\n")
    patterns = scope.read_rules_file(str(exclude))
    assert patterns == ["docs/.*", "fe_template/.*"]
    for pattern in patterns:
        scope.compile_rules([(pattern, "ignore", "ignore")])


def test_read_mapping_file_parses_three_columns(scope, tmp_path):
    mapping = tmp_path / "scope-mapping.txt"
    mapping.write_text(
        "# comment\n"
        "\n"
        "gamedays/.* run-python-gamedays true\n"
        "docs/.* run-docs true\n"
    )
    assert scope.read_mapping_file(str(mapping)) == [
        ("gamedays/.*", "run-python-gamedays", "true"),
        ("docs/.*", "run-docs", "true"),
    ]


def test_parse_mapping_text_rejects_wrong_column_count(scope):
    with pytest.raises(ValueError):
        scope.parse_mapping_text("gamedays/.* run-python-gamedays\n")
    with pytest.raises(ValueError):
        scope.parse_mapping_text("only-one-token\n")


def test_docs_short_circuit_broad_job_rules(scope):
    job_rules = scope.compile_rules([("scorecard/.*", "run-scorecard", "true")])
    doc_rules = scope.compile_rules(
        [(p, "ignore", "ignore") for p in scope.DOC_ALWAYS_IGNORE]
    )
    assert scope.classify("scorecard/CLAUDE.md", job_rules, [], doc_rules) == "ignore"
    assert scope.classify("scorecard/src/x.js", job_rules, [], doc_rules) == "job"


def test_find_uncovered_honors_doc_rules(scope):
    job_rules = scope.compile_rules([("a/.*", "p", "true")])
    doc_rules = scope.compile_rules([(".*\\.md", "ignore", "ignore")])
    files = ["a/x.py", "a/README.md", "b/y.py"]
    assert scope.find_uncovered(files, job_rules, [], doc_rules) == ["b/y.py"]
