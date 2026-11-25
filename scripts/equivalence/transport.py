"""HTTP transport for the equivalence harness (dachrisch/leaguesphere#2536).

Both deployments sit behind one basic-auth proxy, so every request carries
the long-lived credential from the infra git-crypt secret. The transport
keeps a cookie jar per session: role probes log in through the normal
Django login form, exactly as a browser does.

Stdlib only (``urllib``), so the runner needs no project dependencies.
"""

from __future__ import annotations

import base64
from dataclasses import dataclass, field
import json as jsonlib
import urllib.error
import urllib.parse
import urllib.request
from http.cookiejar import CookieJar


@dataclass
class Response:
    status: int
    headers: dict
    body: str
    url: str = ""
    method: str = "GET"

    def json(self):
        return jsonlib.loads(self.body)


@dataclass
class Session:
    """One HTTP session (cookie jar) against one deployment base URL."""

    base_url: str
    username: str = ""
    password: str = ""
    timeout: int = 60
    headers: dict = field(default_factory=dict)
    _cookies: CookieJar = field(default_factory=CookieJar, repr=False)
    _opener: urllib.request.OpenerDirector = field(init=False, repr=False)

    def __post_init__(self):
        self.base_url = self.base_url.rstrip("/")
        self._opener = urllib.request.build_opener(
            urllib.request.HTTPCookieProcessor(self._cookies)
        )

    def _url(self, path):
        if path.startswith("http://") or path.startswith("https://"):
            return path
        return f"{self.base_url}{path if path.startswith('/') else '/' + path}"

    def _authorization(self):
        if not self.username:
            return None
        raw = f"{self.username}:{self.password}".encode("utf-8")
        return "Basic " + base64.b64encode(raw).decode("ascii")

    def request(self, path, method="GET", json_body=None, form=None, headers=None):
        data = None
        request_headers = {"Accept": "application/json, text/html;q=0.9"}
        request_headers.update(self.headers)
        if headers:
            request_headers.update(headers)
        authorization = self._authorization()
        if authorization:
            request_headers["Authorization"] = authorization

        if json_body is not None:
            data = jsonlib.dumps(json_body).encode("utf-8")
            request_headers["Content-Type"] = "application/json"
        elif form is not None:
            data = urllib.parse.urlencode(form).encode("utf-8")
            request_headers["Content-Type"] = "application/x-www-form-urlencoded"

        request = urllib.request.Request(
            self._url(path), data=data, headers=request_headers, method=method
        )
        try:
            with self._opener.open(request, timeout=self.timeout) as response:
                return Response(
                    status=response.status,
                    headers=dict(response.headers),
                    body=response.read().decode("utf-8", errors="replace"),
                    url=response.geturl(),
                    method=method,
                )
        except urllib.error.HTTPError as error:
            return Response(
                status=error.code,
                headers=dict(error.headers or {}),
                body=error.read().decode("utf-8", errors="replace"),
                url=error.geturl(),
                method=method,
            )

    def login(self, username, password):
        """Log in through Django's login form, reusing this cookie jar."""
        page = self.request("/login/")
        token = extract_csrf_token(page.body)
        form = {"username": username, "password": password}
        if token:
            form["csrfmiddlewaretoken"] = token
        return self.request(
            "/login/",
            method="POST",
            form=form,
            headers={"Referer": self._url("/login/")},
        )


CSRF_MARKER = 'name="csrfmiddlewaretoken" value="'


def extract_csrf_token(html):
    """Return the CSRF token rendered into a Django form, or ``""``."""
    marker = html.find(CSRF_MARKER)
    if marker == -1:
        return ""
    start = marker + len(CSRF_MARKER)
    end = html.find('"', start)
    return html[start:end] if end != -1 else ""


class RecordedSession:
    """In-memory session for tests: maps ``(method, path)`` to a response."""

    def __init__(self, responses):
        self.responses = responses
        self.requests = []

    def request(self, path, method="GET", json_body=None, form=None, headers=None):
        self.requests.append(
            {"path": path, "method": method, "json": json_body, "form": form}
        )
        key = (method, path)
        if key not in self.responses:
            raise AssertionError(f"unexpected request {method} {path}")
        status, body = self.responses[key]
        if isinstance(body, (dict, list)):
            body = jsonlib.dumps(body)
        return Response(status=status, headers={}, body=body, url=path, method=method)


def build_sessions(base_url, username, password, manifest, errors):
    """Create one session per role that has credentials in the environment.

    ``anonymous`` always exists; other roles are skipped (never faked) when
    their harness credentials are not supplied.
    """
    import os

    sessions = {}
    for role, config in manifest.get("roles", {}).items():
        session = Session(base_url, username=username, password=password)
        if role == "anonymous":
            sessions[role] = session
            continue
        user = os.environ.get(config.get("username_env", ""), "")
        secret = os.environ.get(config.get("password_env", ""), "")
        if not user or not secret:
            continue
        response = session.login(user, secret)
        if response.status >= 400 or "/login/" in response.url:
            errors.append(f"login failed for role `{role}` (HTTP {response.status})")
            continue
        sessions[role] = session
    return sessions
