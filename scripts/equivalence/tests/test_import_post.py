"""The officials import POST scenario witnesses parse and confirm branches."""

from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import scenarios  # noqa: E402
from runner import compare_scenario_runs  # noqa: E402
from transport import Response  # noqa: E402


def test_import_post_scenario_has_parse_and_confirm_steps():
    names = [step.name for step in scenarios.SCENARIOS["officials-import-post"]]
    assert "discover-team" in names
    assert "discover-official" in names
    assert "upload-get" in names
    assert "upload-post" in names
    assert "confirm-post" in names
    upload = next(
        step
        for step in scenarios.SCENARIOS["officials-import-post"]
        if step.name == "upload-post"
    )
    assert upload.method == "POST"
    assert "file" in upload.files


def test_device_scenario_witnesses_the_moved_endpoints():
    steps = scenarios.SCENARIOS["device-lock-halftime-finalize"]
    by_name = {step.name: step for step in steps}
    conflict = by_name["device-conflict-put"]
    assert conflict.headers == {"X-Scorecard-Device": "other-device"}
    # Only the header disagrees with the stored lock holder.
    assert conflict.json["device_id"] == by_name["start-game"].json["device_id"]
    assert by_name["halftime-put"].path.endswith("/halftime")
    assert by_name["finalize-put"].path.endswith("/finalize")
    assert by_name["device-release"].method == "DELETE"


def test_import_post_scenario_is_stable_across_both_sides():
    class Session:
        def __init__(self, side):
            self.side = side

        def request(
            self,
            path,
            method="GET",
            json_body=None,
            form=None,
            files=None,
            headers=None,
            follow_redirects=True,
        ):
            if method == "GET" and path == "/api/teams/":
                return Response(200, {}, '{"results":[{"id":1}]}', path, method)
            if method == "GET" and path == "/api/officials/team/1/list":
                return Response(200, {}, '[{"id":4711}]', path, method)
            if method == "GET" and path.endswith("/upload/"):
                return Response(200, {}, "<form></form>", path, method)
            if method == "POST" and path.endswith("/upload/"):
                assert files is not None
                return Response(
                    200,
                    {},
                    '{"external":{"new":[],"duplicate":[],"conflict":[]},'
                    '"internal_fix":{"new":[{"row_number":7}],'
                    '"duplicate":[],"conflict":[]},"unclassified":[]}',
                    path,
                    method,
                )
            if method == "POST" and path.endswith("/confirm/"):
                assert form == {"internal_rows": "7"}
                return Response(
                    302, {}, "", "/officials/gameofficial/import/upload/", method
                )
            raise AssertionError(f"unexpected {method} {path}")

    sessions = {"staff": Session("side")}
    left = scenarios.run_scenario("officials-import-post", sessions, {}, "import-ref")
    right = scenarios.run_scenario("officials-import-post", sessions, {}, "import-cand")
    assert compare_scenario_runs(left, right) == {}
    assert left.skipped == right.skipped == []


def test_string_file_contents_are_resolved_before_the_request():
    step = scenarios.Step(
        name="string-file",
        method="POST",
        path="/officials/gameofficial/import/upload/",
        files={"file": ("import.csv", "value={run_id}", "text/csv")},
    )
    seen = {}

    class Session:
        def request(
            self,
            path,
            method="GET",
            json_body=None,
            form=None,
            files=None,
            headers=None,
            follow_redirects=True,
        ):
            seen["files"] = files
            return type(
                "R",
                (),
                {
                    "status": 200,
                    "body": "{}",
                    "url": path,
                    "method": method,
                    "headers": {},
                    "json": lambda self: {},
                },
            )()

    scenarios.SCENARIOS["string-file"] = [step]
    try:
        scenarios.run_scenario("string-file", {"staff": Session()}, {}, "sf")
    finally:
        del scenarios.SCENARIOS["string-file"]
    assert seen["files"]["file"][1] == "value=sf"


def test_capture_many_extracts_several_ids_and_tolerates_missing_paths():
    step = scenarios.Step(
        name="many",
        method="GET",
        path="/api/game/{game_id}/summary",
        capture_many={
            "home": "game.id_home",
            "away": "game.id_away",
            "missing": "game.no_such_field",
        },
    )
    seen = {}

    class Session:
        def request(
            self,
            path,
            method="GET",
            json_body=None,
            form=None,
            files=None,
            headers=None,
            follow_redirects=True,
        ):
            return type(
                "R",
                (),
                {
                    "status": 200,
                    "body": '{"game":{"id_home":"11","id_away":"12"}}',
                    "url": path,
                    "method": method,
                    "headers": {},
                    "json": lambda self: {"game": {"id_home": "11", "id_away": "12"}},
                },
            )()

    scenarios.SCENARIOS["capture-many"] = [step]
    try:
        run = scenarios.run_scenario("capture-many", {"staff": Session()}, {}, "cm")
    finally:
        del scenarios.SCENARIOS["capture-many"]
    assert run.steps
