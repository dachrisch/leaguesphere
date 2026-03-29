from django.contrib import admin

from gamedays.models import UserProfile, Permissions, UserPermissions, \
    Achievement, PlayerAchievement

# Register your models here.

<<<<<<< HEAD

@admin.register(Team)
class TeamAdmin(admin.ModelAdmin):
    search_fields = ("name", "description")


admin.site.register(League)
admin.site.register(Season)
=======
>>>>>>> master
admin.site.register(UserProfile)
admin.site.register(UserPermissions)
admin.site.register(Permissions)
admin.site.register(Achievement)
admin.site.register(PlayerAchievement)

# Register your models here.
