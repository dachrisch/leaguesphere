from gamedays.models import Gameinfo, Gameresult, GamedayDesignerState


class CanvasBracketProgressionService:
    """
    After a game completes, resolves any downstream playoff games that reference
    this game's winner/loser, or a stage-placement rank, via homeTeamDynamic /
    awayTeamDynamic / official canvas refs.
    """

    def __init__(self, completed_game: Gameinfo):
        self.game = completed_game

    def apply(self) -> None:
        try:
            state = GamedayDesignerState.objects.get(gameday=self.game.gameday)
        except GamedayDesignerState.DoesNotExist:
            return

        nodes = (state.state_data or {}).get("nodes", [])
        game_nodes = [n for n in nodes if n.get("type") == "game"]

        winner_team, loser_team = self._resolve_winner_loser()
        if winner_team is not None or loser_team is not None:
            self._propagate(
                game_nodes,
                lambda ref: self._resolve_winner_loser_ref(
                    ref, winner_team, loser_team
                ),
            )

        self._resolve_stage_ranks(game_nodes)

    def _resolve_winner_loser(self):
        results = list(
            Gameresult.objects.filter(gameinfo=self.game).select_related("team")
        )
        if len(results) < 2:
            return None, None
        home = next((r for r in results if r.isHome), None)
        away = next((r for r in results if not r.isHome), None)
        if not home or not away:
            return None, None
        home_total = (home.fh or 0) + (home.sh or 0)
        away_total = (away.fh or 0) + (away.sh or 0)
        if home_total >= away_total:
            return home.team, away.team
        return away.team, home.team

    def _resolve_winner_loser_ref(self, ref, winner_team, loser_team):
        if not ref or ref.get("matchName") != self.game.standing:
            return None
        ref_type = ref.get("type")
        if ref_type == "winner":
            return winner_team
        if ref_type == "loser":
            return loser_team
        return None

    def _propagate(self, game_nodes, resolve_ref) -> None:
        """For every game node, resolve its home/away/official dynamic refs
        via `resolve_ref` (a ref dict -> Team or None) and write the result
        to the matching slot wherever it resolves to a team."""
        for node in game_nodes:
            data = node.get("data", {})
            target_standing = data.get("standing")
            if not target_standing:
                continue
            self._apply_team(
                target_standing, True, resolve_ref(data.get("homeTeamDynamic"))
            )
            self._apply_team(
                target_standing, False, resolve_ref(data.get("awayTeamDynamic"))
            )
            self._apply_official(target_standing, resolve_ref(data.get("official")))

    def _apply_team(self, target_standing, is_home, team) -> None:
        if team is None:
            return
        try:
            gi = Gameinfo.objects.get(
                gameday=self.game.gameday, standing=target_standing
            )
        except Gameinfo.DoesNotExist:
            return
        Gameresult.objects.filter(gameinfo=gi, isHome=is_home).update(team=team)

    def _apply_official(self, target_standing, team) -> None:
        if team is None:
            return
        Gameinfo.objects.filter(
            gameday=self.game.gameday, standing=target_standing
        ).update(officials=team)

    def _resolve_stage_ranks(self, game_nodes) -> None:
        """
        Resolves `rank` dynamic refs (place N of a whole stage, e.g. "1st of
        Gruppe 2") once every game in that stage is completed. Unlike
        winner/loser, this can't be decided from the single game that just
        completed — it needs the standing of every game in the stage, so it
        only fires once the just-completed game's stage is fully finished.
        """
        stage_name = self.game.stage
        if not stage_name or self._has_unfinished_games(stage_name):
            return

        standings = self._compute_stage_standings(stage_name)
        if not standings:
            return

        self._propagate(
            game_nodes,
            lambda ref: self._resolve_rank_ref(ref, stage_name, standings),
        )

    def _resolve_rank_ref(self, ref, stage_name, standings):
        if not ref or ref.get("type") != "rank" or ref.get("stageName") != stage_name:
            return None
        place = ref.get("place")
        if not place or place < 1 or place > len(standings):
            return None
        return standings[place - 1]

    def _has_unfinished_games(self, stage_name: str) -> bool:
        return (
            Gameinfo.objects.filter(gameday=self.game.gameday, stage=stage_name)
            .exclude(status=Gameinfo.STATUS_COMPLETED)
            .exists()
        )

    def _compute_stage_standings(self, stage_name: str):
        """Ranks the teams of a finished stage: win points (win=2, draw=1,
        loss=0) first, then point difference, then points scored — mirroring
        the tiebreak order already used for gameday-internal tables."""
        stats = {}
        games = Gameinfo.objects.filter(
            gameday=self.game.gameday,
            stage=stage_name,
            status=Gameinfo.STATUS_COMPLETED,
        )
        for gi in games:
            results = list(
                Gameresult.objects.filter(gameinfo=gi).select_related("team")
            )
            home = next((r for r in results if r.isHome), None)
            away = next((r for r in results if not r.isHome), None)
            if not home or not away or not home.team or not away.team:
                continue
            home_total = (home.fh or 0) + (home.sh or 0)
            away_total = (away.fh or 0) + (away.sh or 0)
            self._accumulate(stats, home.team, home_total, away_total)
            self._accumulate(stats, away.team, away_total, home_total)

        ranked = sorted(
            stats.values(),
            key=lambda s: (s["win_points"], s["pf"] - s["pa"], s["pf"]),
            reverse=True,
        )
        return [s["team"] for s in ranked]

    @staticmethod
    def _accumulate(stats: dict, team, points_for: int, points_against: int) -> None:
        entry = stats.setdefault(
            team.id, {"team": team, "win_points": 0, "pf": 0, "pa": 0}
        )
        entry["pf"] += points_for
        entry["pa"] += points_against
        if points_for > points_against:
            entry["win_points"] += 2
        elif points_for == points_against:
            entry["win_points"] += 1
