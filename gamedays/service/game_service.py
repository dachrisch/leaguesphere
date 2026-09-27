from django.db import transaction

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
        return self._write_gamelog(
            GameLogCreator(self.gameinfo.gameinfo, team, event, user, half).create
        )

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
        """Overwrite the stored half scores with the gamelog totals.

        Full recompute: scores entered without gamelog entries are lost. The
        scorecard write path does not use this, see ``_write_gamelog``.
        """
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
        return self._write_gamelog(lambda: self._mark_entries_as_deleted(sequence))

    def _mark_entries_as_deleted(self, sequence) -> GameLog:
        gamelog = self.get_gamelog()
        gamelog.mark_entries_as_deleted(sequence)
        return gamelog

    def _write_gamelog(self, write) -> GameLog:
        """Run a gamelog ``write`` and shift the stored scores by its effect.

        Only the change the write makes to the gamelog half scores is applied,
        so a score entered without gamelog entries (designer results editor)
        survives scorecard writes (#1988). Snapshot, write and score update run
        in one transaction holding the game's result rows locked, so concurrent
        writes to the same game apply their changes one after the other.
        """
        with transaction.atomic():
            self.gameresult.lock()
            before = self._half_scores(self.get_gamelog())
            gamelog = write()
            after = self._half_scores(gamelog)
            self.gameresult.apply_score_change(
                {key: after[key] - before[key] for key in after}
            )
        return gamelog

    @staticmethod
    def _half_scores(gamelog: GameLog) -> dict:
        return {
            (True, "fh"): gamelog.get_home_firsthalf_score(),
            (True, "sh"): gamelog.get_home_secondhalf_score(),
            (False, "fh"): gamelog.get_away_firsthalf_score(),
            (False, "sh"): gamelog.get_away_secondhalf_score(),
        }

    def _create_log_entry(self, event_text, user):
        TeamLog.objects.get_or_create(
            gameinfo_id=self.game_id, event=event_text, half=0, sequence=0, author=user
        )

    def update_team_in_possesion(self, team_name):
        self.gameinfo.update_team_in_possession(team_name)
