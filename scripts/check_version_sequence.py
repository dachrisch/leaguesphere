#!/usr/bin/env python3
"""PR-time guard against backwards or desynced version bumps.

Why this exists: CircleCI's ``check_release_sequence`` only runs on *tag*
pipelines and treats ``master``'s ``.release-please-manifest.json`` as the
source of truth. It therefore cannot catch a *branch* (e.g. a release-please
PR such as #1925) that moves the manifest itself backwards
(``4.23.0 -> 4.15.3``) or ships ``-rc`` staging leftovers to master.

This script runs on *branch* pipelines (including the release-please
branch), i.e. at PR time, before anything is merged:

- on ``release-please--*`` branches: the manifest must move strictly
  forward, every version file must equal the new manifest version (stable
  only, no ``-rc``/``+demo``), and the new CHANGELOG entry must link
  forward (``v<base>...v<head>``).
- on every other branch: the manifest and CHANGELOG must stay identical
  to ``origin/master`` (only release-please may touch them); version
  files must either match master or carry a staging suffix (``-rc.N`` /
  ``+demo.N``) from the ``deploy.yaml`` flow, which has to be reset to
  the master state before merge.

Exit 0 when everything is in sequence, 1 with a human-readable reason
otherwise (fail closed when the base state cannot be determined).
"""

from __future__ import annotations

import argparse
import json
import os
import re
import subprocess
import sys

MANIFEST_PATH = ".release-please-manifest.json"
CHANGELOG_PATH = "CHANGELOG.md"

# path -> kind; kinds: "init" (__version__ = "x"), "pyproject"
# (version = "x"), "package-json" ("version": "x"), "uv-lock"
# (version = "x", PEP 440 normalized, i.e. 4.23.1-rc.7 -> 4.23.1rc7)
VERSION_FILES = {
    "pyproject.toml": "pyproject",
    "league_manager/__init__.py": "init",
    "liveticker/package.json": "package-json",
    "passcheck/package.json": "package-json",
    "scorecard/package.json": "package-json",
    "gameday_designer/package.json": "package-json",
    "journey_dashboard/package.json": "package-json",
    "uv.lock": "uv-lock",
}

STABLE_RE = re.compile(r"^(\d+)\.(\d+)\.(\d+)$")
SUFFIX_RE = re.compile(r"^(\d+)\.(\d+)\.(\d+)([-+])(.+)$")
CHANGELOG_ENTRY_RE = re.compile(
    r"^## \[([^\]]+)\]\(https://github\.com/dachrisch/leaguesphere/compare/(v\S+)\.\.\.(v\S+)\)",
    re.MULTILINE,
)


def parse_stable(version: str) -> tuple[int, int, int]:
    match = STABLE_RE.match(version.strip())
    if not match:
        raise ValueError(f"not a stable X.Y.Z version: {version!r}")
    return int(match.group(1)), int(match.group(2)), int(match.group(3))


def split_suffix(version: str) -> tuple[tuple[int, int, int], str]:
    """Return (stem, suffix) where suffix is '' for stable versions."""
    version = version.strip()
    try:
        return parse_stable(version), ""
    except ValueError:
        pass
    match = SUFFIX_RE.match(version)
    if not match:
        raise ValueError(f"unparsable version: {version!r}")
    stem = (int(match.group(1)), int(match.group(2)), int(match.group(3)))
    return stem, match.group(4) + match.group(5)


def normalize_uv_lock(version: str) -> str:
    """Undo PEP 440 normalization for comparison (4.23.1rc7 -> 4.23.1-rc.7)."""
    match = re.match(r"^(\d+\.\d+\.\d+)rc(\d+)$", version.strip())
    if match:
        return f"{match.group(1)}-rc.{match.group(2)}"
    return version.strip()


def read_version_from_text(path: str, text: str) -> str:
    kind = VERSION_FILES[path]
    if kind == "init":
        match = re.search(r'__version__ = "([^"]+)"', text)
    elif kind == "pyproject":
        match = re.search(r'^version = "([^"]+)"', text, re.MULTILINE)
    elif kind == "package-json":
        try:
            match_data = json.loads(text)
        except json.JSONDecodeError as exc:
            raise ValueError(f"{path}: invalid JSON ({exc})") from exc
        if "version" not in match_data:
            raise ValueError(f"{path}: no 'version' key")
        return str(match_data["version"])
    elif kind == "uv-lock":
        match = re.search(
            r'\[\[package\]\]\nname = "leaguesphere"\nversion = "([^"]+)"', text
        )
    else:  # pragma: no cover - exhaustive by construction
        raise AssertionError(f"unknown version file kind: {kind}")
    if not match:
        raise ValueError(f"{path}: version not found")
    version = match.group(1)
    return normalize_uv_lock(version) if kind == "uv-lock" else version


def changelog_head_entry(text: str) -> tuple[str, str, str] | None:
    """Return (entry_version, compare_base, compare_head) of the top entry."""
    match = CHANGELOG_ENTRY_RE.search(text)
    if not match:
        return None
    return match.group(1), match.group(2), match.group(3)


def check_release_please_branch(
    base_manifest: str,
    head_manifest: str,
    head_files: dict[str, str],
    base_changelog: str,
    head_changelog: str,
) -> list[str]:
    errors: list[str] = []
    try:
        base = parse_stable(base_manifest)
    except ValueError:
        return [f"base manifest version is not stable: {base_manifest!r}"]
    try:
        head = parse_stable(head_manifest)
    except ValueError:
        return [
            f"release-please manifest must be a stable X.Y.Z version, "
            f"got {head_manifest!r} (staging -rc/+demo versions must never "
            f"reach master)"
        ]
    if head <= base:
        errors.append(
            f"manifest moves backwards or stalls: {head_manifest} (HEAD) is "
            f"not greater than {base_manifest} (origin/master)"
        )
    for path in VERSION_FILES:
        if path not in head_files:
            errors.append(f"{path}: missing from version check")
        elif head_files[path] != head_manifest:
            errors.append(
                f"{path} is {head_files[path]!r} but manifest is "
                f"{head_manifest!r}: version files must match the manifest"
            )
    entry = changelog_head_entry(head_changelog)
    base_entry = changelog_head_entry(base_changelog)
    if entry is None:
        errors.append("CHANGELOG: no parsable top entry (## [x](.../compare/...))")
    else:
        entry_version, link_base, link_head = entry
        if entry_version != head_manifest:
            errors.append(
                f"CHANGELOG top entry is {entry_version!r} but manifest is "
                f"{head_manifest!r}"
            )
        if link_base != f"v{base_manifest}" or link_head != f"v{head_manifest}":
            errors.append(
                f"CHANGELOG compare link is {link_base}...{link_head}, "
                f"expected v{base_manifest}...v{head_manifest} "
                f"(backwards links like v4.23.0...v4.15.3 are a downgrade)"
            )
    if base_entry is not None and entry is not None:
        expected_second = base_entry[0]
        heads = [m.group(1) for m in CHANGELOG_ENTRY_RE.finditer(head_changelog)]
        if len(heads) < 2 or heads[1] != expected_second:
            errors.append(
                "CHANGELOG: new entry must be prepended on top of the "
                "existing history (existing entries must be preserved)"
            )
    _ = base  # (kept for readability of the forward-move check above)
    return errors


def check_feature_branch(
    base_manifest: str,
    head_manifest: str,
    base_files: dict[str, str],
    head_files: dict[str, str],
    base_changelog: str,
    head_changelog: str,
) -> list[str]:
    errors: list[str] = []
    if head_manifest != base_manifest:
        errors.append(
            f"manifest is {head_manifest!r} but origin/master is "
            f"{base_manifest!r}: only release-please may change the manifest "
            f"(do not merge the release-please branch into feature branches)"
        )
    if head_changelog != base_changelog:
        errors.append(
            "CHANGELOG differs from origin/master: only release-please may "
            "edit the changelog"
        )
    for path in VERSION_FILES:
        base_version = base_files.get(path)
        head_version = head_files.get(path)
        if head_version is None:
            errors.append(f"{path}: missing from version check")
            continue
        if head_version == base_version:
            continue
        try:
            _stem, suffix = split_suffix(head_version)
        except ValueError:
            errors.append(f"{path} has unparsable version {head_version!r}")
            continue
        if suffix == "":
            errors.append(
                f"{path} is {head_version!r} but origin/master is "
                f"{base_version!r}: stable version edits belong to "
                f"release-please only"
            )
        # -rc.N / +demo.N staging bumps are allowed on the branch but must
        # be reset to the master state before merge (else the squash merge
        # contaminates master, as 4.23.1-rc.7 did in #1917).
    return errors


def _git(args: list[str]) -> str | None:
    try:
        result = subprocess.run(
            ["git", *args],
            capture_output=True,
            text=True,
            check=False,
        )
    except OSError:
        return None
    if result.returncode != 0:
        return None
    return result.stdout


def _read_working_tree(path: str) -> str | None:
    try:
        with open(path, encoding="utf-8") as handle:
            return handle.read()
    except OSError:
        return None


def collect_state(base_ref: str) -> tuple[dict | None, str | None]:
    """Return ((base_state, head_state), error). States map path->content."""
    if _git(["fetch", "origin", "master:refs/remotes/origin/master"]) is None:
        pass  # best effort; origin/master may already be present
    manifest_raw = _git(["show", f"{base_ref}:{MANIFEST_PATH}"])
    changelog_base = _git(["show", f"{base_ref}:{CHANGELOG_PATH}"])
    if manifest_raw is None or changelog_base is None:
        return None, (
            f"could not read {MANIFEST_PATH}/{CHANGELOG_PATH} from {base_ref} "
            f"- failing closed"
        )
    try:
        base_manifest = json.loads(manifest_raw)["."]
    except (json.JSONDecodeError, KeyError) as exc:
        return None, f"could not parse base manifest ({exc}) - failing closed"
    base_files: dict[str, str] = {}
    for path in VERSION_FILES:
        content = _git(["show", f"{base_ref}:{path}"])
        if content is None:
            return None, f"could not read {path} from {base_ref} - failing closed"
        try:
            base_files[path] = read_version_from_text(path, content)
        except ValueError as exc:
            return None, f"base {exc} - failing closed"
    head_manifest_raw = _read_working_tree(MANIFEST_PATH)
    head_changelog = _read_working_tree(CHANGELOG_PATH)
    if head_manifest_raw is None or head_changelog is None:
        return None, "could not read working-tree manifest/CHANGELOG - failing closed"
    try:
        head_manifest = json.loads(head_manifest_raw)["."]
    except (json.JSONDecodeError, KeyError) as exc:
        return None, f"could not parse working-tree manifest ({exc})"
    head_files: dict[str, str] = {}
    for path in VERSION_FILES:
        content = _read_working_tree(path)
        if content is None:
            return [f"{path}: file missing from working tree"], None
        try:
            head_files[path] = read_version_from_text(path, content)
        except ValueError as exc:
            return [str(exc)], None
    base_state = {
        "manifest": base_manifest,
        "files": base_files,
        "changelog": changelog_base,
    }
    head_state = {
        "manifest": head_manifest,
        "files": head_files,
        "changelog": head_changelog,
    }
    return (base_state, head_state), None


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--base-ref", default="origin/master")
    parser.add_argument("--branch", default=os.environ.get("CIRCLE_BRANCH", ""))
    args = parser.parse_args(argv)

    states, error = collect_state(args.base_ref)
    if states is None:
        print(f"check_version_sequence FAILED: {error}")
        return 1
    base_state, head_state = states
    if isinstance(head_state, list):  # working-tree read errors
        print("check_version_sequence FAILED:")
        for line in head_state:
            print(f"  - {line}")
        return 1

    branch = args.branch or "(unknown branch)"
    is_release_please = branch.startswith("release-please--")
    if is_release_please:
        errors = check_release_please_branch(
            base_manifest=base_state["manifest"],
            head_manifest=head_state["manifest"],
            head_files=head_state["files"],
            base_changelog=base_state["changelog"],
            head_changelog=head_state["changelog"],
        )
    else:
        errors = check_feature_branch(
            base_manifest=base_state["manifest"],
            head_manifest=head_state["manifest"],
            base_files=base_state["files"],
            head_files=head_state["files"],
            base_changelog=base_state["changelog"],
            head_changelog=head_state["changelog"],
        )
    if errors:
        print(f"check_version_sequence FAILED on {branch}:")
        for line in errors:
            print(f"  - {line}")
        return 1
    print(
        f"check_version_sequence OK on {branch}: "
        f"manifest {base_state['manifest']} -> {head_state['manifest']}"
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
