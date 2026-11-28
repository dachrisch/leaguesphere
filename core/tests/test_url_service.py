from django.test import SimpleTestCase, override_settings

from core.url_service import UrlService


class TestUrlService(SimpleTestCase):
    @override_settings(SITEMAP_DOMAIN="leaguesphere.app")
    def test_public_domain_uses_https(self):
        url = UrlService.build_absolute_url("league-gameday-list")
        assert url.startswith("https://leaguesphere.app/")

    @override_settings(SITEMAP_DOMAIN="localhost:8000")
    def test_localhost_uses_http(self):
        url = UrlService.build_absolute_url("league-gameday-list")
        assert url.startswith("http://localhost:8000/")
