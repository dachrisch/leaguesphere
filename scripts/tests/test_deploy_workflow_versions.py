"""Guard the deploy workflow's version-file lists.

A staging demo tags the branch; CircleCI resolves a tag pipeline to the **full
matrix** and fails a job that the diff scoped out ("A release must run the full
matrix"). The bump touches one version file per app, so an app missing from
`deploy.yaml` keeps its old version, is scoped out of the tag, and the release
never reaches `deploy_staging`. That is exactly how `share` blocked the
2026-11-11 staging deploy.

`check_version_sequence.VERSION_FILES` is the repo's list of version files;
both workflows that rewrite them must cover every entry.
"""

import importlib.util
import os
import re

WORKFLOWS = os.path.join(os.path.dirname(__file__), "..", "..", ".github", "workflows")
VERSION_SEQUENCE = os.path.join(
    os.path.dirname(__file__), "..", "check_version_sequence.py"
)


def load_version_files():
    spec = importlib.util.spec_from_file_location(
        "check_version_sequence", VERSION_SEQUENCE
    )
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module.VERSION_FILES


def read_workflow(name):
    with open(os.path.join(WORKFLOWS, name), encoding="utf-8") as handle:
        return handle.read()


def staged_paths(text):
    """The file list of the workflow's single ``git add`` command."""

    match = re.search(r"git add (.*?)(?:\n\n|\Z)", text, re.S)
    assert match is not None, "the workflow has no git add command"
    return [
        path.strip(" \\\n")
        for path in re.split(r"[ \n]+", match.group(1))
        if path.strip(" \\\n")
    ]


def test_deploy_workflow_bumps_and_stages_every_version_file():
    text = read_workflow("deploy.yaml")
    version_files = load_version_files()

    loop = re.search(r"for pkg in ([^;]+); do", text)
    assert loop is not None, "deploy.yaml has no package bump loop"
    packages = loop.group(1).split()
    for path, kind in version_files.items():
        if kind == "package-json":
            assert path.split("/")[0] in packages, f"{path} is not bumped"

    staged = staged_paths(text)
    for path in version_files:
        assert path in staged, f"{path} is never staged"


def test_release_finalize_bumps_and_stages_every_app():
    text = read_workflow("release-please-finalize.yaml")
    version_files = load_version_files()

    bump = text.split("Update version in all version files", 1)[1].split(
        "Commit version and lock file updates", 1
    )[0]
    staged = staged_paths(text)
    for path, kind in version_files.items():
        if kind in ("package-json", "init"):
            # The workflow names the file in its own `sed -i` line and stages it.
            assert path in bump, f"{path} is not bumped"
            assert path in staged, f"{path} is never staged"
        elif kind == "uv-lock":
            assert path in staged, f"{path} is never staged"
        # pyproject.toml is release-please's own version source: this workflow
        # only reads it and does not stage it.
