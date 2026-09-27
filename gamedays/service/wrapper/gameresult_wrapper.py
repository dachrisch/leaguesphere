import logging

from django.db import transaction

from gamedays.models import Gameresult, Team, Gameinfo

logger = logging.getLogger(__name__)


class GameresultWrapper(object):
    def __init__(self, gameinfo):
        self.gameinfo = gameinfo

    def save_home_first_half(self, first_half, points_against):
        self._save(first_half, None, points_against, True)

    def save_away_first_half(self, first_half, points_against):
        self._save(first_half, None, points_against, False)

    def save_home_second_half(self, second_half, points_against):
        self._save(None, second_half, points_against, True)

    def save_away_second_half(self, second_half, points_against):
        self._save(None, second_half, points_against, False)

    def _save(self, first_half, second_half, points_against, is_home):
        gameresult = self._get_gameresult(is_home)
        if first_half is not None:
            gameresult.fh = first_half
        if second_half is None:
            gameresult.pa = points_against
        else:
            gameresult.sh = second_half
            gameresult.pa = gameresult.pa + points_against
        gameresult.save()

    def lock(self) -> dict[bool, Gameresult]:
        """Lock the game's result rows until the surrounding transaction ends."""
        return {
            gameresult.isHome: gameresult
            for gameresult in Gameresult.objects.select_for_update()
            .filter(gameinfo=self.gameinfo)
            .order_by("pk")
        }

    def apply_score_change(self, deltas: dict):
        """Shift the stored half scores by ``{(is_home, "fh"|"sh"): delta}``.

        Scores that did not come from the gamelog (entered manually in the
        designer results editor) are kept instead of being overwritten (#1988).
        ``pa`` is re-derived from the opponent's stored halves. A half that
        would drop below 0 (a manual edit lowered it below the gamelog points
        now being removed) is stored as 0 and logged.
        """
        with transaction.atomic():
            gameresults = self.lock()
            for (is_home, half), delta in deltas.items():
                gameresult = gameresults[is_home]
                score = (getattr(gameresult, half) or 0) + delta
                if score < 0:
                    logger.warning(
                        "Gameresult %s %s would drop to %s after gamelog change %+d, storing 0",
                        gameresult.pk,
                        half,
                        score,
                        delta,
                    )
                    score = 0
                setattr(gameresult, half, score)
            for is_home, gameresult in gameresults.items():
                gameresult.pa = self._calc_score(gameresults[not is_home])
                gameresult.save()

    def _get_team_name(self, is_home):
        return self._get_gameresult(is_home).team.name

    def _get_team_fullname(self, is_home):
        return self._get_gameresult(is_home).team.description

    def _get_gameresult(self, is_home) -> Gameresult:
        return Gameresult.objects.get(gameinfo=self.gameinfo, isHome=is_home)

    def get_home_name(self):
        return self._get_team_name(is_home=True)

    def get_away_name(self):
        return self._get_team_name(is_home=False)

    def get_home_score(self):
        gameresult = self._get_gameresult(is_home=True)
        return self._calc_score(gameresult)

    def get_away_score(self):
        gameresult = self._get_gameresult(is_home=False)
        return self._calc_score(gameresult)

    def _calc_score(self, gameresult):
        score = 0
        if gameresult.fh is not None:
            score = score + gameresult.fh
        if gameresult.sh is not None:
            score = score + gameresult.sh
        return score

    def get_home_fullname(self):
        return self._get_team_fullname(is_home=True)

    def get_away_fullname(self):
        return self._get_team_fullname(is_home=False)

    def create(
        self, team: Team, fh: int, sh: int, pa: int, is_home=False
    ) -> tuple[Gameresult, bool]:
        return Gameresult.objects.update_or_create(
            gameinfo=self.gameinfo,
            isHome=is_home,
            defaults={
                "gameinfo": self.gameinfo,
                "team": team,
                "isHome": is_home,
                "fh": fh,
                "sh": sh,
                "pa": pa,
            },
        )
