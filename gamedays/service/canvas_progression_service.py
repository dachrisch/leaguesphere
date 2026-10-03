from django.utils import timezone

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

        state_data = state.state_data or {}
        nodes = state_data.get("nodes", [])
        edges = state_data.get("edges", [])
        game_nodes = [n for n in nodes if n.get("type") == "game"]

        winner_team, loser_team = self._resolve_winner_loser()
        if winner_team is not None or loser_team is not None:
            self._propagate(
                game_nodes,
                lambda node, slot: self._winner_loser_team_for(
                    node, slot, edges, winner_team, loser_team
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

    def _winner_loser_team_for(self, node, slot, edges, winner_team, loser_team):
        """Resolve a target slot's winner/loser reference to a team.

        Primary key is the maintained ``gameToGame`` edge (source game node ->
        target game node + slot): unambiguous even when several games share a
        ``standing``, and independent of the human-readable ``matchName``. The
        legacy ``matchName == this game's standing`` match is kept as a fallback
        for imported/template graphs that carry no edges. See #2038.
        """
        ref = self._ref_for(node, slot)
        if not ref or ref.get("type") not in ("winner", "loser"):
            return None

        if slot in ("home", "away") and self.game.designer_node_id:
            edge = self._find_edge(edges, node.get("id"), slot)
            if edge is not None:
                # An edge is authoritative: never silently fall back to the
                # (possibly stale) matchName when the edge wired a winner/loser.
                source_handle = edge.get("sourceHandle")
                return winner_team if source_handle == "winner" else loser_team

        if ref.get("matchName") and ref.get("matchName") == self.game.standing:
            return winner_team if ref.get("type") == "winner" else loser_team
        return None

    def _find_edge(self, edges, target_id, slot):
        for edge in edges:
            if (
                edge.get("type") == "gameToGame"
                and edge.get("target") == target_id
                and edge.get("targetHandle") == slot
                and edge.get("source") == self.game.designer_node_id
            ):
                return edge
        return None

    @staticmethod
    def _ref_for(node, slot):
        data = node.get("data", {})
        if slot == "home":
            return data.get("homeTeamDynamic")
        if slot == "away":
            return data.get("awayTeamDynamic")
        return data.get("official")

    def _propagate(self, game_nodes, resolve_ref) -> None:
        """For every game node, resolve its home/away/official dynamic refs
        via `resolve_ref` (a (node, slot) -> Team or None) and write the result
        to the matching slot wherever it resolves to a team."""
        for node in game_nodes:
            data = node.get("data", {})
            if not data.get("standing"):
                continue
            self._apply_team(node, True, resolve_ref(node, "home"))
            self._apply_team(node, False, resolve_ref(node, "away"))
            self._apply_official(node, resolve_ref(node, "official"))

    def _target_gameinfo(self, node):
        """Resolve the Gameinfo a canvas game node maps to.

        Primary: the stable ``designer_node_id`` stamped at publish time, which
        stays correct when several games share a ``standing``. Fallback: a
        standing match for gamedays published before that column existed — uses
        ``.first()`` so duplicated standings can never raise
        ``MultipleObjectsReturned`` (see #2038)."""
        node_id = node.get("id")
        if node_id:
            gi = Gameinfo.objects.filter(
                gameday=self.game.gameday, designer_node_id=node_id
            ).first()
            if gi is not None:
                return gi
        standing = node.get("data", {}).get("standing")
        if standing:
            return Gameinfo.objects.filter(
                gameday=self.game.gameday, standing=standing
            ).first()
        return None

    def _apply_team(self, node, is_home, team) -> None:
        if team is None:
            return
        gi = self._target_gameinfo(node)
        if gi is None:
            return
        # Queryset .update() bypasses save(), so auto_now would not fire:
        # stamp explicitly. The snapshot ETag depends on Max(updated_at).
        Gameresult.objects.filter(gameinfo=gi, isHome=is_home).update(
            team=team, updated_at=timezone.now()
        )

    def _apply_official(self, node, team) -> None:
        if team is None:
            return
        gi = self._target_gameinfo(node)
        if gi is None:
            return
        Gameinfo.objects.filter(pk=gi.pk).update(
            officials=team, updated_at=timezone.now()
        )

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
            lambda node, slot: self._resolve_rank_ref(
                self._ref_for(node, slot), stage_name, standings
            ),
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
