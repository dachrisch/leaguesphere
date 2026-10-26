"""Admin surface: read-mostly on purpose.

The audit trail is append-only in the UI too - an ``AccessEvent`` that an admin
can rewrite is not a record. Requests are created and decided through the
dedicated staff pages, not here.
"""

from django.contrib import admin

from dbaccess.models import AccessEvent, AccessRequest, GrantableTable


@admin.register(GrantableTable)
class GrantableTableAdmin(admin.ModelAdmin):
    list_display = ("name", "label", "grantable", "note")
    list_editable = ("grantable", "label", "note")
    search_fields = ("name", "label")


class AccessEventInline(admin.TabularInline):
    model = AccessEvent
    extra = 0
    can_delete = False
    readonly_fields = ("at", "actor", "action", "detail", "from_ip")

    def has_add_permission(self, request, obj=None):
        return False


@admin.register(AccessRequest)
class AccessRequestAdmin(admin.ModelAdmin):
    list_display = ("person", "state", "requester", "approver", "ttl_hours", "created_at")
    list_filter = ("state",)
    search_fields = ("person", "db_user", "requester__username")
    readonly_fields = (
        "db_user",
        "grant_host",
        "created_at",
        "activated_at",
        "dropped_at",
        "updated_at",
    )
    inlines = (AccessEventInline,)

    def has_add_permission(self, request):
        # Requests are created through the staff flow so the event is written.
        return False


@admin.register(AccessEvent)
class AccessEventAdmin(admin.ModelAdmin):
    list_display = ("at", "request", "actor", "action")
    list_filter = ("action",)
    search_fields = ("actor", "detail")

    def has_add_permission(self, request):
        return False

    def has_change_permission(self, request, obj=None):
        return False

    def has_delete_permission(self, request, obj=None):
        return False
