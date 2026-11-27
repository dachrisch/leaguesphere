from django.apps import AppConfig


class OfficialsConfig(AppConfig):
    default_auto_field = "django.db.models.BigAutoField"
    name = "officials"

    def ready(self):
        from officials.service.gamedays_hooks import register

        register()
