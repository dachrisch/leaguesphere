"""End-to-end tests for the equivalence runner and self-test.

A real in-process HTTP server (stdlib) stands in for a deployment: the tests
therefore exercise ``transport.py`` (basic auth, cookies, login), the probe
loop, the runner's report and exit code, and the ref-vs-ref noise floor.
"""

from __future__ import annotations

from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import itertools
import json
import sys
import threading
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import runner  # noqa: E402
import selftest  # noqa: E402
from transport import Session  # noqa: E402


class Handler(BaseHTTPRequestHandler):
    def do_GET(self):  # noqa: N802 (http.server API)
        self._handle("GET")

    def do_POST(self):  # noqa: N802 (http.server API)
        length = int(self.headers.get("Content-Length", "0"))
        self.rfile.read(length)
        self._handle("POST")

    def _handle(self, method):
        server = self.server
        server.requests.append((method, self.path))
        server.headers.append(dict(self.headers))
        if server.require_auth and not self.headers.get("Authorization"):
            self._respond(401, "auth required", "text/plain")
            return
        route = server.routes.get((method, self.path))
        if route is None:
            self._respond(404, "not found", "text/plain")
            return
        status, payload, content_type = route
        if status in (301, 302):
            self.send_response(status)
            self.send_header("Location", payload)
            self.send_header("Set-Cookie", "sessionid=test-session; Path=/")
            self.end_headers()
            return
        if callable(payload):
            payload = payload()
        if isinstance(payload, (dict, list)):
            payload = json.dumps(payload)
        self._respond(status, payload, content_type)

    def _respond(self, status, payload, content_type):
        body = payload.encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", content_type)
        if self.path == "/login/":
            # Django sets csrftoken on the login form render.
            self.send_header("Set-Cookie", "csrftoken=tok; Path=/")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, *args):  # silence the test output
        pass


@pytest.fixture()
def server_factory():
    servers = []

    def make(routes, require_auth=False):
        server = ThreadingHTTPServer(("127.0.0.1", 0), Handler)
        server.routes = routes
        server.require_auth = require_auth
        server.requests = []
        server.headers = []
        thread = threading.Thread(target=server.serve_forever, daemon=True)
        thread.start()
        servers.append(server)
        return server, f"http://127.0.0.1:{server.server_address[1]}"

    yield make
    for server in servers:
        server.shutdown()
        server.server_close()


LOGIN_FORM = '<form><input type="hidden" name="csrfmiddlewaretoken" value="tok"></form>'


def routes_for(sha, name="Cup"):
    return {
        ("GET", "/login/"): (200, LOGIN_FORM, "text/html"),
        ("POST", "/login/"): (302, "/", "text/plain"),
        ("GET", "/health/version/"): (200, {"sha": sha}, "application/json"),
        ("GET", "/api/gamedays/"): (
            200,
            {"results": [{"id": 1, "season": 2, "league": 3}]},
            "application/json",
        ),
        ("GET", "/"): (200, "<html>home</html>", "text/html"),
        ("GET", "/api/gameday/1/"): (
            200,
            {"id": 1, "name": name},
            "application/json",
        ),
        ("GET", "/staff/"): (200, "<html>staff</html>", "text/html"),
        ("POST", "/api/gamedays/"): (201, {"id": 7}, "application/json"),
    }


def write_manifest(tmp_path, with_staff=True):
    probes = [
        {"name": "root", "path": "/", "kind": "html", "role": "anonymous"},
        {
            "name": "gameday-api",
            "path": "/api/gameday/{gameday_id}/",
            "kind": "json",
            "role": "anonymous",
            "categories": ["any"],
        },
    ]
    roles = {"anonymous": {}}
    if with_staff:
        roles["staff"] = {
            "username_env": "LS_AGENT_STAFF_USER",
            "password_env": "LS_AGENT_STAFF_PASSWORD",
        }
        probes.append(
            {"name": "staff-page", "path": "/staff/", "kind": "html", "role": "staff"}
        )
    manifest = {
        "schema_version": 1,
        "roles": roles,
        "discovery": {"path": "/api/gamedays/", "results_key": "results"},
        "categories": [{"name": "any", "where": {}}],
        "sample_per_category": 1,
        "probes": probes,
    }
    path = tmp_path / "manifest.json"
    path.write_text(json.dumps(manifest), encoding="utf-8")
    return path


def test_runner_reports_zero_diffs_for_identical_sides(
    server_factory, tmp_path, monkeypatch
):
    monkeypatch.setenv("LS_AGENT_STAFF_USER", "agent_staff")
    monkeypatch.setenv("LS_AGENT_STAFF_PASSWORD", "secret")
    ref, ref_url = server_factory(routes_for("sha-ref"))
    cand, cand_url = server_factory(routes_for("sha-cand"))
    manifest = write_manifest(tmp_path)
    report = tmp_path / "report.md"

    exit_code = runner.main(
        [
            "--ref",
            ref_url,
            "--cand",
            cand_url,
            "--manifest",
            str(manifest),
            "--report",
            str(report),
            "--skip-scenarios",
        ]
    )

    assert exit_code == 0
    text = report.read_text()
    assert "sha-ref" in text and "sha-cand" in text
    assert "None." in text
    assert ("POST", "/login/") in ref.requests
    assert ("GET", "/staff/") in ref.requests


def test_runner_fails_on_a_real_difference(server_factory, tmp_path):
    ref, ref_url = server_factory(routes_for("sha-ref"))
    cand, cand_url = server_factory(routes_for("sha-cand", name="Cup 2"))
    manifest = write_manifest(tmp_path, with_staff=False)
    report = tmp_path / "report.md"

    exit_code = runner.main(
        [
            "--ref",
            ref_url,
            "--cand",
            cand_url,
            "--manifest",
            str(manifest),
            "--report",
            str(report),
            "--skip-scenarios",
        ]
    )

    assert exit_code == 1
    assert "$.name" in report.read_text()


def test_runner_honours_declared_intended_diffs(server_factory, tmp_path):
    ref, ref_url = server_factory(routes_for("sha-ref"))
    cand, cand_url = server_factory(routes_for("sha-cand", name="Cup 2"))
    manifest = write_manifest(tmp_path, with_staff=False)
    intended = tmp_path / "intended.json"
    intended.write_text(json.dumps({"gameday-api#any:1": ["$.name"]}), encoding="utf-8")

    exit_code = runner.main(
        [
            "--ref",
            ref_url,
            "--cand",
            cand_url,
            "--manifest",
            str(manifest),
            "--skip-scenarios",
            "--intended",
            str(intended),
        ]
    )

    assert exit_code == 0


def test_runner_reports_harness_errors_without_values(server_factory, tmp_path):
    ref, ref_url = server_factory(routes_for("sha-ref"))
    cand, cand_url = server_factory(routes_for("sha-cand"))
    manifest = write_manifest(tmp_path, with_staff=False)
    # A scenario context exists, so the runner attempts the write scenarios;
    # neither side implements them, which must be reported as a harness error
    # (not a crash and not a fake diff).
    report = tmp_path / "report.md"

    exit_code = runner.main(
        [
            "--ref",
            ref_url,
            "--cand",
            cand_url,
            "--manifest",
            str(manifest),
            "--report",
            str(report),
        ]
    )

    assert exit_code == 0
    assert "Harness errors" in report.read_text()


def test_runner_reports_a_probe_missing_on_one_side(
    server_factory, tmp_path, monkeypatch
):
    ref, ref_url = server_factory(routes_for("sha-ref"))
    cand, cand_url = server_factory(routes_for("sha-cand"))
    manifest = write_manifest(tmp_path, with_staff=False)
    report = tmp_path / "report.md"
    real = runner.probe_mod.run_probes
    calls = []

    def fake(sessions, manifest_def, probes):
        results, skipped = real(sessions, manifest_def, probes)
        calls.append(results)
        if len(calls) == 2:
            results = dict(results)
            results.pop(sorted(results)[0])
        return results, skipped

    monkeypatch.setattr(runner.probe_mod, "run_probes", fake)
    assert (
        runner.main(
            [
                "--ref",
                ref_url,
                "--cand",
                cand_url,
                "--manifest",
                str(manifest),
                "--report",
                str(report),
                "--skip-scenarios",
            ]
        )
        == 1
    )
    assert "missing" in report.read_text().lower()


def test_runner_honours_the_scenarios_filter(server_factory, tmp_path):
    ref, ref_url = server_factory(routes_for("sha-ref"))
    cand, cand_url = server_factory(routes_for("sha-cand"))
    manifest = write_manifest(tmp_path, with_staff=False)
    report = tmp_path / "report.md"

    assert (
        runner.main(
            [
                "--ref",
                ref_url,
                "--cand",
                cand_url,
                "--manifest",
                str(manifest),
                "--report",
                str(report),
                "--scenarios",
                "designer-publish",
            ]
        )
        == 0
    )
    text = report.read_text()
    assert "designer-publish" in text
    assert "finalize-game" not in text


def test_runner_reports_scenario_diffs(server_factory, tmp_path, monkeypatch):
    ref, ref_url = server_factory(routes_for("sha-ref"))
    cand, cand_url = server_factory(routes_for("sha-cand"))
    manifest = write_manifest(tmp_path, with_staff=False)
    report = tmp_path / "report.md"

    def fake_run(name, sessions, context, run_id):
        body = {"value": "ref" if run_id.endswith("ref") else "cand"}
        return runner.scenario_mod.ScenarioRun(
            name=name,
            run_id=run_id,
            steps=[runner.scenario_mod.StepResult(name="x", status=200, body=body)],
        )

    monkeypatch.setattr(runner.scenario_mod, "run_scenario", fake_run)
    assert (
        runner.main(
            [
                "--ref",
                ref_url,
                "--cand",
                cand_url,
                "--manifest",
                str(manifest),
                "--report",
                str(report),
            ]
        )
        == 1
    )
    assert "scenario" in report.read_text().lower()


def test_runner_posts_the_report_to_requested_prs(
    server_factory, tmp_path, monkeypatch
):
    ref, ref_url = server_factory(routes_for("sha-ref"))
    cand, cand_url = server_factory(routes_for("sha-cand"))
    manifest = write_manifest(tmp_path, with_staff=False)
    report = tmp_path / "report.md"
    posted = []

    def fake_run(args, **kwargs):
        posted.append(args)

    monkeypatch.setattr(runner.subprocess, "run", fake_run)
    runner.main(
        [
            "--ref",
            ref_url,
            "--cand",
            cand_url,
            "--manifest",
            str(manifest),
            "--report",
            str(report),
            "--skip-scenarios",
            "--comment-pr",
            "4242",
        ]
    )
    assert any("4242" in args for args in posted)


def test_basic_auth_is_required_by_the_transport(server_factory):
    server, url = server_factory(
        {("GET", "/"): (200, "ok", "text/plain")}, require_auth=True
    )

    anonymous = Session(url).request("/")
    authenticated = Session(url, username="user", password="pw").request("/")

    assert anonymous.status == 401
    assert authenticated.status == 200


def test_extract_csrf_token_finds_the_form_value():
    from transport import extract_csrf_token

    assert extract_csrf_token(LOGIN_FORM) == "tok"
    assert extract_csrf_token("<html>no form</html>") == ""


def test_selftest_passes_when_only_noise_changes(server_factory, tmp_path):
    counter = itertools.count()

    def noisy_payload():
        return {
            "id": 1,
            "name": "Cup",
            "updated_at": f"2026-11-25T10:00:0{next(counter)}Z",
        }

    routes = routes_for("sha-ref")
    routes[("GET", "/api/gameday/1/")] = (200, noisy_payload, "application/json")
    server, url = server_factory(routes)
    manifest = write_manifest(tmp_path, with_staff=False)

    assert selftest.main(["--url", url, "--manifest", str(manifest)]) == 0


def test_selftest_fails_when_a_real_field_changes(server_factory, tmp_path):
    counter = itertools.count()

    def changing_payload():
        return {"id": 1, "name": f"Cup {next(counter)}"}

    routes = routes_for("sha-ref")
    routes[("GET", "/api/gameday/1/")] = (200, changing_payload, "application/json")
    server, url = server_factory(routes)
    manifest = write_manifest(tmp_path, with_staff=False)

    assert selftest.main(["--url", url, "--manifest", str(manifest)]) == 1


def test_selftest_reports_skipped_roles_without_credentials(server_factory, tmp_path):
    server, url = server_factory(routes_for("sha-ref"))
    manifest = write_manifest(tmp_path, with_staff=True)

    assert selftest.main(["--url", url, "--manifest", str(manifest)]) == 0


def test_unsafe_requests_carry_the_csrf_cookie_and_referer(server_factory):
    server, url = server_factory(routes_for("sha-ref"))
    session = Session(url)
    session.login("agent_staff", "secret")

    response = session.request("/api/gamedays/", method="POST", json_body={"name": "x"})

    assert response.status == 201
    sent = {key.lower(): value for key, value in server.headers[-1].items()}
    assert sent["x-csrftoken"] == "tok"
    # The proxy rewrites Host to localhost, so the Referer host must match it.
    assert sent["referer"] == "https://localhost/api/gamedays/"
    assert "origin" not in sent
