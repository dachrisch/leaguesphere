"""Read-only admin for the event store.

The log is append-only, so neither the events nor their projection may be
edited, added or deleted by hand in the admin. Staff who need to correct a
result do it through a ``correction`` event (and, once the append endpoint is
wired, its audit trail) -- never through this screen.
"""

from django.contrib import admin

from gameevents.models import GameEvent, GameState


class ReadOnlyAdmin(admin.ModelAdmin):
    def has_add_permission(self, request):
        return False

    def has_change_permission(self, request, obj=None):
        return False

    def has_delete_permission(self, request, obj=None):
        return False


@admin.register(GameEvent)
class GameEventAdmin(ReadOnlyAdmin):
    list_display = ("id", "game", "seq", "type", "code", "side", "period", "source")
    list_filter = ("type", "source")
    search_fields = ("client_id", "code")
    readonly_fields = [field.name for field in GameEvent._meta.fields]


@admin.register(GameState)
class GameStateAdmin(ReadOnlyAdmin):
    list_display = (
        "id",
        "game",
        "score_home",
        "score_away",
        "period",
        "in_possession",
        "last_seq",
    )
    readonly_fields = [field.name for field in GameState._meta.fields]
