from gamedays.models import Team, TeamLog
from gamedays.service.gamelog import GameLog, GameLogCreator
from gamedays.service.wrapper.gameinfo_wrapper import GameinfoWrapper
from gamedays.service.wrapper.gameresult_wrapper import GameresultWrapper


class GameService(object):
    def __init__(self, game_id):
        self.game_id = game_id
        self.gameinfo: GameinfoWrapper = GameinfoWrapper.from_id(game_id)
        self.gameresult: GameresultWrapper = GameresultWrapper(self.gameinfo.gameinfo)

    def update_halftime(self, user):
        self.gameinfo.set_halftime_to_now()
        self._create_log_entry("2. Halbzeit gestartet", user)

    def update_gamestart(self, user):
        self.gameinfo.set_gamestarted_to_now()
        self._create_log_entry("Spiel gestartet", user)

    def update_game_finished(self, user):
        self.gameinfo.set_game_finished_to_now()
        self._create_log_entry("Spiel beendet", user)

    def get_gamelog(self):
        return GameLog(self.gameinfo.gameinfo)

    def create_gamelog(self, team_name, event, user, half):
        # ToDo extract to TeamWrapper
        team = self._resolve_team(team_name)
        gamelog = GameLogCreator(self.gameinfo.gameinfo, team, event, user, half)
        return gamelog.create()

    @staticmethod
    def _resolve_team(team_identifier) -> Team:
        # The scorecard posts the team id (pk) so the write path is unambiguous.
        # Fall back to name/description so a stale/cached client mid-deploy that still
        # posts a team name (or the description that used to leak via "?start=") keeps
        # working instead of 404ing.
        if str(team_identifier).isdigit():
            team = Team.objects.filter(pk=team_identifier).first()
            if team is not None:
                return team
        team = Team.objects.filter(name=team_identifier).first()
        if team is None:
            team = Team.objects.filter(description=team_identifier).first()
        if team is None:
            raise Team.DoesNotExist(
                f"Team matching query does not exist: {team_identifier!r}"
            )
        return team

    def update_score(self, gamelog: GameLog):
        self.gameresult.save_home_first_half(
            gamelog.get_home_firsthalf_score(), gamelog.get_away_firsthalf_score()
        )
        self.gameresult.save_away_first_half(
            gamelog.get_away_firsthalf_score(), gamelog.get_home_firsthalf_score()
        )
        self.gameresult.save_home_second_half(
            gamelog.get_home_secondhalf_score(), gamelog.get_away_secondhalf_score()
        )
        self.gameresult.save_away_second_half(
            gamelog.get_away_secondhalf_score(), gamelog.get_home_secondhalf_score()
        )

    def delete_gamelog(self, sequence):
        gamelog = GameLog(self.gameinfo.gameinfo)
        gamelog.mark_entries_as_deleted(sequence)
        return gamelog

    def _create_log_entry(self, event_text, user):
        TeamLog.objects.get_or_create(
            gameinfo_id=self.game_id, event=event_text, half=0, sequence=0, author=user
        )

    def update_team_in_possesion(self, team_name):
        self.gameinfo.update_team_in_possession(team_name)
