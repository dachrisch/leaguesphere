import datetime

from django.contrib.auth.models import User
from django.test import TestCase, override_settings
from django.urls import reverse

from gamedays.models import Gameday, League, Season
from liveticker.constants import LIVETICKER_V2_HOME


class TestLivetickerV2View(TestCase):
    @override_settings(LIVETICKER_V2_ENABLED=False)
    def test_v2_route_is_reachable_while_the_flag_is_off(self):
        response = self.client.get(reverse(LIVETICKER_V2_HOME))

        assert response.status_code == 200
        assert "liveticker/v2.html" in [
            template.name for template in response.templates
        ]
        assert 'lang="de"' in response.content.decode()

    @override_settings(LIVETICKER_V2_ENABLED=True)
    def test_v2_route_stays_reachable_with_the_flag_on(self):
        response = self.client.get(reverse(LIVETICKER_V2_HOME))

        assert response.status_code == 200

    def test_v2_page_renders_inside_the_site_chrome(self):
        response = self.client.get(reverse(LIVETICKER_V2_HOME))

        html = response.content.decode()
        # The navbar and the footer come from the shared includes, not from a
        # copy pasted into this template.
        assert 'class="site-header"' in html
        assert 'id="navbarToggle"' in html
        assert 'class="footer mt-auto py-3 bg-light border-top"' in html
        assert 'id="liveticker-v2-app"' in html
        # The bundle and its scoped stylesheet are still the v2 assets.
        assert "liveticker/v2/js/liveticker-v2.js" in html
        assert "liveticker/v2/js/liveticker-v2-style.css" in html

    def test_v2_page_ships_titles_and_social_metadata(self):
        response = self.client.get(reverse(LIVETICKER_V2_HOME))

        html = response.content.decode()
        assert "<title>LeagueSphere - Liveticker</title>" in html
        assert '<meta name="description" content="Live-Ergebnisse' in html
        assert '<meta property="og:title" content="Liveticker' in html
        assert '<meta property="og:description" content="Live-Ergebnisse' in html
        assert 'property="og:url"' in html

    def test_v2_page_description_names_the_requested_gameday(self):
        league = League.objects.create(name="Testliga", slug="testliga")
        season = Season.objects.create(name="2026")
        gameday = Gameday.objects.create(
            name="Spieltag am Waldrand",
            date=datetime.date(2026, 8, 15),
            start=datetime.time(9, 0),
            league=league,
            season=season,
            author=User.objects.create(username="ticker-author"),
        )

        response = self.client.get(
            reverse(LIVETICKER_V2_HOME),
            {"gameday": str(gameday.pk), "league": "testliga"},
        )

        html = response.content.decode()
        assert "Spieltag am Waldrand" in html
        assert "Live-Ergebnisse und Spielverlauf" in html

    def test_v2_page_does_not_leak_the_stream_flag_while_it_is_off(self):
        response = self.client.get(reverse(LIVETICKER_V2_HOME))

        html = response.content.decode()
        assert 'data-stream-enabled="false"' in html

    @override_settings(LIVETICKER_V2_ENABLED=True)
    def test_site_menu_links_to_the_v2_app_when_the_flag_is_on(self):
        html = self.client.get(reverse(LIVETICKER_V2_HOME)).content.decode()

        assert 'href="/liveticker/v2/"' in html
        assert "Liveticker" in html

    @override_settings(LIVETICKER_V2_ENABLED=False)
    def test_site_menu_links_to_the_legacy_app_when_the_flag_is_off(self):
        html = self.client.get(reverse(LIVETICKER_V2_HOME)).content.decode()

        assert 'href="/liveticker/"' in html
        assert "Liveticker" in html
