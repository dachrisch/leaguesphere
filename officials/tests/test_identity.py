"""Who is signed in as an official: one module owns the session key (scan B12)."""

from django.contrib.sessions.backends.db import SessionStore
from django.test import RequestFactory, TestCase

from officials.constants import MOODLE_LOGGED_IN_USER
from officials.identity import acting_official_id, sign_in_official, sign_out_official


def _request():
    request = RequestFactory().get("/")
    request.session = SessionStore()
    request.session.create()
    return request


class TestIdentity(TestCase):
    def test_nobody_is_signed_in_by_default(self):
        assert acting_official_id(_request()) is None

    def test_sign_in_stores_the_official_and_rotates_the_session(self):
        request = _request()
        before = request.session.session_key
        sign_in_official(request, 42)
        assert acting_official_id(request) == 42
        assert request.session[MOODLE_LOGGED_IN_USER] == 42
        assert request.session.session_key != before

    def test_sign_in_can_keep_the_session_key(self):
        request = _request()
        before = request.session.session_key
        sign_in_official(request, 7, rotate_session=False)
        assert acting_official_id(request) == 7
        assert request.session.session_key == before

    def test_sign_out_forgets_the_official(self):
        request = _request()
        sign_in_official(request, 42)
        sign_out_official(request)
        assert acting_official_id(request) is None
        sign_out_official(request)
        assert acting_official_id(request) is None
