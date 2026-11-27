from django.apps import AppConfig


class LivetickerConfig(AppConfig):
    name = "liveticker"

    def ready(self):
        from liveticker.service.gamedays_hooks import register

        register()
