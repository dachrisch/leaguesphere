from datetime import datetime
from typing import Optional

from django.utils import timezone

from gamedays.models import Gameinfo
from league_table.models import LeagueGroup

STATUS_HALFTIME = "2. Halbzeit"
STATUS_FIRST_HALF = "1. Halbzeit"
STATUS_FINISHED = Gameinfo.STATUS_COMPLETED
STATUS_PLANNED = "Geplant"

# Legal status transitions. Relaxed rule (issue #1981): a game may be finished
# directly from the first half, but never before it has started, and a finished
# game cannot regress (e.g. halftime after "beendet").
ALLOWED_TRANSITIONS = {
    STATUS_FIRST_HALF: {STATUS_PLANNED, ""},
    STATUS_HALFTIME: {STATUS_FIRST_HALF},
    STATUS_FINISHED: {STATUS_FIRST_HALF, STATUS_HALFTIME},
}


class IllegalGameTransition(Exception):
    def __init__(self, current: str, target: str):
        super().__init__(
            f"Cannot transition game from status '{current}' to '{target}'"
        )
        self.current = current
        self.target = target


class GameinfoWrapper(object):
    def __init__(self, gameinfo: Gameinfo):
        self.gameinfo = gameinfo

    @classmethod
    def from_id(cls, game_id: int) -> "GameinfoWrapper":
        gi = Gameinfo.objects.get(pk=game_id)
        return cls(gi)

    @classmethod
    def from_instance(cls, gameinfo: Gameinfo) -> "GameinfoWrapper":
        return cls(gameinfo)

    def _save(self, update_fields: Optional[list] = None) -> None:
        self.gameinfo.save(update_fields=update_fields)

    def set_halftime_to_now(self) -> None:
        self._assert_transition_allowed(STATUS_HALFTIME)
        now = timezone.now()
        self.gameinfo.status = STATUS_HALFTIME
        self.gameinfo.gameHalftime = now
        self._save(update_fields=["status", "gameHalftime"])

    def set_gamestarted_to_now(self) -> None:
        self._assert_transition_allowed(STATUS_FIRST_HALF)
        now = timezone.now()
        self.gameinfo.status = STATUS_FIRST_HALF
        self.gameinfo.gameStarted = now
        self._save(update_fields=["status", "gameStarted"])

    def set_game_finished_to_now(self) -> None:
        self._assert_transition_allowed(STATUS_FINISHED)
        now = timezone.now()
        self.gameinfo.status = STATUS_FINISHED
        self.gameinfo.gameFinished = now
        self._save(update_fields=["status", "gameFinished"])

    def _assert_transition_allowed(self, target: str) -> None:
        if self.gameinfo.status not in ALLOWED_TRANSITIONS[target]:
            raise IllegalGameTransition(self.gameinfo.status, target)

    def update_team_in_possession(self, team_name: str) -> None:
        if self.gameinfo.in_possession == team_name:
            return
        self.gameinfo.in_possession = team_name
        self._save(update_fields=["in_possession"])

    def update_gameday(self, gameday) -> Gameinfo:
        self.gameinfo.gameday = gameday
        self.gameinfo.save()
        return self.gameinfo

    @classmethod
    def delete_by_gameday(cls, gameday):
        Gameinfo.objects.filter(gameday=gameday).delete()

    def update_standing(self, standing: str):
        try:
            group_id = int(standing)
            group = LeagueGroup.objects.get(pk=group_id)
            self.gameinfo.standing = group.name
            self.gameinfo.league_group = group
        except (TypeError, ValueError, LeagueGroup.DoesNotExist):
            self.gameinfo.standing = standing
            self.gameinfo.league_group = None
        self.gameinfo.save()
