from pathlib import Path

from django.test import TestCase
from django.urls import reverse
from django.utils import translation
from django.utils.html import escape

from league_manager.help.registry import HELP_TOPICS


class TestHelpIndex(TestCase):
    def test_help_index_returns_200(self):
        response = self.client.get(reverse("help-index"))

        assert response.status_code == 200

    def test_help_index_lists_all_registry_topics(self):
        response = self.client.get(reverse("help-index"))

        content = response.content.decode()
        for topic in HELP_TOPICS:
            assert escape(topic.title["de"]) in content


class TestHelpTopic(TestCase):
    def test_help_topic_renders_markdown(self):
        response = self.client.get(
            reverse("help-topic", kwargs={"slug": "getting-started"})
        )

        assert response.status_code == 200
        # Markdown must be converted to HTML, not shown as raw text.
        assert "<h1" in response.content.decode()

    def test_help_unknown_topic_returns_404(self):
        response = self.client.get(reverse("help-topic", kwargs={"slug": "nope"}))

        assert response.status_code == 404


class TestHelpLanguageFallback(TestCase):
    def test_missing_english_file_falls_back_to_german(self):
        with translation.override("en"):
            response = self.client.get(
                reverse("help-topic", kwargs={"slug": "getting-started"})
            )

        assert response.status_code == 200
        # No .en.md file exists yet, so the German content must be served.
        assert "LeagueSphere" in response.content.decode()


class TestHelpRegistry(TestCase):
    def test_every_topic_has_german_content_file(self):
        content_dir = Path(__file__).resolve().parent.parent / "help" / "content"

        for topic in HELP_TOPICS:
            assert (
                content_dir / f"{topic.slug}.de.md"
            ).exists(), f"missing German content for {topic.slug}"
