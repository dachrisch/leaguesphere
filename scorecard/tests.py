from django.contrib.staticfiles import finders
from django.urls import reverse
from django_webtest import WebTest


class TestScorecardView(WebTest):
    def test_scorecard_is_rendered(self):
        response = self.app.get(reverse("scorecard-home"))
        assert "LeagueSphere - Scorecard" in response.text

    def test_scorecard_shows_favicon(self):
        """The scorecard must ship a favicon (404 console noise on every page,
        masks real errors during debugging — #1983)."""
        assert finders.find("scorecard/favicon.ico") is not None
        response = self.app.get(reverse("scorecard-home"))
        assert "/static/scorecard/favicon.ico" in response.text
