"""
Tests for AI-agent readiness files (llms.txt, security.txt) and the
extended robots.txt crawler policy.

Following TDD principles - these tests define the expected behavior
before implementation.
"""

from django.test import TestCase, Client
from django.test.client import RequestFactory

from league_manager.middleware.db_guard import DatabaseGuardMiddleware
from league_manager.middleware.maintenance import MaintenanceModeMiddleware


class TestRobotsTxtAiCrawlerPolicy(TestCase):
    """Test robots.txt declares an AI crawler policy."""

    def setUp(self):
        self.client = Client()

    @property
    def response(self):
        return self.client.get("/robots.txt")

    def test_training_bots_are_disallowed(self):
        """Training-only AI crawlers are blocked (citation without training)."""
        for bot in ["GPTBot", "ClaudeBot", "CCBot", "Google-Extended", "Bytespider"]:
            self.assertContains(self.response, f"User-agent: {bot}")

    def test_retrieval_bots_are_allowed(self):
        """Search/retrieval AI crawlers are explicitly allowed."""
        for bot in [
            "OAI-SearchBot",
            "ChatGPT-User",
            "Claude-SearchBot",
            "Claude-User",
            "PerplexityBot",
            "Perplexity-User",
            "Amazonbot",
            "anthropic-ai",
        ]:
            self.assertContains(self.response, f"User-agent: {bot}")

    def test_search_engines_still_allowed(self):
        """Standard search engines remain crawlable."""
        for bot in ["Googlebot", "Bingbot"]:
            self.assertContains(self.response, f"User-agent: {bot}")

    def test_write_patterns_still_disallowed(self):
        """Write-operation disallows survive the rewrite."""
        response = self.response
        self.assertContains(response, "Disallow: /*/create/")
        self.assertContains(response, "Disallow: /*/delete/")

    def test_sitemap_directive_present(self):
        self.assertContains(self.response, "Sitemap: https://leaguesphere.app/sitemap.xml")

    def test_ai_files_referenced(self):
        """Agents are pointed to the llms.txt files from robots.txt."""
        response = self.response
        self.assertContains(response, "/llms.txt")
        self.assertContains(response, "/llms-full.txt")


class TestLlmsTxtEndpoint(TestCase):
    """Test /llms.txt endpoint follows the llmstxt.org convention."""

    def setUp(self):
        self.client = Client()

    def test_llms_txt_is_accessible(self):
        response = self.client.get("/llms.txt")
        self.assertEqual(response.status_code, 200)

    def test_llms_txt_returns_text_content_type(self):
        response = self.client.get("/llms.txt")
        self.assertEqual(response["Content-Type"], "text/plain")

    def test_llms_txt_starts_with_h1_site_name(self):
        response = self.client.get("/llms.txt")
        self.assertContains(response, "# LeagueSphere")

    def test_llms_txt_has_one_line_description_blockquote(self):
        response = self.client.get("/llms.txt")
        self.assertContains(response, "> LeagueSphere")

    def test_llms_txt_links_leaguetable(self):
        response = self.client.get("/llms.txt")
        self.assertContains(response, "/leaguetable/")

    def test_llms_txt_links_liveticker(self):
        response = self.client.get("/llms.txt")
        self.assertContains(response, "/liveticker/")

    def test_llms_txt_links_gamedays(self):
        response = self.client.get("/llms.txt")
        self.assertContains(response, "/gamedays/")

    def test_llms_txt_documents_api_endpoints(self):
        response = self.client.get("/llms.txt")
        self.assertContains(response, "/api/liveticker/")

    def test_llms_txt_notes_german_content(self):
        """Agents should know the site content language."""
        response = self.client.get("/llms.txt")
        self.assertContains(response, "German")


class TestLlmsFullTxtEndpoint(TestCase):
    """Test /llms-full.txt companion file."""

    def setUp(self):
        self.client = Client()

    def test_llms_full_txt_is_accessible(self):
        response = self.client.get("/llms-full.txt")
        self.assertEqual(response.status_code, 200)

    def test_llms_full_txt_returns_text_content_type(self):
        response = self.client.get("/llms-full.txt")
        self.assertEqual(response["Content-Type"], "text/plain")

    def test_llms_full_txt_contains_more_detail_than_llms_txt(self):
        llms = self.client.get("/llms.txt").content
        llms_full = self.client.get("/llms-full.txt").content
        self.assertGreater(len(llms_full), len(llms))


class TestSecurityTxtEndpoint(TestCase):
    """Test /.well-known/security.txt is RFC 9116 compliant."""

    def setUp(self):
        self.client = Client()

    def test_security_txt_is_accessible(self):
        response = self.client.get("/.well-known/security.txt")
        self.assertEqual(response.status_code, 200)

    def test_security_txt_returns_text_content_type(self):
        response = self.client.get("/.well-known/security.txt")
        self.assertEqual(response["Content-Type"], "text/plain")

    def test_security_txt_has_contact_field(self):
        response = self.client.get("/.well-known/security.txt")
        self.assertContains(response, "Contact: ")

    def test_security_txt_has_expires_field(self):
        response = self.client.get("/.well-known/security.txt")
        self.assertContains(response, "Expires: ")

    def test_security_txt_has_canonical_field(self):
        response = self.client.get("/.well-known/security.txt")
        self.assertContains(
            response, "Canonical: https://leaguesphere.app/.well-known/security.txt"
        )

    def test_security_txt_has_preferred_languages(self):
        response = self.client.get("/.well-known/security.txt")
        self.assertContains(response, "Preferred-Languages: ")


class TestMaintenanceModeExemptions(TestCase):
    """AI/SEO files must stay reachable during full maintenance mode."""

    def setUp(self):
        self.factory = RequestFactory()
        self.middleware = MaintenanceModeMiddleware(lambda request: "ok")

    def _is_exempt(self, path):
        return self.middleware._is_exempt(path)

    def test_robots_txt_exempt(self):
        self.assertTrue(self._is_exempt("/robots.txt"))

    def test_sitemap_xml_exempt(self):
        self.assertTrue(self._is_exempt("/sitemap.xml"))

    def test_llms_txt_exempt(self):
        self.assertTrue(self._is_exempt("/llms.txt"))

    def test_llms_full_txt_exempt(self):
        self.assertTrue(self._is_exempt("/llms-full.txt"))

    def test_well_known_paths_exempt(self):
        self.assertTrue(self._is_exempt("/.well-known/security.txt"))

    def test_regular_page_not_exempt(self):
        self.assertFalse(self._is_exempt("/leaguetable/"))


class TestDatabaseGuardExemptions(TestCase):
    """AI/SEO files must be served without a DB probe during outages."""

    def _request_skips_db_check(self, path):
        factory = RequestFactory()
        request = factory.get(path)
        middleware = DatabaseGuardMiddleware(lambda request: "ok")
        middleware(request)
        return getattr(request, "db_online", "skipped")

    def test_robots_txt_skips_db_check(self):
        self.assertEqual(self._request_skips_db_check("/robots.txt"), "skipped")

    def test_sitemap_xml_skips_db_check(self):
        self.assertEqual(self._request_skips_db_check("/sitemap.xml"), "skipped")

    def test_llms_txt_skips_db_check(self):
        self.assertEqual(self._request_skips_db_check("/llms.txt"), "skipped")

    def test_llms_full_txt_skips_db_check(self):
        self.assertEqual(self._request_skips_db_check("/llms-full.txt"), "skipped")

    def test_well_known_skips_db_check(self):
        self.assertEqual(
            self._request_skips_db_check("/.well-known/security.txt"), "skipped"
        )
