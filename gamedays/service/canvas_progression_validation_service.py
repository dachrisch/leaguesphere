"""Publish-time guard for gameday-designer progression references (#2038).

The designer lets an organizer wire a later game's home/away slot to the
winner/loser of an earlier game, or to a stage's rank. Those references are
only resolved by ``CanvasBracketProgressionService`` once a game completes, so
a broken reference (e.g. a ``matchName`` that no game has, or one that several
games share) used to fail silently on game day. This validator surfaces the
problem before the gameday is published.

The authoritative link for home/away winner/loser references is the maintained
``gameToGame`` canvas edge (source game node -> target game node + slot), which
stays correct even when several games share a ``standing``. ``matchName`` matching
is only used as a fallback for imported/template graphs without edges — and then
it must resolve to exactly one game.
"""

from dataclasses import dataclass, field

from gamedays.models import GamedayDesignerState

_GAME_REF_TYPES = ("winner", "loser")
_RANK_REF_TYPES = ("rank", "groupRank")


@dataclass
class ProgressionIssue:
    code: str
    message: str
    node_ids: list = field(default_factory=list)


class ProgressionValidationError(Exception):
    def __init__(self, issues):
        self.issues = list(issues)
        super().__init__("; ".join(issue.message for issue in self.issues))


def validate_progression_for_gameday(gameday):
    """Validate a gameday's designer canvas progression, if it has one.

    Returns a (possibly empty) list of ``ProgressionIssue``. Gamedays without a
    designer state (legacy/JSON-created) always pass — there is nothing to
    resolve at runtime for them."""
    try:
        state = GamedayDesignerState.objects.get(gameday=gameday)
    except GamedayDesignerState.DoesNotExist:
        return []
    return CanvasProgressionValidator(state.state_data or {}).validate()


class CanvasProgressionValidator:
    def __init__(self, state_data):
        self.state_data = state_data or {}
        self.nodes = self.state_data.get("nodes", [])
        self.edges = self.state_data.get("edges", [])
        self.game_nodes = [n for n in self.nodes if n.get("type") == "game"]
        self.stage_nodes = [n for n in self.nodes if n.get("type") == "stage"]
        self.game_by_id = {n["id"]: n for n in self.game_nodes if n.get("id")}
        self.stage_by_id = {n["id"]: n for n in self.stage_nodes if n.get("id")}
        self.stage_by_name = {
            n.get("data", {}).get("name"): n for n in self.stage_nodes
        }
        self._standing_index = {}
        self._game_source = {}
        self._stage_ref = {}
        self.issues = []
        self._seen = set()

    # -- public ---------------------------------------------------------

    def validate(self):
        self.issues = []
        self._seen = set()
        self._standing_index = {}
        self._game_source = {}
        self._stage_ref = {}

        for node in self.game_nodes:
            standing = node.get("data", {}).get("standing")
            if standing:
                self._standing_index.setdefault(standing, []).append(node)

        for node in self.game_nodes:
            self._validate_game_refs(node)

        self._detect_cycles()
        return self.issues

    # -- ref resolution (mirrors CanvasBracketProgressionService) --------

    @staticmethod
    def _ref_for(node, slot):
        data = node.get("data", {})
        if slot == "home":
            return data.get("homeTeamDynamic")
        if slot == "away":
            return data.get("awayTeamDynamic")
        return data.get("official")

    def _find_edge(self, target_id, slot):
        for edge in self.edges:
            if (
                edge.get("type") == "gameToGame"
                and edge.get("target") == target_id
                and edge.get("targetHandle") == slot
            ):
                return edge
        return None

    def _add(self, code, message, node_ids):
        key = (code, message)
        if key in self._seen:
            return
        self._seen.add(key)
        self.issues.append(
            ProgressionIssue(code=code, message=message, node_ids=list(node_ids))
        )

    # -- validation ------------------------------------------------------

    def _validate_game_refs(self, node):
        node_id = node.get("id")
        if not node_id:
            return
        label = node.get("data", {}).get("standing") or node_id

        for slot in ("home", "away"):
            ref = self._ref_for(node, slot)
            if not ref:
                continue
            ref_type = ref.get("type")
            if ref_type in _GAME_REF_TYPES:
                source = self._resolve_game_source(node, slot, ref, label)
                if source is not None:
                    self._game_source[(node_id, slot)] = source.get("id")
            elif ref_type in _RANK_REF_TYPES:
                stage = self._resolve_stage(ref)
                if stage is None:
                    self._add(
                        "missing_stage",
                        f'Game "{label}" references stage "{ref.get("stageName", "")}" '
                        f"for {slot}, but no such stage exists.",
                        [node_id],
                    )
                else:
                    self._stage_ref[(node_id, slot)] = stage.get("id")
                    self._check_rank_place(node, slot, ref, stage, label)

        official = self._ref_for(node, "official")
        if official and official.get("type") in _GAME_REF_TYPES:
            self._resolve_game_source(node, "official", official, label)

    def _resolve_game_source(self, node, slot, ref, label):
        """Return the producing game node, or None (recording an issue)."""
        node_id = node.get("id")
        if slot in ("home", "away"):
            edge = self._find_edge(node_id, slot)
            if edge is not None:
                source = self.game_by_id.get(edge.get("source"))
                if source is None:
                    self._add(
                        "dangling_reference",
                        f'Game "{label}" is wired to a winner/loser of a game '
                        f"that no longer exists.",
                        [node_id],
                    )
                    return None
                if source.get("id") == node_id:
                    self._add(
                        "self_reference",
                        f'Game "{label}" references its own winner/loser.',
                        [node_id],
                    )
                    return None
                return source

        match = ref.get("matchName")
        candidates = self._standing_index.get(match, []) if match else []
        if not candidates:
            self._add(
                "dangling_reference",
                f'Game "{label}" references "{match}" for {slot}, but no game '
                f"produces it.",
                [node_id],
            )
            return None
        if len(candidates) > 1:
            self._add(
                "ambiguous_reference",
                f'Game "{label}" references "{match}" for {slot}, but '
                f"{len(candidates)} games share that standing.",
                [node_id],
            )
            return None
        source = candidates[0]
        if source.get("id") == node_id:
            self._add(
                "self_reference",
                f'Game "{label}" references its own winner/loser.',
                [node_id],
            )
            return None
        return source

    def _resolve_stage(self, ref):
        return self.stage_by_id.get(ref.get("stageId")) or self.stage_by_name.get(
            ref.get("stageName")
        )

    def _check_rank_place(self, node, slot, ref, stage, label):
        place = ref.get("place")
        if not isinstance(place, int) or place < 1:
            self._add(
                "rank_out_of_range",
                f'Game "{label}" references an invalid place "{place}" for {slot}.',
                [node.get("id")],
            )
            return
        stage_games = [
            g for g in self.game_nodes if g.get("parentId") == stage.get("id")
        ]
        # A stage has at most two distinct starting teams per game; a placed
        # rank above that upper bound can never resolve.
        if place > 2 * len(stage_games):
            self._add(
                "rank_out_of_range",
                f'Game "{label}" references place {place} for {slot}, but stage '
                f'"{stage.get("data", {}).get("name", "")}" has only '
                f"{len(stage_games)} games.",
                [node.get("id")],
            )

    # -- cycle detection -------------------------------------------------

    def _detect_cycles(self):
        units = {}
        for node in self.game_nodes:
            if node.get("id"):
                units[f"game:{node['id']}"] = set()
        for node in self.stage_nodes:
            if node.get("id"):
                units[f"stage:{node['id']}"] = set()

        for (node_id, _slot), source_id in self._game_source.items():
            if source_id:
                units[f"game:{node_id}"].add(f"game:{source_id}")
        for (node_id, _slot), stage_id in self._stage_ref.items():
            if stage_id:
                units[f"game:{node_id}"].add(f"stage:{stage_id}")
        for node in self.game_nodes:
            parent = node.get("parentId")
            if parent and f"stage:{parent}" in units and node.get("id"):
                units[f"stage:{parent}"].add(f"game:{node['id']}")

        visited = set()
        in_stack = set()

        def find_cycle(key, path):
            if key in in_stack:
                return path[path.index(key):]
            if key in visited:
                return None
            visited.add(key)
            in_stack.add(key)
            try:
                for dep in units.get(key, ()):
                    cycle = find_cycle(dep, [*path, key])
                    if cycle:
                        return cycle
                return None
            finally:
                in_stack.discard(key)

        for key in units:
            if key in visited:
                continue
            cycle = find_cycle(key, [])
            if cycle:
                labels = [self._unit_label(k) for k in cycle]
                self._add(
                    "unresolved_cycle",
                    "Circular progression: " + " -> ".join([*labels, labels[0]]),
                    [k.split(":", 1)[1] for k in cycle],
                )
                return

    def _unit_label(self, key):
        kind, unit_id = key.split(":", 1)
        if kind == "game":
            node = self.game_by_id.get(unit_id)
            return node.get("data", {}).get("standing") if node else unit_id
        node = self.stage_by_id.get(unit_id)
        return node.get("data", {}).get("name") if node else unit_id
