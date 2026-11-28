"""Auth API: the Knox token issuer every frontend relies on."""

from django.contrib.auth.models import User
from django.test import TestCase
from django.urls import reverse
from knox.models import AuthToken
from rest_framework.test import APIClient

PASSWORD = "Correct-Horse-Battery-9"


class AuthApiTestCase(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.user = User.objects.create_user("member", "member@example.org", PASSWORD)


class TestLogin(AuthApiTestCase):
    def test_login_returns_user_and_token(self):
        response = self.client.post(
            reverse("accounts-login"),
            {"username": "member", "password": PASSWORD},
            format="json",
        )
        assert response.status_code == 200
        assert response.data["user"]["username"] == "member"
        assert response.data["token"]
        assert AuthToken.objects.filter(user=self.user).count() == 1

    def test_login_rejects_wrong_password(self):
        response = self.client.post(
            reverse("accounts-login"),
            {"username": "member", "password": "wrong"},
            format="json",
        )
        assert response.status_code == 400
        assert AuthToken.objects.count() == 0

    def test_login_rejects_inactive_user(self):
        self.user.is_active = False
        self.user.save()
        response = self.client.post(
            reverse("accounts-login"),
            {"username": "member", "password": PASSWORD},
            format="json",
        )
        assert response.status_code == 400


class TestUserAndLogout(AuthApiTestCase):
    def _token(self):
        return AuthToken.objects.create(self.user)[1]

    def test_user_endpoint_needs_a_token(self):
        assert self.client.get(reverse("accounts-user")).status_code == 401

    def test_user_endpoint_returns_the_token_owner(self):
        self.client.credentials(HTTP_AUTHORIZATION=f"Token {self._token()}")
        with self.assertNumQueries(2):
            response = self.client.get(reverse("accounts-user"))
        assert response.status_code == 200
        assert response.data == {
            "id": self.user.id,
            "username": "member",
            "email": "member@example.org",
        }

    def test_logout_revokes_the_token(self):
        self.client.credentials(HTTP_AUTHORIZATION=f"Token {self._token()}")
        assert self.client.post(reverse("accounts-logout")).status_code == 204
        assert AuthToken.objects.count() == 0
        assert self.client.get(reverse("accounts-user")).status_code == 401


class TestRegister(AuthApiTestCase):
    """Registration is staff-only (architecture scan B9).

    It used to inherit IsAuthenticatedOrReadOnly, so any logged-in user could
    create accounts, and no password validation ran.
    """

    payload = {"username": "newbie", "email": "new@example.org", "password": PASSWORD}

    def test_anonymous_cannot_register(self):
        response = self.client.post(
            reverse("accounts-register"), self.payload, format="json"
        )
        assert response.status_code == 401
        assert not User.objects.filter(username="newbie").exists()

    def test_regular_user_cannot_register_others(self):
        self.client.force_authenticate(self.user)
        response = self.client.post(
            reverse("accounts-register"), self.payload, format="json"
        )
        assert response.status_code == 403
        assert not User.objects.filter(username="newbie").exists()

    def test_staff_registers_a_user_and_gets_a_token(self):
        staff = User.objects.create_user("staff", "s@example.org", PASSWORD)
        staff.is_staff = True
        staff.save()
        self.client.force_authenticate(staff)
        response = self.client.post(
            reverse("accounts-register"), self.payload, format="json"
        )
        assert response.status_code == 200
        created = User.objects.get(username="newbie")
        assert created.check_password(PASSWORD)
        assert not created.is_staff
        assert response.data["user"]["username"] == "newbie"
        assert response.data["token"]

    def test_weak_password_is_rejected(self):
        staff = User.objects.create_user("staff", "s@example.org", PASSWORD)
        staff.is_staff = True
        staff.save()
        self.client.force_authenticate(staff)
        response = self.client.post(
            reverse("accounts-register"),
            {**self.payload, "password": "123"},
            format="json",
        )
        assert response.status_code == 400
        assert "password" in response.data
        assert not User.objects.filter(username="newbie").exists()
