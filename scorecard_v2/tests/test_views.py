from django.contrib.auth.models import User
from django.urls import reverse
from django_webtest import WebTest


class TestScorecardV2View(WebTest):
    def test_anonymous_visitor_is_redirected_to_login(self):
        response = self.app.get(reverse("scorecard-v2-home"), status=302)
        assert "/login/" in response.location

    def test_logged_in_user_sees_the_app_shell(self):
        user = User.objects.create_user("official", password="x")
        response = self.app.get(reverse("scorecard-v2-home"), user=user)
        assert 'id="scorecard-v2-app"' in response.text
        assert "/static/scorecard_v2/js/scorecard_v2.js" in response.text
        # Session auth + CSRF: the cookie, not a <meta> tag, carries the token.
        assert "csrftoken" in response.client.cookies

    def test_old_scorecard_route_is_untouched(self):
        assert reverse("scorecard-home") == "/scorecard/"
