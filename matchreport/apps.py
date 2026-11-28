from django.apps import AppConfig


class MatchreportConfig(AppConfig):
    name = "matchreport"
    verbose_name = "Matchreport"

    def ready(self):
        from matchreport.service.officiated_games_service import (
            officiated_games_for_team,
        )
        from officials.service.officiated_games import register_provider

        register_provider(officiated_games_for_team)
