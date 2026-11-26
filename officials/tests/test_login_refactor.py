"""Regression tests for the canonical Moodle login route and page.

The login used to live at ``/officials/gameday/sign-up/login/``; it is now the
shorter ``/officials/login/`` while the old path stays as a query-preserving
redirect. The page links out to the Moodle password-reset flow and in-app to
Scorecard v2.
"""

from http import HTTPStatus
from urllib.parse import parse_qs, urlsplit

from django.contrib.auth.models import AnonymousUser
from django.test import Client, RequestFactory, TestCase
from django.urls import reverse

from officials.selfservice import login_url_for

MOODLE_LOGIN = "view-officials-moodle-login"
CANONICAL_PATH = "/officials/login/"
LEGACY_PATH = "/officials/gameday/sign-up/login/"


class TestCanonicalLoginPath(TestCase):
    def test_named_url_is_the_short_canonical_path(self):
        assert reverse(MOODLE_LOGIN) == CANONICAL_PATH

    def test_canonical_path_renders_the_login_page(self):
        response = Client().get(CANONICAL_PATH)

        assert response.status_code == HTTPStatus.OK
        assert b"AFVD Flag Academy Login" in response.content


class TestLegacyLoginRedirect(TestCase):
    def test_old_path_redirects_to_canonical_path(self):
        response = Client().get(LEGACY_PATH)

        assert response.status_code == HTTPStatus.FOUND
        assert response.url == CANONICAL_PATH

    def test_old_path_keeps_next_query_string_on_redirect(self):
        response = Client().get(LEGACY_PATH, {"next": "/officials/einsaetze/"})

        assert response.status_code == HTTPStatus.FOUND
        parts = urlsplit(response.url)
        assert parts.path == CANONICAL_PATH
        assert parse_qs(parts.query) == {"next": ["/officials/einsaetze/"]}


class TestLoginUrlFor(TestCase):
    def test_login_url_for_points_at_canonical_path_with_next(self):
        request = RequestFactory().get("/officials/einsaetze/")
        request.user = AnonymousUser()

        url = login_url_for(request)

        parts = urlsplit(url)
        assert parts.path == CANONICAL_PATH
        assert parse_qs(parts.query) == {"next": ["/officials/einsaetze/"]}


class TestLoginPageContent(TestCase):
    def setUp(self):
        self.html = Client().get(reverse(MOODLE_LOGIN)).content.decode()

    def test_forgot_password_link_points_at_moodle_with_safe_target(self):
        assert 'href="https://offd.de/login/forgot_password.php"' in self.html
        assert 'target="_blank"' in self.html
        assert 'rel="noopener noreferrer"' in self.html
        assert "Passwort vergessen?" in self.html

    def test_forgot_password_link_explains_that_leaguesphere_is_left(self):
        assert "Du verlässt LeagueSphere" in self.html
        assert "Flag Academy" in self.html

    def test_submit_button_is_primary_and_full_width(self):
        assert 'class="btn btn-primary w-100"' in self.html
        assert "btn btn-outline-info" not in self.html

    def test_scorecard_v2_link_is_rendered_in_warning_alert(self):
        assert "alert alert-warning" in self.html
        assert f'href="{reverse("scorecard-v2-home")}"' in self.html
        assert "Scorecard / Passcheck" in self.html
        assert "gehe hier" in self.html
