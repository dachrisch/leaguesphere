from django.apps import AppConfig


class PasscheckConfig(AppConfig):
    default_auto_field = "django.db.models.BigAutoField"
    name = "passcheck"

    def ready(self):
        from passcheck.service.gamedays_hooks import register

        register()
