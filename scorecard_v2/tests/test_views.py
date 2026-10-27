import league_manager
from django.contrib.auth.models import User
from django.urls import resolve, reverse
from django_webtest import WebTest


class TestScorecardV2View(WebTest):
    def test_anonymous_visitor_is_redirected_to_login(self):
        response = self.app.get(reverse("scorecard-v2-home"), status=302)
        assert response.location == (
            f"{reverse('login')}?next={reverse('scorecard-v2-home')}"
        )

    def test_logged_in_user_sees_the_app_shell(self):
        user = User.objects.create_user("official", password="x")
        self.app.set_user(user)
        self.app.get(reverse("scorecard-v2-home"))
        for cookie in list(self.app.cookiejar):
            if cookie.name == "csrftoken":
                self.app.cookiejar.clear(cookie.domain, cookie.path, cookie.name)

        response = self.app.get(reverse("scorecard-v2-home"))
        assert 'id="scorecard-v2-app"' in response.text
        assert "/static/scorecard_v2/js/scorecard_v2.js" in response.text
        assert "/static/scorecard_v2/js/scorecard_v2.css" in response.text
        assert "csrftoken" in response.client.cookies

    def test_old_scorecard_route_is_untouched(self):
        assert reverse("scorecard-home") == "/scorecard/"
        assert reverse("scorecard-v2-home") == "/scorecard/v2/"
        assert resolve("/scorecard/").func.view_class.__name__ == "ScorecardView"

    def test_page_carries_the_version_for_the_footer(self):
        user = User.objects.create_user("official", password="x")
        self.app.set_user(user)
        response = self.app.get(reverse("scorecard-v2-home"))

        assert (
            f'<meta content="{league_manager.__version__}" name="app-version"/>'
            in response.text
        )
