from django.test import TestCase
from django.urls import reverse


class TestFieldView(TestCase):
    def test_shell_is_public_and_renders_the_mount_point(self):
        response = self.client.get(reverse("field-app"))

        self.assertEqual(response.status_code, 200)
        self.assertTemplateUsed(response, "field/index.html")
        self.assertContains(response, 'id="field"')
        self.assertContains(response, "/static/field/js/field.js")

    def test_service_worker_is_served_from_the_field_scope(self):
        response = self.client.get(reverse("field-service-worker"))

        self.assertEqual(response.status_code, 200)
        self.assertTrue(response["Content-Type"].startswith("application/javascript"))
        self.assertEqual(response["Service-Worker-Allowed"], "/field/")
        self.assertEqual(response["Cache-Control"], "no-cache")
        self.assertIn(b"field-shell-v1", b"".join(response.streaming_content))
