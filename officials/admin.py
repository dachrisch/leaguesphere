"""Admin is where a league manager prepares its crew labels.

The scorecard's preparation screen offers a league's `CrewPosition` rows in
`order` and shows `label`. `position` stays the exact `GameOfficial.position`
wire value, so it is easy to get wrong by hand: the built-in defaults are
therefore copied into a league with `manage.py seed_crew_positions`, and this
page is used to translate and reorder them afterwards.
"""

from django.contrib import admin

from officials.models import (
    CrewPosition,
    Official,
    OfficialLicense,
    OfficialLicenseHistory,
)

admin.site.register(Official)
admin.site.register(OfficialLicense)
admin.site.register(OfficialLicenseHistory)


@admin.register(CrewPosition)
class CrewPositionAdmin(admin.ModelAdmin):
    list_display = ("league", "order", "label", "position", "required")
    # Labels and flags are the part a league manager changes most; keeping them
    # editable in the list saves opening five forms per league.
    list_editable = ("order", "label", "required")
    list_filter = ("league", "required")
    list_select_related = ("league",)
    search_fields = ("league__name", "label", "position")
    ordering = ("league__name", "order", "id")
