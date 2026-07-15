from django.contrib import admin
from django.contrib import messages
from django.shortcuts import redirect
from django.urls import path

from league_manager.models import SiteConfiguration


@admin.register(SiteConfiguration)
class SiteConfigurationAdmin(admin.ModelAdmin):
    """Admin interface for site-wide configuration with one-click maintenance mode toggle."""

    list_display = ("maintenance_mode_display", "maintenance_pages_count")
    actions = ["enable_maintenance", "disable_maintenance"]

    def get_urls(self):
        urls = super().get_urls()
        custom_urls = [
            path(
                "toggle-maintenance/",
                self.admin_site.admin_view(self.toggle_maintenance),
                name="toggle-maintenance",
            ),
        ]
        return custom_urls + urls

    def maintenance_mode_display(self, obj):
        status = "ON" if obj.maintenance_mode else "OFF"
        indicator = "MAINT" if obj.maintenance_mode else "LIVE"
        return f"[{indicator}] Maintenance: {status}"

    maintenance_mode_display.short_description = "Status"
    maintenance_mode_display.admin_order_field = "maintenance_mode"

    def maintenance_pages_count(self, obj):
        pages = obj.maintenance_pages or []
        return len(pages)

    maintenance_pages_count.short_description = "Excluded Pages"

    def toggle_maintenance(self, request):
        config, _ = SiteConfiguration.objects.get_or_create(id=1)
        config.maintenance_mode = not config.maintenance_mode
        config.save()
        status = "enabled" if config.maintenance_mode else "disabled"
        self.message_user(request, f"Maintenance mode {status}.", messages.SUCCESS)
        return redirect("..")

    @admin.action(description="Enable maintenance mode")
    def enable_maintenance(self, request, queryset):
        for obj in queryset:
            obj.maintenance_mode = True
            obj.save()
        self.message_user(request, "Maintenance mode enabled.", messages.SUCCESS)

    @admin.action(description="Disable maintenance mode")
    def disable_maintenance(self, request, queryset):
        for obj in queryset:
            obj.maintenance_mode = False
            obj.save()
        self.message_user(request, "Maintenance mode disabled.", messages.SUCCESS)

    def has_add_permission(self, request):
        return SiteConfiguration.objects.count() == 0

    def has_delete_permission(self, request, obj=None):
        return False
