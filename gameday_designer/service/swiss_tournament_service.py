"""
Swiss-system tournament service (issue #1970, Path B slice 1).

Runs the organizer control loop on top of real gameday data:

- ``setup()`` persists the tournament config (seed order, rounds, fields,
  game duration, per-round start times) into ``GamedayDesignerState`` under
  the ``"swiss"`` key, alongside — never instead of — the canvas ``"nodes"``.
- ``standings()`` computes the live table from COMPLETED Swiss-stage games
  (win = 2, draw = 1, loss = 0 — the same convention as
  ``CanvasBracketProgressionService._compute_stage_standings``) plus 2 pts
  per bye recorded in the state. Bye stays a standings-only adjustment; no
  synthetic ``Gameinfo`` row is created.
- ``generate_round()`` resolves the next round via ``SwissRoundResolver``
  (or a validated full-manual ``overrides`` envelope) and materializes it
  as ``Gameinfo``/``Gameresult`` rows plus designer Game nodes under
  ``swiss-round-{n}``. Round 1 needs no prior results; later rounds are
  gated on every game of the previous round being COMPLETED, and generation
  stops after the configured round count.

Team identity inside the resolver is the ``str``-ified ``Team`` PK; the
service maps back to rows at the boundary.
"""

from datetime import time as dtime
from typing import Dict, List, Optional

from django.db import transaction

from gamedays.models import (
    Gameday,
    GamedayDesignerState,
    Gameinfo,
    Gameresult,
    Team,
)
from gamedays.service.canvas_publish_service import OFFICIALS_PLACEHOLDER
from gameday_designer.service.swiss_round_resolver import (
    SwissRoundResolver,
    SwissRoundResult,
)
from gameday_designer.service.time_service import TimeService

SWISS_STAGE = "Swiss"

SWISS_NODE_PREFIX = "swiss-"

MIN_ROUNDS = 2
MAX_ROUNDS = 8
MIN_FIELDS = 1
MAX_FIELDS = 4
MIN_DURATION = 15
MAX_DURATION = 60
BREAK_MINUTES = 10


class SwissTournamentError(Exception):
    """Raised for invalid Swiss setup or gated round generation."""


class SwissTournamentService:
    """Organizer control loop for one Swiss-system gameday."""

    def __init__(self, gameday: Gameday):
        self.gameday = gameday

    # -- setup -----------------------------------------------------------

    @transaction.atomic
    def setup(
        self,
        seed_team_ids: List[int],
        rounds: int,
        fields: int,
        game_duration: int,
        round_start_overrides: Optional[Dict[int, str]] = None,
    ) -> dict:
        """Persist the tournament config; return it with round start times.

        Also seeds the designer canvas (``state_data["nodes"]``) with Field
        nodes ``1..F``, Stage nodes ``Round 1..N`` (``progressionMode:
        'swiss'``) and placeholder Game nodes ``Swiss R{r}-G{i}`` for rounds
        ``2..N``. Round 1 games are materialized later by ``generate_round``.
        Unrelated nodes are merged by id, never wiped; prior ``swiss-*``
        nodes are replaced so re-running setup stays duplicate-free.
        """
        self._validate_setup(seed_team_ids, rounds, fields, game_duration)
        overrides = self._validate_overrides(round_start_overrides or {}, rounds)
        state, _ = GamedayDesignerState.objects.get_or_create(gameday=self.gameday)
        state_data = dict(state.state_data or {})
        config = {
            "seedOrder": list(seed_team_ids),
            "rounds": rounds,
            "fields": fields,
            "gameDuration": game_duration,
            "roundStartTimes": self._round_start_times(
                len(seed_team_ids), rounds, fields, game_duration, overrides
            ),
            "completedRounds": [],
            "byes": {},
        }
        state_data["swiss"] = config
        kept = [
            node
            for node in (state_data.get("nodes") or [])
            if not str(node.get("id", "")).startswith(SWISS_NODE_PREFIX)
        ]
        state_data["nodes"] = kept + self._swiss_canvas_nodes(
            seed_team_ids=list(seed_team_ids),
            rounds=rounds,
            fields=fields,
            game_duration=game_duration,
            round_start_times=config["roundStartTimes"],
        )
        state.state_data = state_data
        state.save()
        return config

    def get_config(self) -> Optional[dict]:
        """Return the stored Swiss config, or None when not set up."""
        try:
            state = GamedayDesignerState.objects.get(gameday=self.gameday)
        except GamedayDesignerState.DoesNotExist:
            return None
        return (state.state_data or {}).get("swiss")

    # -- standings --------------------------------------------------------

    def standings(self) -> List[dict]:
        """Live table ordered by points (desc), then seed (asc)."""
        config = self._require_config()
        seed_index = {tid: i for i, tid in enumerate(config["seedOrder"])}
        table = {
            tid: {
                "team_id": tid,
                "team_name": "",
                "seed": seed_index[tid],
                "played": 0,
                "wins": 0,
                "draws": 0,
                "losses": 0,
                "points_for": 0,
                "points_against": 0,
                "byes": 0,
                "points": 0,
            }
            for tid in config["seedOrder"]
        }
        for team in Team.objects.filter(pk__in=list(table)):
            table[team.pk]["team_name"] = team.description or team.name

        games = (
            Gameinfo.objects.filter(
                gameday=self.gameday,
                stage=SWISS_STAGE,
                status=Gameinfo.STATUS_COMPLETED,
            )
            .prefetch_related("gameresult_set__team")
            .order_by("pk")
        )
        for game in games:
            results = list(game.gameresult_set.all())
            home = next((r for r in results if r.isHome), None)
            away = next((r for r in results if not r.isHome), None)
            if (
                not home
                or not away
                or not home.team
                or not away.team
                or home.team_id not in table
                or away.team_id not in table
            ):
                continue
            home_total = (home.fh or 0) + (home.sh or 0)
            away_total = (away.fh or 0) + (away.sh or 0)
            self._accumulate(table[home.team_id], home_total, away_total)
            self._accumulate(table[away.team_id], away_total, home_total)

        for team_id_str, _round in (config.get("byes") or {}).items():
            team_id = int(team_id_str)
            if team_id in table:
                table[team_id]["byes"] += 1
                table[team_id]["points"] += SwissRoundResolver.BYE_POINTS

        return sorted(table.values(), key=lambda row: (-row["points"], row["seed"]))

    # -- round generation --------------------------------------------------

    def preview_round(self) -> dict:
        """Resolve the next round without writing anything."""
        config = self._require_config()
        completed = config.get("completedRounds") or []
        next_round = len(completed) + 1
        if next_round > config["rounds"]:
            raise SwissTournamentError(
                f"tournament configured for {config['rounds']} rounds; "
                f"round {next_round} does not exist"
            )
        if completed:
            last_round = completed[-1]
            game_ids = last_round.get("gameIds", [])
            games = list(Gameinfo.objects.filter(pk__in=game_ids))
            if len(games) != len(game_ids) or any(
                game.status != Gameinfo.STATUS_COMPLETED for game in games
            ):
                raise SwissTournamentError(
                    f"round {last_round['round']} is not fully completed; "
                    "confirm all results before generating the next round"
                )

        seed_order = [str(tid) for tid in config["seedOrder"]]
        table = {row["team_id"]: row for row in self.standings()}
        points = {str(tid): row["points"] for tid, row in table.items()}
        teams_with_bye = {str(tid) for tid in self._bye_team_ids(config)}
        previous_pairings = self._previous_pairings(completed)

        result: SwissRoundResult = SwissRoundResolver.resolve_round(
            seed_order=seed_order,
            points=points,
            teams_with_bye=teams_with_bye,
            previous_pairings=previous_pairings,
        )
        return {
            "round": next_round,
            "pairings": [
                {"home_team_id": int(home_id), "away_team_id": int(away_id)}
                for home_id, away_id in result.pairings
            ],
            "bye_team_id": int(result.bye) if result.bye is not None else None,
            "game_ids": [],
        }

    @transaction.atomic
    def generate_round(self, overrides: Optional[dict] = None) -> dict:
        """Resolve and materialize the next round; gated on confirmed results.

        Without overrides the round comes from ``SwissRoundResolver`` via
        ``preview_round()``. With overrides (the operator-confirmed pairings
        from the adjust dialog) the round is built from
        ``{"pairings": [{home_team_id, away_team_id, field?, start_time?}],
        bye_team_id?}`` after validating team coverage, field range, and
        times. Either way the round is written as ``Gameinfo``/``Gameresult``
        rows plus designer Game nodes under ``swiss-round-{n}``.
        """
        preview = self.preview_round()
        config = self._require_config()
        completed = config.get("completedRounds") or []
        next_round = preview["round"]
        if overrides:
            pairings, bye, per_game = self._validate_generate_overrides(
                overrides, config
            )
            result = SwissRoundResult(pairings=pairings, bye=bye)
        else:
            # floaters from SwissRoundResult are intentionally discarded at the
            # service boundary because _materialize_round only needs
            # pairings/bye.
            result = SwissRoundResult(
                pairings=[
                    (str(p["home_team_id"]), str(p["away_team_id"]))
                    for p in preview["pairings"]
                ],
                bye=(
                    str(preview["bye_team_id"])
                    if preview["bye_team_id"] is not None
                    else None
                ),
            )
            per_game = None
        return self._materialize_round(config, completed, next_round, result, per_game)

    # -- internals ----------------------------------------------------------

    def _require_config(self) -> dict:
        config = self.get_config()
        if not config:
            raise SwissTournamentError(
                "gameday has no Swiss tournament setup; call setup() first"
            )
        return config

    @staticmethod
    def _validate_setup(
        seed_team_ids: List[int], rounds: int, fields: int, game_duration: int
    ) -> None:
        if len(seed_team_ids) < 2:
            raise SwissTournamentError("Swiss tournaments need at least 2 teams")
        if len(set(seed_team_ids)) != len(seed_team_ids):
            raise SwissTournamentError("seed order contains duplicate teams")
        existing = set(
            Team.objects.filter(pk__in=seed_team_ids).values_list("pk", flat=True)
        )
        unknown = [tid for tid in seed_team_ids if tid not in existing]
        if unknown:
            raise SwissTournamentError(f"unknown teams in seed order: {unknown}")
        if not MIN_ROUNDS <= rounds <= MAX_ROUNDS:
            raise SwissTournamentError(
                f"rounds must be between {MIN_ROUNDS} and {MAX_ROUNDS}"
            )
        if not MIN_FIELDS <= fields <= MAX_FIELDS:
            raise SwissTournamentError(
                f"fields must be between {MIN_FIELDS} and {MAX_FIELDS}"
            )
        if not MIN_DURATION <= game_duration <= MAX_DURATION:
            raise SwissTournamentError(
                f"game duration must be between {MIN_DURATION} and {MAX_DURATION}"
            )

    @staticmethod
    def _validate_overrides(overrides: Dict[int, str], rounds: int) -> Dict[int, str]:
        validated = {}
        for round_no, start_time in overrides.items():
            round_no = int(round_no)
            if not 1 <= round_no <= rounds:
                raise SwissTournamentError(
                    f"start-time override for unknown round {round_no}"
                )
            try:
                hour, minute = (int(part) for part in str(start_time).split(":"))
                validated[round_no] = dtime(hour, minute).strftime("%H:%M")
            except (ValueError, TypeError) as exc:
                raise SwissTournamentError(
                    f"invalid start-time override {start_time!r} " "(expected HH:MM)"
                ) from exc
        return validated

    def _round_start_times(
        self,
        team_count: int,
        rounds: int,
        fields: int,
        game_duration: int,
        overrides: Dict[int, str],
    ) -> Dict[str, str]:
        games_per_round = (team_count + 1) // 2
        slots_per_field = (games_per_round + fields - 1) // fields
        round_length = slots_per_field * (game_duration + BREAK_MINUTES)
        start = self.gameday.start
        times = {}
        for round_no in range(1, rounds + 1):
            if round_no in overrides:
                times[str(round_no)] = overrides[round_no]
            else:
                times[str(round_no)] = TimeService.add_minutes(
                    start, (round_no - 1) * round_length
                ).strftime("%H:%M")
        return times

    @staticmethod
    def _swiss_canvas_nodes(
        seed_team_ids: List[int],
        rounds: int,
        fields: int,
        game_duration: int,
        round_start_times: Dict[str, str],
    ) -> List[dict]:
        """Build Field/Stage/placeholder-Game nodes matching frontend shapes.

        Shapes mirror ``createFieldNode``/``createStageNode``/
        ``createGameNodeInStage`` in ``gameday_designer/src/types/flowchart.ts``
        (``Field > Stage > Game`` via ``parentId``), which is what
        ``ListCanvas``/``FieldSection``/``StageSection`` render.
        """
        nodes: List[dict] = []
        for field_no in range(1, fields + 1):
            nodes.append(
                {
                    "id": f"{SWISS_NODE_PREFIX}field-{field_no}",
                    "type": "field",
                    "position": {"x": 50, "y": 50},
                    "data": {
                        "type": "field",
                        "name": f"Feld {field_no}",
                        "order": field_no - 1,
                    },
                }
            )
        games_per_round = (len(seed_team_ids) + 1) // 2
        for round_no in range(1, rounds + 1):
            stage_id = f"{SWISS_NODE_PREFIX}round-{round_no}"
            nodes.append(
                {
                    "id": stage_id,
                    "type": "stage",
                    "parentId": f"{SWISS_NODE_PREFIX}field-1",
                    "position": {"x": 20, "y": 60},
                    "data": {
                        "type": "stage",
                        "name": f"Round {round_no}",
                        "category": "preliminary",
                        "stageType": "STANDARD",
                        "order": round_no - 1,
                        "progressionMode": "swiss",
                        "progressionConfig": {
                            "mode": "swiss",
                            "rounds": rounds,
                            "seedOrder": [str(t) for t in seed_team_ids],
                            "byePoints": SwissRoundResolver.BYE_POINTS,
                        },
                        "startTime": round_start_times[str(round_no)],
                        "defaultGameDuration": game_duration,
                        "defaultBreakBetweenGames": BREAK_MINUTES,
                    },
                }
            )
            if round_no == 1:
                continue
            for game_no in range(1, games_per_round + 1):
                nodes.append(
                    {
                        "id": f"{SWISS_NODE_PREFIX}r{round_no}-g{game_no}",
                        "type": "game",
                        "parentId": stage_id,
                        "position": {"x": 30, "y": 50},
                        "data": {
                            "type": "game",
                            "stage": f"Round {round_no}",
                            "stageType": "STANDARD",
                            "standing": f"Swiss R{round_no}-G{game_no}",
                            "fieldId": None,
                            "official": None,
                            "breakAfter": 0,
                            "homeTeamId": None,
                            "awayTeamId": None,
                            "homeTeamDynamic": None,
                            "awayTeamDynamic": None,
                            "duration": game_duration,
                            "startTime": round_start_times[str(round_no)],
                            "manualTime": False,
                        },
                    }
                )
        return nodes

    @staticmethod
    def _accumulate(entry: dict, scored: int, conceded: int) -> None:
        entry["played"] += 1
        entry["points_for"] += scored
        entry["points_against"] += conceded
        if scored > conceded:
            entry["wins"] += 1
            entry["points"] += 2
        elif scored == conceded:
            entry["draws"] += 1
            entry["points"] += 1
        else:
            entry["losses"] += 1

    @staticmethod
    def _bye_team_ids(config: dict) -> List[int]:
        return [int(tid) for tid in (config.get("byes") or {}).keys()]

    @staticmethod
    def _previous_pairings(completed: List[dict]) -> set:
        game_ids = [gid for round_ in completed for gid in round_.get("gameIds", [])]
        pairings = set()
        results = Gameresult.objects.filter(gameinfo_id__in=game_ids).select_related(
            "team"
        )
        by_game: Dict[int, list] = {}
        for result in results:
            if result.team_id is not None:
                by_game.setdefault(result.gameinfo_id, []).append(str(result.team_id))
        for team_ids in by_game.values():
            if len(team_ids) == 2:
                pairings.add(frozenset(team_ids))
        return pairings

    @staticmethod
    def _parse_override_time(value) -> str:
        try:
            hour, minute = (int(part) for part in str(value).split(":"))
            return dtime(hour, minute).strftime("%H:%M")
        except (ValueError, TypeError, AttributeError) as exc:
            raise SwissTournamentError(
                f"invalid start_time {value!r} (expected HH:MM)"
            ) from exc

    @staticmethod
    def _validate_generate_overrides(
        overrides: dict, config: dict
    ) -> tuple:
        """Validate a full-manual override envelope against the tournament.

        Returns ``(pairings, bye, per_game)`` with str team ids, where
        ``per_game`` aligns with ``pairings`` as
        ``{"field": int | None, "start_time": "HH:MM" | None}``.
        """
        raw_pairings = (overrides or {}).get("pairings") or []
        if not raw_pairings:
            raise SwissTournamentError("overrides must include at least one pairing")
        seed_set = set(config["seedOrder"])
        try:
            bye = overrides.get("bye_team_id")
            bye_id = int(bye) if bye is not None else None
        except (TypeError, ValueError) as exc:
            raise SwissTournamentError(
                f"invalid bye_team_id {bye!r} in overrides"
            ) from exc
        if bye_id is not None and bye_id not in seed_set:
            raise SwissTournamentError(
                f"unknown bye team in overrides: {bye_id}"
            )
        if len(seed_set) % 2 == 0:
            if bye_id is not None:
                raise SwissTournamentError(
                    "even team count needs no bye; drop bye_team_id"
                )
        elif bye_id is None:
            raise SwissTournamentError(
                "odd team count needs a bye_team_id in overrides"
            )
        pairings = []
        per_game: List[dict] = []
        seen: List[int] = []
        for entry in raw_pairings:
            try:
                home = int(entry["home_team_id"])
                away = int(entry["away_team_id"])
            except (KeyError, TypeError, ValueError) as exc:
                raise SwissTournamentError(
                    f"invalid pairing in overrides: {entry!r}"
                ) from exc
            for tid in (home, away):
                if tid not in seed_set:
                    raise SwissTournamentError(
                        f"unknown team in overrides: {tid}"
                    )
            seen.extend([home, away])
            field = entry.get("field")
            if field is not None:
                try:
                    field = int(field)
                except (TypeError, ValueError) as exc:
                    raise SwissTournamentError(
                        f"invalid field {field!r} in overrides"
                    ) from exc
                if not 1 <= field <= config["fields"]:
                    raise SwissTournamentError(
                        f"field {field} out of range 1..{config['fields']}"
                    )
            start_time = entry.get("start_time")
            if start_time is not None:
                start_time = SwissTournamentService._parse_override_time(start_time)
            pairings.append((str(home), str(away)))
            per_game.append({"field": field, "start_time": start_time})
        if len(set(seen)) != len(seen):
            dupes = sorted({tid for tid in seen if seen.count(tid) > 1})
            raise SwissTournamentError(
                f"overrides contain duplicate teams: {dupes}"
            )
        if bye_id is not None and bye_id in seen:
            raise SwissTournamentError(
                f"bye team {bye_id} is also paired in overrides"
            )
        covered = set(seen)
        if bye_id is not None:
            covered.add(bye_id)
        if covered != seed_set:
            missing = sorted(seed_set - covered)
            raise SwissTournamentError(
                f"overrides do not cover all teams: missing {missing}"
            )
        return pairings, str(bye_id) if bye_id is not None else None, per_game

    def _materialize_round(
        self,
        config: dict,
        completed: List[dict],
        next_round: int,
        result: SwissRoundResult,
        per_game: Optional[List[dict]] = None,
    ) -> dict:
        default_start = config["roundStartTimes"][str(next_round)]
        officials, _ = Team.objects.get_or_create(
            name=OFFICIALS_PLACEHOLDER,
            defaults={"description": OFFICIALS_PLACEHOLDER, "location": ""},
        )
        teams = {
            team.pk: team
            for team in Team.objects.filter(
                pk__in=[int(tid) for pair in result.pairings for tid in pair]
            )
        }
        pairings = []
        game_ids = []
        game_fields = []
        game_times = []
        for idx, (home_id, away_id) in enumerate(result.pairings, start=1):
            detail = (per_game[idx - 1] if per_game else None) or {}
            field = (
                detail.get("field")
                if detail.get("field") is not None
                else ((idx - 1) % config["fields"]) + 1
            )
            start_time = detail.get("start_time") or default_start
            hour, minute = (int(part) for part in start_time.split(":"))
            scheduled = dtime(hour, minute)
            game = Gameinfo.objects.create(
                gameday=self.gameday,
                scheduled=scheduled,
                field=field,
                stage=SWISS_STAGE,
                standing=f"Swiss R{next_round}-G{idx}",
                officials=officials,
                status=Gameinfo.STATUS_PUBLISHED,
            )
            Gameresult.objects.create(
                gameinfo=game, team=teams[int(home_id)], isHome=True
            )
            Gameresult.objects.create(
                gameinfo=game, team=teams[int(away_id)], isHome=False
            )
            pairings.append(
                {"home_team_id": int(home_id), "away_team_id": int(away_id)}
            )
            game_ids.append(game.pk)
            game_fields.append(field)
            game_times.append(start_time)

        bye_team_id = int(result.bye) if result.bye is not None else None
        completed.append({"round": next_round, "gameIds": game_ids, "bye": bye_team_id})
        byes = dict(config.get("byes") or {})
        if bye_team_id is not None:
            byes[str(bye_team_id)] = next_round
        config["completedRounds"] = completed
        config["byes"] = byes

        state = GamedayDesignerState.objects.get(gameday=self.gameday)
        state_data = dict(state.state_data or {})
        state_data["swiss"] = config
        stage_id = f"{SWISS_NODE_PREFIX}round-{next_round}"
        round_prefix = f"{SWISS_NODE_PREFIX}r{next_round}-g"
        nodes = [
            node
            for node in (state_data.get("nodes") or [])
            if not (
                node.get("parentId") == stage_id
                and str(node.get("id", "")).startswith(round_prefix)
            )
        ]
        for idx, ((home_id, away_id), field, start_time) in enumerate(
            zip(result.pairings, game_fields, game_times), start=1
        ):
            manual = bool(per_game and (per_game[idx - 1] or {}).get("start_time"))
            nodes.append(
                {
                    "id": f"{round_prefix}{idx}",
                    "type": "game",
                    "parentId": stage_id,
                    "position": {"x": 30, "y": 50},
                    "data": {
                        "type": "game",
                        "stage": f"Round {next_round}",
                        "stageType": "STANDARD",
                        "standing": f"Swiss R{next_round}-G{idx}",
                        "fieldId": f"{SWISS_NODE_PREFIX}field-{field}",
                        "official": None,
                        "breakAfter": 0,
                        "homeTeamId": str(home_id),
                        "awayTeamId": str(away_id),
                        "homeTeamDynamic": None,
                        "awayTeamDynamic": None,
                        "duration": config["gameDuration"],
                        "startTime": start_time,
                        "manualTime": manual,
                    },
                }
            )
        state_data["nodes"] = nodes
        state.state_data = state_data
        state.save()

        return {
            "round": next_round,
            "pairings": pairings,
            "bye_team_id": bye_team_id,
            "game_ids": game_ids,
        }
