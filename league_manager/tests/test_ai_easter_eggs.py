"""
Tests for the Tier-3 agent experience: /agents page, agent card, and the
hidden easter eggs in the base template.

Following TDD principles - these tests define the expected behavior
before implementation.
"""

import json

from django.test import TestCase, Client


class TestAgentsPage(TestCase):
    def setUp(self):
        self.client = Client()

    def test_agents_page_is_accessible(self):
        response = self.client.get("/agents/")
        self.assertEqual(response.status_code, 200)

    def test_agents_page_welcomes_agents(self):
        response = self.client.get("/agents/")
        self.assertContains(response, "agent")

    def test_agents_page_links_agent_files(self):
        response = self.client.get("/agents/")
        self.assertContains(response, "/llms.txt")
        self.assertContains(response, "/llms-dynamic.txt")

    def test_agents_page_not_in_main_navigation(self):
        """The page exists but is not linked from the base navigation."""
        response = self.client.get("/agents/")
        content = response.content.decode()
        self.assertNotIn('href="/agents/"', content)


class TestAgentCardEndpoint(TestCase):
    def setUp(self):
        self.client = Client()

    def test_agent_card_is_accessible(self):
        response = self.client.get("/.well-known/agent-card.json")
        self.assertEqual(response.status_code, 200)

    def test_agent_card_returns_json_content_type(self):
        response = self.client.get("/.well-known/agent-card.json")
        self.assertIn("application/json", response["Content-Type"])

    def test_agent_card_follows_a2a_shape(self):
        payload = json.loads(self.client.get("/.well-known/agent-card.json").content)
        self.assertEqual(payload["name"], "LeagueSphere Assistant")
        self.assertIn("protocolVersion", payload)
        self.assertIn("capabilities", payload)
        self.assertIn("skills", payload)
        self.assertTrue(payload["skills"])


class TestBaseTemplateEasterEggs(TestCase):
    """The base template carries a hidden comment and a console message."""

    def setUp(self):
        self.client = Client()

    def response_content(self):
        return self.client.get("/maintenance/").content.decode()

    def test_hidden_html_comment_greets_agents(self):
        content = self.response_content()
        self.assertIn("Hello, fellow agent", content)
        self.assertIn("the referee saw nothing", content)

    def test_console_easter_egg_present(self):
        content = self.response_content()
        self.assertIn("console.log", content)
        self.assertIn("LeagueSphere", content)


class TestNginxPersonalityHeaders(TestCase):
    def test_all_nginx_variants_declare_personality_headers(self):
        for conf in [
            "container/nginx.conf",
            "container/nginx.staging.conf",
            "container/nginx.demo.conf",
        ]:
            with open(conf) as f:
                content = f.read()
            self.assertIn("X-Powered-By", content, conf)
            self.assertIn("X-LeagueSphere-Status", content, conf)
