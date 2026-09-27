"""Regression tests for container/healthcheck.sh (frontend / nginx image).

The frontend container probes ``http://localhost/login/`` from inside itself.
Stage and prod set ``SECURE_SSL_REDIRECT = True``, so a plain-HTTP request is
answered with a 301 to https://. The probe must advertise the scheme that the
TLS-terminating proxy (Traefik) would set, otherwise the 301 makes the container
unhealthy and the reverse proxy stops routing to it. That is exactly how the
4.32.0 release took stage offline.
"""

import http.server
import os
import shutil
import socketserver
import subprocess
import threading

import pytest

SCRIPT = os.path.join(
    os.path.dirname(__file__), "..", "..", "container", "healthcheck.sh"
)


class _AppHandler(http.server.BaseHTTPRequestHandler):
    """Mimics Django behind a TLS-terminating proxy with SECURE_SSL_REDIRECT."""

    def _secure(self):
        return self.headers.get("X-Forwarded-Proto") == "https"

    def _redirect(self):
        self.send_response(301)
        self.send_header("Location", "https://example.test" + self.path)
        self.end_headers()

    def do_GET(self):
        if not self._secure():
            self._redirect()
            return
        self.send_response(200)
        self.send_header("Set-Cookie", "csrftoken=mocktoken123; Path=/; Secure")
        self.end_headers()
        self.wfile.write(b"<html><form></form></html>")

    def do_POST(self):
        if not self._secure():
            self._redirect()
            return
        self.send_response(200)
        self.end_headers()

    def log_message(self, *args):
        pass


@pytest.fixture()
def mock_app():
    server = socketserver.TCPServer(("127.0.0.1", 0), _AppHandler)
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    try:
        yield f"http://127.0.0.1:{server.server_address[1]}/login/"
    finally:
        server.shutdown()
        server.server_close()


@pytest.mark.skipif(shutil.which("curl") is None, reason="curl not installed")
def test_healthcheck_passes_when_app_redirects_plain_http(mock_app):
    result = subprocess.run(
        ["sh", SCRIPT],
        env={**os.environ, "HEALTHCHECK_URL": mock_app},
        capture_output=True,
        text=True,
    )

    assert result.returncode == 0, result.stdout + result.stderr


CONTAINER_DIR = os.path.join(os.path.dirname(__file__), "..", "..", "container")


@pytest.mark.parametrize(
    "conf", ["nginx.conf", "nginx.demo.conf", "nginx.staging.conf"]
)
def test_login_rate_limit_exempts_local_healthcheck(conf):
    """The healthcheck polls /login/ from localhost; it must not consume the
    brute-force budget, otherwise the probe gets throttled (429) and the
    container is marked unhealthy once the nginx conf ships."""
    text = open(os.path.join(CONTAINER_DIR, conf)).read()

    assert "limit_req_zone $login_limit_key" in text
    assert '127.0.0.1 ""' in text
