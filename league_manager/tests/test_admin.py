from django.contrib.auth.models import User
from django.test import TestCase, RequestFactory
from django.urls import reverse

from league_manager.admin import SiteConfigurationAdmin
from league_manager.models import SiteConfiguration


class SiteConfigurationAdminTest(TestCase):
    def setUp(self):
        self.factory = RequestFactory()
        self.admin_user = User.objects.create_user(
            username="admin", password="testpass", is_staff=True, is_superuser=True
        )
        self.config = SiteConfiguration.objects.get_or_create(id=1)[0]
        self.admin = SiteConfigurationAdmin(SiteConfiguration, None)

    def test_maintenance_mode_display_shows_on(self):
        self.config.maintenance_mode = True
        display = self.admin.maintenance_mode_display(self.config)
        self.assertIn("ON", display)

    def test_maintenance_mode_display_shows_off(self):
        self.config.maintenance_mode = False
        display = self.admin.maintenance_mode_display(self.config)
        self.assertIn("OFF", display)

    def test_maintenance_pages_count(self):
        self.config.maintenance_pages = [r"^/api/.*", r"^/admin/.*"]
        self.assertEqual(self.admin.maintenance_pages_count(self.config), 2)

    def test_maintenance_pages_count_empty(self):
        self.config.maintenance_pages = []
        self.assertEqual(self.admin.maintenance_pages_count(self.config), 0)

    def test_has_add_permission_when_none_exists(self):
        SiteConfiguration.objects.all().delete()
        request = self.factory.get("/admin/")
        request.user = self.admin_user
        self.assertTrue(self.admin.has_add_permission(request))

    def test_has_add_permission_when_exists(self):
        request = self.factory.get("/admin/")
        request.user = self.admin_user
        self.assertFalse(self.admin.has_add_permission(request))

    def test_has_delete_permission_always_false(self):
        request = self.factory.get("/admin/")
        request.user = self.admin_user
        self.assertFalse(self.admin.has_delete_permission(request, self.config))

    def test_toggle_maintenance_flips_state(self):
        self.config.maintenance_mode = False
        self.config.save()
        request = self.factory.get(
            "/admin/league_manager/siteconfiguration/toggle-maintenance/"
        )
        request.user = self.admin_user
        response = self.admin.toggle_maintenance(request)
        self.assertEqual(response.status_code, 302)
        self.config.refresh_from_db()
        self.assertTrue(self.config.maintenance_mode)

    def test_toggle_maintenance_flips_back(self):
        self.config.maintenance_mode = True
        self.config.save()
        request = self.factory.get(
            "/admin/league_manager/siteconfiguration/toggle-maintenance/"
        )
        request.user = self.admin_user
        response = self.admin.toggle_maintenance(request)
        self.assertEqual(response.status_code, 302)
        self.config.refresh_from_db()
        self.assertFalse(self.config.maintenance_mode)

    def test_enable_maintenance_action(self):
        self.config.maintenance_mode = False
        self.config.save()
        request = self.factory.get("/admin/")
        request.user = self.admin_user
        self.admin.enable_maintenance(request, SiteConfiguration.objects.all())
        self.config.refresh_from_db()
        self.assertTrue(self.config.maintenance_mode)

    def test_disable_maintenance_action(self):
        self.config.maintenance_mode = True
        self.config.save()
        request = self.factory.get("/admin/")
        request.user = self.admin_user
        self.admin.disable_maintenance(request, SiteConfiguration.objects.all())
        self.config.refresh_from_db()
        self.assertFalse(self.config.maintenance_mode)


class SiteConfigurationAdminIntegrationTest(TestCase):
    """Integration tests using the Django test client."""

    def setUp(self):
        self.admin_user = User.objects.create_user(
            username="admin", password="testpass", is_staff=True, is_superuser=True
        )
        self.config = SiteConfiguration.objects.get_or_create(id=1)[0]

    def test_changelist_displays_maintenance_status(self):
        self.client.force_login(self.admin_user)
        response = self.client.get(
            reverse("admin:league_manager_siteconfiguration_changelist")
        )
        self.assertEqual(response.status_code, 200)
        self.assertContains(response, "Maintenance")

    def test_toggle_maintenance_endpoint_via_client(self):
        self.client.force_login(self.admin_user)
        self.config.maintenance_mode = False
        self.config.save()

        response = self.client.get(reverse("admin:toggle-maintenance"), follow=True)
        self.assertEqual(response.status_code, 200)
        self.config.refresh_from_db()
        self.assertTrue(self.config.maintenance_mode)
