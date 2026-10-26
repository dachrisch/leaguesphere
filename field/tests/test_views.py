from django.test import TestCase
from django.urls import reverse


class TestFieldView(TestCase):
    def test_shell_is_public_and_renders_the_mount_point(self):
        response = self.client.get(reverse("field-app"))

        self.assertEqual(response.status_code, 200)
        self.assertTemplateUsed(response, "field/index.html")
        self.assertContains(response, 'id="field"')
        self.assertContains(response, "/static/field/js/field.js")
