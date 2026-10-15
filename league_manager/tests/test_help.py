from pathlib import Path
import re

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

    def test_help_index_links_to_in_app_whats_new_page(self):
        response = self.client.get(reverse("help-index"))

        content = response.content.decode()
        assert reverse("help-topic", kwargs={"slug": "whats-new-2026"}) in content
        assert "docs/topics/features/whats-new-2026.md" not in content


class TestWhatsNew(TestCase):
    def test_whats_new_is_an_in_app_page(self):
        response = self.client.get(
            reverse("help-topic", kwargs={"slug": "whats-new-2026"})
        )

        assert response.status_code == 200
        assert "2026" in response.content.decode()


class TestHelpTopic(TestCase):
    def test_help_topic_renders_markdown(self):
        response = self.client.get(
            reverse("help-topic", kwargs={"slug": "getting-started"})
        )

        assert response.status_code == 200
        # Markdown must be converted to HTML, not shown as raw text.
        assert "<h1" in response.content.decode()

    def test_help_topic_has_a_single_headline(self):
        response = self.client.get(
            reverse("help-topic", kwargs={"slug": "getting-started"})
        )

        # The registry title (with icon) is rendered by the template; the
        # leading Markdown H1 must not appear a second time.
        assert response.content.decode().count("<h1") == 1

    def test_help_unknown_topic_returns_404(self):
        response = self.client.get(reverse("help-topic", kwargs={"slug": "nope"}))

        assert response.status_code == 404

    def test_topic_with_video_embeds_it_with_referrerpolicy(self):
        response = self.client.get(
            reverse("help-topic", kwargs={"slug": "share-widget"})
        )

        content = response.content.decode()
        assert "https://www.youtube.com/embed/PzINW_SXlDU" in content
        assert 'referrerpolicy="strict-origin-when-cross-origin"' in content


class TestHelpLanguageFallback(TestCase):
    def test_missing_english_file_falls_back_to_german(self):
        with translation.override("en"):
            response = self.client.get(
                reverse("help-topic", kwargs={"slug": "getting-started"})
            )

        assert response.status_code == 200
        # No .en.md file exists yet, so the German content must be served.
        assert "LeagueSphere" in response.content.decode()


class TestHelpOpenGraph(TestCase):
    def test_help_index_has_help_specific_og_title(self):
        response = self.client.get(reverse("help-index"))

        content = response.content.decode()
        assert '<meta property="og:title" content="Hilfe - LeagueSphere">' in content
        assert "Welcome to leaguesphere" not in content

    def test_help_topic_og_title_uses_topic_title(self):
        response = self.client.get(
            reverse("help-topic", kwargs={"slug": "getting-started"})
        )

        content = response.content.decode()
        assert (
            '<meta property="og:title" content="Leaguesphere - Erste Schritte">'
            in content
        )

    def test_help_topic_og_description_uses_topic_summary(self):
        response = self.client.get(
            reverse("help-topic", kwargs={"slug": "getting-started"})
        )

        content = response.content.decode()
        assert (
            'content="Was LeagueSphere ist, welche Rollen es gibt und wie du dich '
            'anmeldest."' in content
        )


class TestHelpRegistry(TestCase):
    def test_every_topic_has_german_content_file(self):
        content_dir = Path(__file__).resolve().parent.parent / "help" / "content"

        for topic in HELP_TOPICS:
            assert (
                content_dir / f"{topic.slug}.de.md"
            ).exists(), f"missing German content for {topic.slug}"

    def test_every_topic_video_is_a_youtube_embed_url(self):
        for topic in HELP_TOPICS:
            if topic.video:
                assert topic.video.startswith(
                    "https://www.youtube.com/embed/"
                ), f"{topic.slug}: video must be a YouTube /embed/ URL"


PROMISED_TOPICS = ["spieltage", "ligatabellen", "teams-offizielle", "share-widget"]


NEW_TOPICS = ["liga-verwalten", "ergebnisse-erfassen", "offizielle-statistik"]


class TestNewLeagueAndResultsTopics(TestCase):
    def test_new_topics_render(self):
        for slug in NEW_TOPICS:
            response = self.client.get(reverse("help-topic", kwargs={"slug": slug}))
            assert response.status_code == 200, slug
            assert "<h1" in response.content.decode(), slug


class TestPromisedSections(TestCase):
    def test_promised_topics_render_with_a_screenshot(self):
        for slug in PROMISED_TOPICS:
            response = self.client.get(reverse("help-topic", kwargs={"slug": slug}))
            assert response.status_code == 200, slug
            assert "<img" in response.content.decode(), slug

    def test_help_images_referenced_by_content_exist(self):
        content_dir = Path(__file__).resolve().parent.parent / "help" / "content"
        static_dir = Path(__file__).resolve().parent.parent / "static"

        for md_file in content_dir.glob("*.de.md"):
            for ref in re.findall(r"/static/help/img/[\w.-]+", md_file.read_text()):
                assert (
                    static_dir / ref.removeprefix("/static/")
                ).exists(), f"{md_file.name} references missing image {ref}"
