from django.apps import AppConfig


class GamedaysConfig(AppConfig):
    name = "gamedays"

    def ready(self):
        # noinspection PyUnresolvedReferences
        import gamedays.service.signals
        from gamedays import checks  # noqa: F401  (register startup checks)
