from gamedays.models import Gameinfo, Gameresult, GamedayDesignerState, Team
from gamedays.service.gameday_settings import TEAM_ID
from gamedays.service.model_wrapper import GamedayModelWrapper


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
        except Gameinfo.MultipleObjectsReturned:
            # Several games share this standing (e.g. a placement round robin
            # authored with one standing for all its games, like "BRR" x3) --
            # there's no way to tell which specific game this home/away slot
            # belongs to, so skip it. Letting this raise would abort
            # _propagate's loop and silently leave every later game node
            # unresolved too, not just this ambiguous one.
            return
        Gameresult.objects.filter(gameinfo=gi, isHome=is_home).update(team=team)

    def _apply_official(self, target_standing, team) -> None:
        if team is None:
            return
        matches = Gameinfo.objects.filter(
            gameday=self.game.gameday, standing=target_standing
        )
        if matches.count() != 1:
            # Ambiguous (0 or several games share this standing) -- applying
            # to all of them would silently assign the same official to
            # unrelated games sharing a standing, so skip instead.
            return
        matches.update(officials=team)

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
        """Ranks the teams of a finished stage using the same TieBreakerEngine
        and configured tie-break ruleset as the displayed Vorrunden-/
        Abschlusstabelle, so a rank resolved here always agrees with what the
        table shows. Field-agnostic: a stage's games may be scheduled across
        multiple physical fields and still resolve as one group, since ranking
        is keyed by the stage name, not by field."""
        try:
            wrapper = GamedayModelWrapper(pk=self.game.gameday_id)
        except Gameinfo.DoesNotExist:
            return []

        ranked = wrapper.get_stage_standings(stage_name)
        if ranked.empty:
            return []

        team_ids = ranked[TEAM_ID].tolist()
        teams_by_id = {t.id: t for t in Team.objects.filter(id__in=team_ids)}
        return [teams_by_id[tid] for tid in team_ids if tid in teams_by_id]
