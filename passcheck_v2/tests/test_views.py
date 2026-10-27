from django.test import TestCase
from django.urls import reverse


class TestPasscheckV2View(TestCase):
    def test_shell_is_public_and_renders_the_mount_point(self):
        response = self.client.get(reverse("passcheck-v2-app"))

        self.assertEqual(response.status_code, 200)
        self.assertTemplateUsed(response, "passcheck_v2/index.html")
        self.assertContains(response, 'id="passcheck-v2"')
        self.assertContains(response, "/static/passcheck_v2/js/passcheck_v2.js")

    def test_service_worker_is_served_from_the_passcheck_v2_scope(self):
        response = self.client.get(reverse("passcheck-v2-service-worker"))

        self.assertEqual(response.status_code, 200)
        self.assertTrue(response["Content-Type"].startswith("application/javascript"))
        self.assertEqual(response["Service-Worker-Allowed"], "/passcheck/v2/")
        self.assertEqual(response["Cache-Control"], "no-cache")
        self.assertIn(b"passcheck-v2-shell-v1", b"".join(response.streaming_content))
