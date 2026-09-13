from django.contrib import admin, messages
from django.db.models import Case, IntegerField, Value, When

from gamedays.forms import SeasonLeagueTeamForm
from gamedays.models import (
    Gameday,
    Gameinfo,
    Gameresult,
    GameOfficial,
    GameSetup,
    TeamLog,
    Person,
    Team,
    League,
    Season,
    SeasonLeagueTeam,
    ResourceUrl,
    Tournament,
    TournamentRow,
    TournamentColumn,
    TournamentColumnGame,
)

admin.site.register(Gameday)
admin.site.register(GameOfficial)
admin.site.register(GameSetup)
admin.site.register(League)
admin.site.register(Person)
admin.site.register(Season)
admin.site.register(TeamLog)
admin.site.register(ResourceUrl)


@admin.register(Team)
class TeamAdmin(admin.ModelAdmin):
    search_fields = ("name",)


@admin.register(Gameresult)
class GameresultAdmin(admin.ModelAdmin):
    list_display = (
        "id",
        "gameinfo",
        "gameday_name",
        "isHome",
        "team",
        "fh",
        "sh",
        "pa",
    )
    list_select_related = ("gameinfo", "gameinfo__gameday", "team")
    search_fields = (
        "gameinfo__gameday__name",
        "gameinfo__standing",
        "team__name",
    )
    list_filter = ("isHome",)

    @admin.display(description="Gameday")
    def gameday_name(self, obj):
        return obj.gameinfo.gameday.name

    def formfield_for_foreignkey(self, db_field, request, **kwargs):
        if db_field.name == "team":
            object_id = request.resolver_match.kwargs.get("object_id")
            gameresult = (
                Gameresult.objects.select_related("gameinfo")
                .filter(pk=object_id)
                .first()
                if object_id
                else None
            )
            if gameresult:
                # Teams already appearing anywhere in this gameday's schedule are
                # almost always the fix for a wrong/placeholder team assignment
                # (see leaguesphere#1934) -- surface them first, but don't hide
                # the rest of the Team table in case the real fix is elsewhere.
                gameday_team_ids = list(
                    Gameresult.objects.filter(
                        gameinfo__gameday_id=gameresult.gameinfo.gameday_id
                    ).values_list("team_id", flat=True)
                )
                kwargs["queryset"] = Team.objects.annotate(
                    _in_gameday=Case(
                        When(pk__in=gameday_team_ids, then=Value(0)),
                        default=Value(1),
                        output_field=IntegerField(),
                    )
                ).order_by("_in_gameday", "name")
        return super().formfield_for_foreignkey(db_field, request, **kwargs)


class TournamentColumnGameInline(admin.TabularInline):
    model = TournamentColumnGame
    extra = 1
    fields = ("gameinfo", "order")
    autocomplete_fields = ["gameinfo"]
    ordering = ["order", "id"]


class TournamentColumnInline(admin.StackedInline):
    model = TournamentColumn
    extra = 0
    fields = ("title", "order")
    ordering = ["order", "id"]
    show_change_link = True


class TournamentRowInline(admin.StackedInline):
    model = TournamentRow
    extra = 0
    fields = ("title", "order")
    ordering = ["order", "id"]
    show_change_link = True


class ResourceUrlInline(admin.TabularInline):
    model = ResourceUrl
    extra = 1
    fields = ("url", "description")
    ordering = ["id"]


@admin.register(Gameinfo)
class GameinfoAdmin(admin.ModelAdmin):
    list_display = (
        "id",
        "gameday",
        "field",
        "scheduled",
        "stage",
        "standing",
        "status",
    )
    list_select_related = ("gameday",)
    search_fields = ("id", "gameday__name", "stage", "standing")
    list_filter = ("status", "stage")
    actions = ["resave_to_repropagate"]

    @admin.action(description="Re-run propagation (re-save selected completed games)")
    def resave_to_repropagate(self, request, queryset):
        # A plain .save() re-fires post_save, which re-runs
        # CanvasBracketProgressionService for completed games -- the same
        # "resave the feeding games" recipe used to manually repair
        # leaguesphere#1934, now doable from the UI instead of a shell.
        resaved = 0
        skipped = 0
        for gameinfo in queryset:
            if gameinfo.status == Gameinfo.STATUS_COMPLETED:
                gameinfo.save()
                resaved += 1
            else:
                skipped += 1
        if resaved:
            self.message_user(
                request, f"Re-saved {resaved} completed game(s); propagation re-run."
            )
        if skipped:
            self.message_user(
                request,
                f"Skipped {skipped} game(s) not marked '{Gameinfo.STATUS_COMPLETED}' "
                "(propagation only runs for completed games).",
                level=messages.WARNING,
            )


@admin.register(Tournament)
class TournamentAdmin(admin.ModelAdmin):
    list_display = (
        "name",
        "title",
        "location",
        "row_count",
        "show_league_name",
        "show_field",
    )
    search_fields = ("name", "title", "location")
    inlines = [TournamentRowInline, ResourceUrlInline]

    def row_count(self, obj):
        return obj.rows.count()

    row_count.short_description = "Rows"


@admin.register(TournamentRow)
class TournamentRowAdmin(admin.ModelAdmin):
    list_display = ("tournament", "order", "title", "column_count")
    list_select_related = ("tournament",)
    list_filter = ("tournament",)
    inlines = [TournamentColumnInline]

    def column_count(self, obj):
        return obj.columns.count()

    column_count.short_description = "Columns"


@admin.register(TournamentColumn)
class TournamentColumnAdmin(admin.ModelAdmin):
    list_display = ("row", "order", "title", "game_count")
    list_select_related = ("row", "row__tournament")
    list_filter = ("row__tournament",)
    inlines = [TournamentColumnGameInline]

    def game_count(self, obj):
        return obj.column_games.count()

    game_count.short_description = "Games"


@admin.register(TournamentColumnGame)
class TournamentColumnGameAdmin(admin.ModelAdmin):
    list_display = ("column", "gameinfo", "order")
    list_select_related = ("column", "column__row", "gameinfo", "gameinfo__gameday")
    autocomplete_fields = ["gameinfo"]


@admin.register(SeasonLeagueTeam)
class SeasonLeagueTeamAdmin(admin.ModelAdmin):
    form = SeasonLeagueTeamForm
    list_display = ("season", "league", "team_count", "team_list")

    def team_count(self, obj):
        return obj.teams.count()

    team_count.short_description = "Team Anzahl"

    def team_list(self, obj):
        return ", ".join(
            [team.description for team in obj.teams.all().order_by("description")]
        )

    team_list.short_description = "Teams"

    actions = ["duplicate_entry"]

    def duplicate_entry(self, request, queryset):
        for obj in queryset:
            teams = Team.objects.none()
            if hasattr(obj, "teams"):
                teams = obj.teams.all()
            new_obj = obj
            new_obj.pk = None
            new_obj.id = None
            new_obj.save()
            new_obj.teams.set(teams)

        self.message_user(
            request,
            "Duplikate wurden erfolgreich erstellt und befinden sich am Anfang der Liste!",
        )

    duplicate_entry.short_description = "Duplikat für ausgewählte Elemente erstellen"
