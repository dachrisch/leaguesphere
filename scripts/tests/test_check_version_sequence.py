"""Tests for scripts/check_version_sequence.py (PR-time version guard).

Rule summary (see module docstring):
- release-please branches must move the manifest strictly forward,
  keep every version file in sync with the manifest (stable only),
  and open a forward CHANGELOG entry.
- every other branch must leave the manifest and CHANGELOG untouched;
  version files may only differ via -rc.N / +demo.N staging suffixes
  (which must be reset to the master state before merge).
"""

import importlib.util
import json
import os

import pytest

SCRIPT = os.path.join(os.path.dirname(__file__), "..", "check_version_sequence.py")


def load_module():
    spec = importlib.util.spec_from_file_location("check_version_sequence", SCRIPT)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


@pytest.fixture()
def guard():
    return load_module()


BASE = "4.23.0"
FILES_AT_BASE = {
    "pyproject.toml": "4.23.0",
    "league_manager/__init__.py": "4.23.0",
    "liveticker/package.json": "4.23.0",
    "passcheck/package.json": "4.23.0",
    "scorecard/package.json": "4.23.0",
    "scorecard_v2/package.json": "4.23.0",
    "gameday_designer/package.json": "4.23.0",
    "journey_dashboard/package.json": "4.23.0",
    "uv.lock": "4.23.0",
}

CHANGELOG_AT_BASE = (
    "# Changelog\n\n"
    "## [4.23.0](https://github.com/dachrisch/leaguesphere/compare/v4.22.1...v4.23.0) (2026-09-04)\n"
)


def changelog_for(new, base):
    return (
        "# Changelog\n\n"
        f"## [{new}](https://github.com/dachrisch/leaguesphere/compare/v{base}...v{new}) (2026-09-06)\n"
        + CHANGELOG_AT_BASE.split("# Changelog\n\n", 1)[1]
    )


def files_at(version):
    return dict.fromkeys(FILES_AT_BASE, version)


class TestReleasePleaseBranches:
    def test_valid_minor_bump_passes(self, guard):
        errors = guard.check_release_please_branch(
            base_manifest=BASE,
            head_manifest="4.24.0",
            head_files=files_at("4.24.0"),
            base_changelog=CHANGELOG_AT_BASE,
            head_changelog=changelog_for("4.24.0", BASE),
        )
        assert errors == []

    def test_repro_pr_1925_downgrade_is_blocked(self, guard):
        """4.23.0 -> 4.15.3 must fail (the exact #1925 downgrade)."""
        errors = guard.check_release_please_branch(
            base_manifest=BASE,
            head_manifest="4.15.3",
            head_files=files_at("4.15.3"),
            base_changelog=CHANGELOG_AT_BASE,
            head_changelog=changelog_for("4.15.3", BASE),
        )
        assert any("4.15.3" in e and "4.23.0" in e for e in errors)

    def test_same_version_is_blocked(self, guard):
        errors = guard.check_release_please_branch(
            base_manifest=BASE,
            head_manifest=BASE,
            head_files=FILES_AT_BASE,
            base_changelog=CHANGELOG_AT_BASE,
            head_changelog=CHANGELOG_AT_BASE,
        )
        assert errors != []

    def test_rc_version_on_release_please_branch_is_blocked(self, guard):
        """The 4.23.1-rc.7 contamination must never ship via release-please."""
        head_files = files_at("4.23.1-rc.7")
        errors = guard.check_release_please_branch(
            base_manifest=BASE,
            head_manifest="4.23.0",
            head_files=head_files,
            base_changelog=CHANGELOG_AT_BASE,
            head_changelog=changelog_for("4.23.0", BASE),
        )
        assert any("rc" in e for e in errors)

    def test_desynced_version_file_is_blocked(self, guard):
        head_files = files_at("4.24.0")
        head_files["pyproject.toml"] = "4.23.0"
        errors = guard.check_release_please_branch(
            base_manifest=BASE,
            head_manifest="4.24.0",
            head_files=head_files,
            base_changelog=CHANGELOG_AT_BASE,
            head_changelog=changelog_for("4.24.0", BASE),
        )
        assert any("pyproject.toml" in e for e in errors)

    def test_backwards_changelog_link_is_blocked(self, guard):
        errors = guard.check_release_please_branch(
            base_manifest=BASE,
            head_manifest="4.24.0",
            head_files=files_at("4.24.0"),
            base_changelog=CHANGELOG_AT_BASE,
            head_changelog=changelog_for("4.24.0", "4.24.0"),
        )
        assert any("CHANGELOG" in e for e in errors)


class TestFeatureBranches:
    def test_clean_feature_branch_passes(self, guard):
        errors = guard.check_feature_branch(
            base_manifest=BASE,
            head_manifest=BASE,
            base_files=FILES_AT_BASE,
            head_files=dict(FILES_AT_BASE),
            base_changelog=CHANGELOG_AT_BASE,
            head_changelog=CHANGELOG_AT_BASE,
        )
        assert errors == []

    def test_staging_rc_versions_are_allowed_on_branch(self, guard):
        head_files = files_at("4.23.1-rc.7")
        errors = guard.check_feature_branch(
            base_manifest=BASE,
            head_manifest=BASE,
            base_files=FILES_AT_BASE,
            head_files=head_files,
            base_changelog=CHANGELOG_AT_BASE,
            head_changelog=CHANGELOG_AT_BASE,
        )
        assert errors == []

    def test_manifest_touch_on_feature_branch_is_blocked(self, guard):
        """Merging release-please into a feature branch (#1917 vector)."""
        errors = guard.check_feature_branch(
            base_manifest="4.22.1",
            head_manifest="4.23.0",
            base_files=FILES_AT_BASE,
            head_files=dict(FILES_AT_BASE),
            base_changelog=CHANGELOG_AT_BASE,
            head_changelog=CHANGELOG_AT_BASE,
        )
        assert any("manifest" in e for e in errors)

    def test_stable_version_edit_on_feature_branch_is_blocked(self, guard):
        head_files = dict(FILES_AT_BASE)
        head_files["pyproject.toml"] = "4.99.0"
        errors = guard.check_feature_branch(
            base_manifest=BASE,
            head_manifest=BASE,
            base_files=FILES_AT_BASE,
            head_files=head_files,
            base_changelog=CHANGELOG_AT_BASE,
            head_changelog=CHANGELOG_AT_BASE,
        )
        assert any("pyproject.toml" in e for e in errors)

    def test_changelog_edit_on_feature_branch_is_blocked(self, guard):
        errors = guard.check_feature_branch(
            base_manifest=BASE,
            head_manifest=BASE,
            base_files=FILES_AT_BASE,
            head_files=dict(FILES_AT_BASE),
            base_changelog=CHANGELOG_AT_BASE,
            head_changelog=changelog_for("4.24.0", BASE),
        )
        assert any("CHANGELOG" in e for e in errors)

    def test_version_file_introduced_by_the_branch_passes(self, guard):
        """A new SPA package.json starts at the base manifest version."""
        base_files = {
            path: version
            for path, version in FILES_AT_BASE.items()
            if path != "scorecard_v2/package.json"
        }
        head_files = dict(FILES_AT_BASE)
        head_files["scorecard_v2/package.json"] = BASE
        errors = guard.check_feature_branch(
            base_manifest=BASE,
            head_manifest=BASE,
            base_files=base_files,
            head_files=head_files,
            base_changelog=CHANGELOG_AT_BASE,
            head_changelog=CHANGELOG_AT_BASE,
        )
        assert errors == []

    def test_new_version_file_must_start_at_the_base_manifest_version(self, guard):
        """A new file may not invent a version the manifest does not carry."""
        base_files = {
            path: version
            for path, version in FILES_AT_BASE.items()
            if path != "scorecard_v2/package.json"
        }
        head_files = dict(FILES_AT_BASE)
        head_files["scorecard_v2/package.json"] = "4.24.0"
        errors = guard.check_feature_branch(
            base_manifest=BASE,
            head_manifest=BASE,
            base_files=base_files,
            head_files=head_files,
            base_changelog=CHANGELOG_AT_BASE,
            head_changelog=CHANGELOG_AT_BASE,
        )
        assert any(
            "scorecard_v2/package.json" in e
            and "new version file must start at the base manifest version" in e
            for e in errors
        )

    def test_new_version_file_may_carry_a_staging_suffix(self, guard):
        """The deploy flow may pre-stage a new file as <manifest>+demo.N."""
        base_files = {
            path: version
            for path, version in FILES_AT_BASE.items()
            if path != "scorecard_v2/package.json"
        }
        head_files = dict(FILES_AT_BASE)
        head_files["scorecard_v2/package.json"] = f"{BASE}+demo.1"
        errors = guard.check_feature_branch(
            base_manifest=BASE,
            head_manifest=BASE,
            base_files=base_files,
            head_files=head_files,
            base_changelog=CHANGELOG_AT_BASE,
            head_changelog=CHANGELOG_AT_BASE,
        )
        assert errors == []

    def test_new_version_file_may_be_bumped_for_a_staging_deploy(self, guard):
        """The deploy workflow bumps every package.json to the next rc."""
        base_files = {
            path: version
            for path, version in FILES_AT_BASE.items()
            if path != "scorecard_v2/package.json"
        }
        head_files = dict(FILES_AT_BASE)
        head_files["scorecard_v2/package.json"] = "4.24.1-rc.1"
        errors = guard.check_feature_branch(
            base_manifest=BASE,
            head_manifest=BASE,
            base_files=base_files,
            head_files=head_files,
            base_changelog=CHANGELOG_AT_BASE,
            head_changelog=CHANGELOG_AT_BASE,
        )
        assert errors == []


class TestBaseState:
    def test_present_but_unreadable_base_file_fails_closed(self, guard, monkeypatch):
        """A file that exists on master but cannot be read is not 'new'."""
        base_ref = "origin/master"
        unreadable = "scorecard/package.json"

        def fake_git(args):
            if args[0] == "fetch":
                return ""  # best effort, nothing to fetch
            if args[0] == "ls-tree":
                return args[-1]  # every version file exists in the base tree
            assert args[0] == "show", args
            revision = args[1]
            if revision == f"{base_ref}:{guard.MANIFEST_PATH}":
                return json.dumps({".": BASE})
            if revision == f"{base_ref}:{guard.CHANGELOG_PATH}":
                return CHANGELOG_AT_BASE
            path = revision.split(":", 1)[1]
            if path == unreadable:
                return None  # tree entry exists, blob read fails
            return guard._read_working_tree(path)

        monkeypatch.setattr(guard, "_git", fake_git)

        state, error = guard.collect_state(base_ref)

        assert state is None
        assert error == f"could not read {unreadable} from {base_ref} - failing closed"

    def test_unlistable_base_file_fails_closed(self, guard, monkeypatch):
        """A failed listing is not an absent file, so it must not mean 'new'."""
        base_ref = "origin/master"

        def fake_git(args):
            if args[0] == "fetch":
                return ""
            if args[0] == "ls-tree":
                return None  # object/network error while listing the tree
            assert args[0] == "show", args
            revision = args[1]
            if revision == f"{base_ref}:{guard.MANIFEST_PATH}":
                return json.dumps({".": BASE})
            if revision == f"{base_ref}:{guard.CHANGELOG_PATH}":
                return CHANGELOG_AT_BASE
            return None

        monkeypatch.setattr(guard, "_git", fake_git)

        state, error = guard.collect_state(base_ref)

        assert state is None
        assert error == f"could not list pyproject.toml in {base_ref} - failing closed"
