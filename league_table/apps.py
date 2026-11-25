from django.apps import AppConfig


class LeagueTableConfig(AppConfig):
    name = "league_table"

    def ready(self):
        from league_table.service.gamedays_hooks import register

        register()
