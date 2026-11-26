"""Characterize every branch of the harness transport's request builder."""

from __future__ import annotations

import sys
from http.cookiejar import Cookie
from pathlib import Path
import urllib.error

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import transport  # noqa: E402


class FakeResponse:
    status = 200
    headers = {"ETag": '"x"'}

    def read(self):
        return b'{"ok": true}'

    def geturl(self):
        return "https://stage.example/path"

    def __enter__(self):
        return self

    def __exit__(self, *args):
        return False


class FakeOpener:
    def __init__(self, error=None):
        self.requests = []
        self.error = error

    def open(self, request, timeout=None):
        self.requests.append(request)
        if self.error is not None:
            raise self.error
        return FakeResponse()


def make_session(**kwargs):
    session = transport.Session("https://stage.example/", **kwargs)
    session._opener = FakeOpener()
    return session


def test_get_has_no_body_no_auth_and_no_extra_headers():
    session = make_session()
    result = session.request("path")
    request = session._opener.requests[0]
    assert result.body == '{"ok": true}'
    assert request.data is None
    assert request.get_header("Authorization") is None
    assert session._url("https://other.example/x") == "https://other.example/x"


def test_headers_authorization_and_csrf_are_sent_only_where_needed():
    session = make_session(username="user", password="pw", headers={"Accept": "x"})
    session._cookies.set_cookie(
        Cookie(
            0,
            "csrftoken",
            "tok",
            None,
            False,
            "stage.example",
            False,
            False,
            "/",
            True,
            False,
            None,
            False,
            None,
            None,
            {},
        )
    )
    session.request("/api/x", method="post")
    request = session._opener.requests[0]
    assert request.get_header("Authorization").startswith("Basic ")
    assert request.get_header("X-csrftoken") == "tok"
    assert request.get_header("Referer") == "https://localhost/api/x"
    session.request("/api/x", headers={"X-Extra": "1"})
    assert session._opener.requests[1].get_header("X-extra") == "1"


def test_json_and_form_bodies_are_encoded():
    session = make_session()
    session.request("/api/x", method="POST", json_body={"a": 1})
    assert session._opener.requests[0].data == b'{"a": 1}'
    session.request("/api/x", method="PUT", form={"a": "1"})
    assert session._opener.requests[1].data == b"a=1"


def test_multipart_body_keeps_form_fields_and_both_content_types():
    session = make_session()
    files = {
        "file": (
            "import.csv",
            b"a,b\n1,2\n",
            "text/csv",
        ),
        "note": ("note.txt", "text", "text/plain"),
    }
    session.request("/api/import", method="POST", form={"k": "v"}, files=files)
    request = session._opener.requests[0]
    assert (
        b"multipart/form-data; boundary="
        in (request.get_header("Content-type") or "").encode()
    )
    assert b'name="k"' in request.data
    assert b'name="note"' in request.data
    assert b"text" in request.data
    # No form fields: the `(form or {})` loop is skipped but the file is sent.
    session.request(
        "/api/import", method="POST", files={"f": ("f.csv", b"x", "text/csv")}
    )
    assert b'name="f"' in session._opener.requests[1].data


def test_http_errors_are_returned_as_responses():
    session = make_session()
    session._opener.error = urllib.error.HTTPError(
        "https://stage.example/api/x", 409, "conflict", {}, None
    )
    result = session.request("/api/x")
    assert result.status == 409


def test_recorded_session_accepts_the_new_multipart_call():
    recorded = transport.RecordedSession({("POST", "/api/x"): (200, '{"ok": true}')})
    result = recorded.request(
        "/api/x", method="POST", files={"f": ("f.csv", b"x", "text/csv")}
    )
    assert result.status == 200
    assert recorded.requests[0]["files"] is not None
