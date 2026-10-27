from pathlib import Path
import re

from django.contrib.auth import get_user_model
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
            if topic.staff_only:
                continue
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
        content = response.content.decode()
        assert "2026" in content
        assert "2025" in content


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

# Topics added with the personal home (#2078) and the season rollover (#2079).
HOME_TOPICS = ["startseite"]


class TestHomeTopic(TestCase):
    def test_home_topic_renders(self):
        for slug in HOME_TOPICS:
            response = self.client.get(reverse("help-topic", kwargs={"slug": slug}))
            assert response.status_code == 200, slug
            assert "<h1" in response.content.decode(), slug

    def test_getting_started_links_the_home_topic(self):
        response = self.client.get(
            reverse("help-topic", kwargs={"slug": "getting-started"})
        )

        assert (
            reverse("help-topic", kwargs={"slug": "startseite"})
            in response.content.decode()
        )

    def test_home_topic_points_at_the_gameday_chain(self):
        response = self.client.get(reverse("help-topic", kwargs={"slug": "startseite"}))

        content = response.content.decode()
        assert reverse("help-topic", kwargs={"slug": "liga-verwalten"}) in content
        assert reverse("help-topic", kwargs={"slug": "gameday-designer"}) in content


NEW_TOPICS = ["liga-verwalten", "ergebnisse-erfassen", "offizielle-statistik"]


class TestNewLeagueAndResultsTopics(TestCase):
    def test_new_topics_render(self):
        for slug in NEW_TOPICS:
            response = self.client.get(reverse("help-topic", kwargs={"slug": slug}))
            assert response.status_code == 200, slug
            assert "<h1" in response.content.decode(), slug

    def test_new_topics_embed_a_video(self):
        for slug in NEW_TOPICS:
            response = self.client.get(reverse("help-topic", kwargs={"slug": slug}))
            assert (
                "https://www.youtube.com/embed/" in response.content.decode()
            ), f"{slug}: expected an embedded walkthrough video"


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


class TestStaffOnlyHelpTopic(TestCase):
    """The dbaccess topic must not be reachable without a staff login."""

    def setUp(self):
        user_model = get_user_model()
        self.staff = user_model.objects.create_user(
            username="staff-member", password="pw-for-test", is_staff=True
        )
        self.member = user_model.objects.create_user(
            username="normal-member", password="pw-for-test"
        )

    def _topic_url(self):
        return reverse("help-topic", kwargs={"slug": "dbaccess"})

    def test_anonymous_gets_404_for_staff_only_topic(self):
        assert self.client.get(self._topic_url()).status_code == 404

    def test_non_staff_gets_404_for_staff_only_topic(self):
        self.client.force_login(self.member)

        assert self.client.get(self._topic_url()).status_code == 404

    def test_staff_gets_topic_with_screenshots(self):
        self.client.force_login(self.staff)

        response = self.client.get(self._topic_url())

        assert response.status_code == 200
        content = response.content.decode()
        assert "/static/help/img/dbaccess-dbeaver-main.png" in content
        assert "/static/help/img/dbaccess-dbeaver-ssh.png" in content

    def test_index_hides_topic_and_group_from_non_staff(self):
        self.client.force_login(self.member)

        content = self.client.get(reverse("help-index")).content.decode()

        assert "Temporärer Datenbankzugang" not in content
        assert "Nur für Staff" not in content

    def test_index_lists_topic_and_group_for_staff(self):
        self.client.force_login(self.staff)

        content = self.client.get(reverse("help-index")).content.decode()

        assert "Temporärer Datenbankzugang" in content
        assert "Nur für Staff" in content

    def test_sidebar_of_other_topic_hides_staff_topic_from_non_staff(self):
        self.client.force_login(self.member)

        response = self.client.get(
            reverse("help-topic", kwargs={"slug": "getting-started"})
        )

        assert self._topic_url() not in response.content.decode()

    def test_prev_next_skips_staff_only_topic_for_non_staff(self):
        self.client.force_login(self.member)

        response = self.client.get(reverse("help-topic", kwargs={"slug": "startseite"}))

        assert self._topic_url() not in response.content.decode()
