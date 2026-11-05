import league_manager
from pathlib import Path

from django.contrib.auth.models import User
from django.contrib.staticfiles import finders
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

    def test_a_gameday_and_a_game_path_serve_the_same_shell(self):
        user = User.objects.create_user("official", password="x")
        self.app.set_user(user)

        for path in (
            "/scorecard/v2/gameday/7/",
            "/scorecard/v2/gameday/7/game/42/",
            "/scorecard/v2/spiel/42/",
        ):
            response = self.app.get(path)
            assert 'id="scorecard-v2-app"' in response.text, path

        assert reverse("scorecard-v2-gameday", kwargs={"gameday_pk": 7}) == (
            "/scorecard/v2/gameday/7/"
        )
        assert (
            reverse("scorecard-v2-gameday-game", kwargs={"gameday_pk": 7, "pk": 42})
            == "/scorecard/v2/gameday/7/game/42/"
        )
        assert reverse("scorecard-v2-game", kwargs={"pk": 42}) == (
            "/scorecard/v2/spiel/42/"
        )

    def test_a_game_path_redirects_an_anonymous_visitor(self):
        response = self.app.get("/scorecard/v2/gameday/7/game/42/", status=302)

        assert response.location.startswith(f"{reverse('login')}?next=")

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

    def test_page_and_offline_shell_carry_the_league_favicon(self):
        user = User.objects.create_user("official", password="x")
        self.app.set_user(user)
        response = self.app.get(reverse("scorecard-v2-home"))

        assert "/static/league_manager/favicon.svg" in response.text
        assert finders.find("league_manager/favicon.svg") is not None
        assert finders.find("league_manager/favicon.ico") is not None
        shell = (
            Path(__file__).resolve().parent.parent
            / "static"
            / "scorecard_v2"
            / "app-shell.html"
        ).read_text()
        assert "/static/league_manager/favicon.svg" in shell
