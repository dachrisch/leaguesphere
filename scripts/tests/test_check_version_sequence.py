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
