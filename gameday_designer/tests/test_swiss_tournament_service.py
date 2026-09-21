"""
Tests for SwissTournamentService (issue #1970, Path B slice 1).

Covers tournament setup (seed order + rounds/fields/duration persisted on
GamedayDesignerState), standings computation from completed Swiss games
(win=2/draw=1/loss=0 plus 2 pts per bye), and round generation gated on
confirmed results.
"""

import datetime

import pytest
from django.contrib.auth.models import User

from gamedays.models import (
    Gameday,
    Gameinfo,
    Gameresult,
    GamedayDesignerState,
    League,
    Season,
    Team,
)
from gameday_designer.service.swiss_tournament_service import (
    SwissTournamentError,
    SwissTournamentService,
)


def make_gameday(name="Swiss Gameday"):
    season = Season.objects.create(name="2026")
    league = League.objects.create(name="Swiss League")
    user = User.objects.create(username=f"author-{name}")
    return Gameday.objects.create(
        name=name,
        season=season,
        league=league,
        date=datetime.date.today(),
        start=datetime.time(9, 0),
        format="swiss",
        author=user,
    )


def make_teams(n, prefix="T"):
    teams = []
    for i in range(n):
        teams.append(
            Team.objects.create(
                name=f"{prefix}{i}",
                description=f"{prefix} team {i}",
                location="Test City",
            )
        )
    return teams


def complete_game(gameinfo, home_score, away_score):
    """Mark a generated game played: split totals across halves, complete it."""
    for result in Gameresult.objects.filter(gameinfo=gameinfo):
        total = home_score if result.isHome else away_score
        result.fh = total
        result.sh = 0
        result.save()
    gameinfo.status = Gameinfo.STATUS_COMPLETED
    gameinfo.save()


@pytest.mark.django_db
class TestSwissSetup:
    def test_setup_stores_config_and_round_times(self):
        gameday = make_gameday()
        teams = make_teams(6)
        service = SwissTournamentService(gameday)

        config = service.setup(
            seed_team_ids=[t.pk for t in teams],
            rounds=4,
            fields=2,
            game_duration=30,
        )

        assert config["rounds"] == 4
        assert config["seedOrder"] == [t.pk for t in teams]
        assert len(config["roundStartTimes"]) == 4
        # 6 teams -> 3 games/round, 2 fields -> 2 slots/field,
        # 2 * (30 + 10) = 80 min rounds from 09:00.
        assert config["roundStartTimes"]["1"] == "09:00"
        assert config["roundStartTimes"]["2"] == "10:20"

        state = GamedayDesignerState.objects.get(gameday=gameday)
        assert state.state_data["swiss"]["rounds"] == 4
        assert state.state_data["swiss"]["completedRounds"] == []

    def test_setup_accepts_per_round_time_override(self):
        gameday = make_gameday()
        teams = make_teams(4)
        service = SwissTournamentService(gameday)

        config = service.setup(
            seed_team_ids=[t.pk for t in teams],
            rounds=2,
            fields=2,
            game_duration=30,
            round_start_overrides={2: "14:30"},
        )

        assert config["roundStartTimes"]["2"] == "14:30"
        assert config["roundStartTimes"]["1"] == "09:00"

    def test_setup_preserves_existing_canvas_nodes(self):
        gameday = make_gameday()
        teams = make_teams(4)
        GamedayDesignerState.objects.create(
            gameday=gameday, state_data={"nodes": [{"id": "n1"}]}
        )

        SwissTournamentService(gameday).setup(
            seed_team_ids=[t.pk for t in teams],
            rounds=2,
            fields=1,
            game_duration=30,
        )

        state = GamedayDesignerState.objects.get(gameday=gameday)
        # Unrelated nodes are merged by id, never wiped; Swiss nodes are added.
        assert {"id": "n1"} in state.state_data["nodes"]
        assert "swiss" in state.state_data

    def test_setup_rejects_unknown_team(self):
        gameday = make_gameday()
        teams = make_teams(4)

        with pytest.raises(SwissTournamentError):
            SwissTournamentService(gameday).setup(
                seed_team_ids=[t.pk for t in teams] + [999999],
                rounds=2,
                fields=1,
                game_duration=30,
            )

    def test_setup_rejects_bad_counts(self):
        gameday = make_gameday()
        teams = make_teams(4)
        service = SwissTournamentService(gameday)

        with pytest.raises(SwissTournamentError):
            service.setup(
                seed_team_ids=[t.pk for t in teams],
                rounds=1,
                fields=1,
                game_duration=30,
            )
        with pytest.raises(SwissTournamentError):
            service.setup(
                seed_team_ids=[teams[0].pk],
                rounds=2,
                fields=1,
                game_duration=30,
            )

    def test_setup_rejects_duplicate_seeds(self):
        gameday = make_gameday()
        teams = make_teams(4)

        with pytest.raises(SwissTournamentError):
            SwissTournamentService(gameday).setup(
                seed_team_ids=[teams[0].pk, teams[0].pk, teams[1].pk, teams[2].pk],
                rounds=2,
                fields=1,
                game_duration=30,
            )

    def test_setup_refuses_after_round_generated(self):
        gameday = make_gameday()
        teams = make_teams(4)
        service = SwissTournamentService(gameday)
        kwargs = dict(
            seed_team_ids=[t.pk for t in teams],
            rounds=2,
            fields=2,
            game_duration=30,
        )
        service.setup(**kwargs)
        generated = service.generate_round()

        with pytest.raises(SwissTournamentError, match="already has generated rounds"):
            service.setup(**kwargs)

        # Failed setup touches nothing: games stay, round-1 nodes stay,
        # completedRounds still records round 1.
        assert (
            Gameinfo.objects.filter(gameday=gameday, stage="Swiss").count()
            == len(generated["game_ids"])
        )
        state = GamedayDesignerState.objects.get(gameday=gameday)
        round_nodes = [
            n
            for n in state.state_data["nodes"]
            if n.get("parentId") == "swiss-round-1"
        ]
        assert len(round_nodes) == len(generated["game_ids"])
        assert len(state.state_data["swiss"]["completedRounds"]) == 1


@pytest.mark.django_db
class TestSwissSetupSeedsCanvasNodes:
    """setup() seeds Field/Stage/Game canvas nodes (issue #1970, designer-first)."""

    def test_setup_seeds_fields_stages_and_placeholders(self):
        gameday = make_gameday()
        teams = make_teams(6)
        service = SwissTournamentService(gameday)

        service.setup(
            seed_team_ids=[t.pk for t in teams],
            rounds=3,
            fields=2,
            game_duration=30,
        )

        state = GamedayDesignerState.objects.get(gameday=gameday)
        nodes = state.state_data["nodes"]

        swiss_fields = [
            n for n in nodes if n.get("type") == "field" and n["id"].startswith("swiss-")
        ]
        assert len(swiss_fields) == 2

        swiss_stages = [
            n for n in nodes if n.get("type") == "stage" and n["id"].startswith("swiss-")
        ]
        ordered = sorted(swiss_stages, key=lambda s: s["data"]["order"])
        assert [s["data"]["name"] for s in ordered] == ["Round 1", "Round 2", "Round 3"]
        for stage in swiss_stages:
            assert stage["data"].get("progressionMode") == "swiss"

        # Round 1 has zero Game nodes yet (generate_round materializes them).
        round_one = next(s for s in swiss_stages if s["data"]["name"] == "Round 1")
        assert [
            n
            for n in nodes
            if n.get("type") == "game" and n.get("parentId") == round_one["id"]
        ] == []

        # Rounds 2..N each hold placeholder slots with no teams assigned.
        games_per_round = (len(teams) + 1) // 2
        for round_no in (2, 3):
            stage = next(
                s for s in swiss_stages if s["data"]["name"] == f"Round {round_no}"
            )
            games = [
                n
                for n in nodes
                if n.get("type") == "game" and n.get("parentId") == stage["id"]
            ]
            assert len(games) == games_per_round
            assert sorted(g["data"]["standing"] for g in games) == [
                f"Swiss R{round_no}-G{i}" for i in range(1, games_per_round + 1)
            ]
            for game in games:
                assert game["data"].get("homeTeamId") is None
                assert game["data"].get("awayTeamId") is None

        # Swiss config behavior is untouched.
        assert state.state_data["swiss"]["rounds"] == 3
        assert state.state_data["swiss"]["completedRounds"] == []

    def test_setup_keeps_unrelated_nodes(self):
        gameday = make_gameday()
        teams = make_teams(4)
        GamedayDesignerState.objects.create(
            gameday=gameday, state_data={"nodes": [{"id": "n1", "type": "field"}]}
        )

        SwissTournamentService(gameday).setup(
            seed_team_ids=[t.pk for t in teams],
            rounds=2,
            fields=1,
            game_duration=30,
        )

        state = GamedayDesignerState.objects.get(gameday=gameday)
        by_id = {n["id"]: n for n in state.state_data["nodes"]}
        assert by_id["n1"] == {"id": "n1", "type": "field"}
        assert any(n["id"].startswith("swiss-") for n in state.state_data["nodes"])

    def test_setup_rerun_replaces_swiss_nodes_without_duplicates(self):
        gameday = make_gameday()
        teams = make_teams(6)
        service = SwissTournamentService(gameday)
        kwargs = dict(
            seed_team_ids=[t.pk for t in teams],
            fields=2,
            game_duration=30,
        )

        service.setup(rounds=3, **kwargs)
        service.setup(rounds=2, **kwargs)

        state = GamedayDesignerState.objects.get(gameday=gameday)
        nodes = state.state_data["nodes"]
        ids = [n["id"] for n in nodes]
        assert len(ids) == len(set(ids))
        swiss_stages = [
            n for n in nodes if n.get("type") == "stage" and n["id"].startswith("swiss-")
        ]
        assert sorted(s["data"]["name"] for s in swiss_stages) == [
            "Round 1",
            "Round 2",
        ]
        assert state.state_data["swiss"]["rounds"] == 2


@pytest.mark.django_db
class TestSwissStandings:
    def test_empty_standings_follow_seed_order(self):
        gameday = make_gameday()
        teams = make_teams(4)
        service = SwissTournamentService(gameday)
        service.setup(
            seed_team_ids=[t.pk for t in teams],
            rounds=2,
            fields=2,
            game_duration=30,
        )

        table = service.standings()

        assert [row["team_id"] for row in table] == [t.pk for t in teams]
        assert all(row["points"] == 0 for row in table)

    def test_standings_require_setup(self):
        gameday = make_gameday()

        with pytest.raises(SwissTournamentError):
            SwissTournamentService(gameday).standings()

    def test_completed_games_count_win_two_draw_one(self):
        gameday = make_gameday()
        teams = make_teams(4)
        service = SwissTournamentService(gameday)
        service.setup(
            seed_team_ids=[t.pk for t in teams],
            rounds=3,
            fields=2,
            game_duration=30,
        )
        generated = service.generate_round()
        games = list(
            Gameinfo.objects.filter(pk__in=generated["game_ids"]).order_by("pk")
        )
        assert len(games) == 2
        complete_game(games[0], home_score=10, away_score=5)
        complete_game(games[1], home_score=7, away_score=7)

        table = {row["team_id"]: row for row in service.standings()}

        home0 = Gameresult.objects.get(gameinfo=games[0], isHome=True).team_id
        away0 = Gameresult.objects.get(gameinfo=games[0], isHome=False).team_id
        assert table[home0]["points"] == 2
        assert table[away0]["points"] == 0
        home1 = Gameresult.objects.get(gameinfo=games[1], isHome=True).team_id
        assert table[home1]["points"] == 1
        assert table[home1]["wins"] == 0
        assert table[home1]["draws"] == 1

    def test_bye_is_worth_two_points(self):
        gameday = make_gameday()
        teams = make_teams(5)
        service = SwissTournamentService(gameday)
        service.setup(
            seed_team_ids=[t.pk for t in teams],
            rounds=2,
            fields=2,
            game_duration=30,
        )
        generated = service.generate_round()
        assert generated["bye_team_id"] is not None

        table = {row["team_id"]: row for row in service.standings()}

        assert table[generated["bye_team_id"]]["points"] == 2
        assert table[generated["bye_team_id"]]["byes"] == 1


@pytest.mark.django_db
class TestSwissGenerateRound:
    def test_round_one_pairs_seeds_without_results(self):
        gameday = make_gameday()
        teams = make_teams(6)
        service = SwissTournamentService(gameday)
        service.setup(
            seed_team_ids=[t.pk for t in teams],
            rounds=4,
            fields=2,
            game_duration=30,
        )

        generated = service.generate_round()

        assert generated["round"] == 1
        assert generated["bye_team_id"] is None
        assert len(generated["pairings"]) == 3
        assert len(generated["game_ids"]) == 3
        games = Gameinfo.objects.filter(pk__in=generated["game_ids"])
        assert games.count() == 3
        assert set(games.values_list("stage", flat=True)) == {"Swiss"}
        assert set(games.values_list("status", flat=True)) == {
            Gameinfo.STATUS_PUBLISHED
        }
        for game in games:
            assert game.gameresult_set.count() == 2

    def test_generate_requires_setup(self):
        gameday = make_gameday()

        with pytest.raises(SwissTournamentError):
            SwissTournamentService(gameday).generate_round()

    def test_generate_is_gated_on_completed_results(self):
        gameday = make_gameday()
        teams = make_teams(4)
        service = SwissTournamentService(gameday)
        service.setup(
            seed_team_ids=[t.pk for t in teams],
            rounds=3,
            fields=2,
            game_duration=30,
        )
        service.generate_round()

        with pytest.raises(SwissTournamentError):
            service.generate_round()

    def test_round_two_respects_points(self):
        gameday = make_gameday()
        teams = make_teams(4)
        service = SwissTournamentService(gameday)
        service.setup(
            seed_team_ids=[t.pk for t in teams],
            rounds=3,
            fields=2,
            game_duration=30,
        )
        round_one = service.generate_round()
        for game_id in round_one["game_ids"]:
            game = Gameinfo.objects.get(pk=game_id)
            # Home team wins every round-one game.
            complete_game(game, home_score=10, away_score=0)

        round_two = service.generate_round()

        assert round_two["round"] == 2
        # The two round-one winners (2 pts each) must meet.
        table = {row["team_id"]: row["points"] for row in service.standings()}
        assert sorted(table.values(), reverse=True)[:2] == [2, 2]
        paired = [(p["home_team_id"], p["away_team_id"]) for p in round_two["pairings"]]
        winners = [tid for tid, pts in table.items() if pts == 2]
        assert any(
            set(pair) == set(winners) for pair in paired
        ), f"winners {winners} do not meet in {paired}"

    def test_rounds_exhausted_raises(self):
        gameday = make_gameday()
        teams = make_teams(4)
        service = SwissTournamentService(gameday)
        service.setup(
            seed_team_ids=[t.pk for t in teams],
            rounds=2,
            fields=2,
            game_duration=30,
        )
        for _ in range(2):
            generated = service.generate_round()
            for game_id in generated["game_ids"]:
                complete_game(
                    Gameinfo.objects.get(pk=game_id),
                    home_score=10,
                    away_score=0,
                )

        with pytest.raises(SwissTournamentError):
            service.generate_round()

    def test_odd_teams_produce_bye_and_fewer_games(self):
        gameday = make_gameday()
        teams = make_teams(5)
        service = SwissTournamentService(gameday)
        service.setup(
            seed_team_ids=[t.pk for t in teams],
            rounds=2,
            fields=2,
            game_duration=30,
        )

        generated = service.generate_round()

        assert generated["bye_team_id"] is not None
        assert len(generated["game_ids"]) == 2

    def test_bye_team_never_repeats(self):
        gameday = make_gameday()
        teams = make_teams(5)
        service = SwissTournamentService(gameday)
        service.setup(
            seed_team_ids=[t.pk for t in teams],
            rounds=3,
            fields=2,
            game_duration=30,
        )
        byes = set()
        for _ in range(2):
            generated = service.generate_round()
            assert generated["bye_team_id"] not in byes
            byes.add(generated["bye_team_id"])
            for game_id in generated["game_ids"]:
                complete_game(
                    Gameinfo.objects.get(pk=game_id),
                    home_score=10,
                    away_score=0,
                )


@pytest.mark.django_db
class TestSwissGenerateRoundOverrides:
    """generate_round(overrides) honors full-manual overrides and materializes
    designer Game nodes (issue #1970, designer-first task 3)."""

    def _setup(self, n=5, rounds=3, fields=2, name="Swiss Overrides"):
        gameday = make_gameday(name=name)
        teams = make_teams(n, prefix=name.replace(" ", ""))
        service = SwissTournamentService(gameday)
        service.setup(
            seed_team_ids=[t.pk for t in teams],
            rounds=rounds,
            fields=fields,
            game_duration=30,
        )
        return gameday, teams, service

    @staticmethod
    def _nodes(gameday):
        state = GamedayDesignerState.objects.get(gameday=gameday)
        return state.state_data["nodes"]

    def test_overrides_honored_in_gameinfo_and_nodes(self):
        gameday, teams, service = self._setup()
        t0, t1, t2, t3, t4 = teams
        overrides = {
            "pairings": [
                {
                    "home_team_id": t0.pk,
                    "away_team_id": t1.pk,
                    "field": 2,
                    "start_time": "11:15",
                },
                {"home_team_id": t2.pk, "away_team_id": t3.pk},
            ],
            "bye_team_id": t4.pk,
        }

        generated = service.generate_round(overrides=overrides)

        assert generated["round"] == 1
        assert generated["pairings"] == [
            {"home_team_id": t0.pk, "away_team_id": t1.pk},
            {"home_team_id": t2.pk, "away_team_id": t3.pk},
        ]
        assert generated["bye_team_id"] == t4.pk
        assert len(generated["game_ids"]) == 2

        games = {
            tuple(
                sorted(
                    r.team_id
                    for r in Gameresult.objects.filter(gameinfo=game)
                )
            ): game
            for game in Gameinfo.objects.filter(pk__in=generated["game_ids"])
        }
        custom = games[tuple(sorted((t0.pk, t1.pk)))]
        assert custom.field == 2
        assert custom.scheduled.strftime("%H:%M") == "11:15"
        default = games[tuple(sorted((t2.pk, t3.pk)))]
        assert default.field == 2  # round-robin default: game 2 of 2 fields
        assert default.scheduled.strftime("%H:%M") == "09:00"

        nodes = self._nodes(gameday)
        stage_id = "swiss-round-1"
        round_games = [
            n
            for n in nodes
            if n.get("type") == "game" and n.get("parentId") == stage_id
        ]
        assert sorted(n["id"] for n in round_games) == ["swiss-r1-g1", "swiss-r1-g2"]
        by_standing = {n["data"]["standing"]: n for n in round_games}
        first = by_standing["Swiss R1-G1"]
        assert first["data"]["homeTeamId"] == str(t0.pk)
        assert first["data"]["awayTeamId"] == str(t1.pk)
        assert first["data"]["fieldId"] == "swiss-field-2"
        assert first["data"]["startTime"] == "11:15"
        second = by_standing["Swiss R1-G2"]
        assert second["data"]["homeTeamId"] == str(t2.pk)
        assert second["data"]["awayTeamId"] == str(t3.pk)
        assert second["data"]["startTime"] == "09:00"

        ids = [n["id"] for n in nodes]
        assert len(ids) == len(set(ids))
        # Later-round placeholders are untouched.
        later = [
            n
            for n in nodes
            if n.get("type") == "game"
            and str(n.get("parentId", "")).startswith("swiss-round-")
            and n.get("parentId") != stage_id
        ]
        assert later
        assert all(n["data"].get("homeTeamId") is None for n in later)

        config = service.get_config()
        assert config["byes"] == {str(t4.pk): 1}

    def test_generate_without_overrides_materializes_nodes(self):
        gameday, teams, service = self._setup(n=4, name="Swiss ResolverNodes")

        generated = service.generate_round()

        assert generated["round"] == 1
        nodes = self._nodes(gameday)
        round_games = [
            n
            for n in nodes
            if n.get("type") == "game" and n.get("parentId") == "swiss-round-1"
        ]
        assert len(round_games) == 2
        for node in round_games:
            assert node["id"].startswith("swiss-r1-g")
            assert node["data"]["homeTeamId"] is not None
            assert node["data"]["awayTeamId"] is not None
        paired = {
            (n["data"]["homeTeamId"], n["data"]["awayTeamId"]) for n in round_games
        }
        expected = {
            (str(p["home_team_id"]), str(p["away_team_id"]))
            for p in generated["pairings"]
        }
        assert paired == expected
        ids = [n["id"] for n in nodes]
        assert len(ids) == len(set(ids))

    def test_overrides_reject_duplicate_team(self):
        gameday, teams, service = self._setup()
        t0, t1, t2, t3, t4 = teams

        with pytest.raises(SwissTournamentError):
            service.generate_round(
                overrides={
                    "pairings": [
                        {"home_team_id": t0.pk, "away_team_id": t1.pk},
                        {"home_team_id": t0.pk, "away_team_id": t2.pk},
                    ],
                    "bye_team_id": t4.pk,
                }
            )

    def test_overrides_reject_bye_team_also_paired(self):
        gameday, teams, service = self._setup()
        t0, t1, t2, t3, t4 = teams

        with pytest.raises(SwissTournamentError):
            service.generate_round(
                overrides={
                    "pairings": [
                        {"home_team_id": t0.pk, "away_team_id": t1.pk},
                        {"home_team_id": t2.pk, "away_team_id": t3.pk},
                    ],
                    "bye_team_id": t0.pk,
                }
            )

    def test_overrides_reject_field_out_of_range(self):
        gameday, teams, service = self._setup()
        t0, t1, t2, t3, t4 = teams

        with pytest.raises(SwissTournamentError):
            service.generate_round(
                overrides={
                    "pairings": [
                        {
                            "home_team_id": t0.pk,
                            "away_team_id": t1.pk,
                            "field": 99,
                        },
                        {"home_team_id": t2.pk, "away_team_id": t3.pk},
                    ],
                    "bye_team_id": t4.pk,
                }
            )

    def test_overrides_reject_bad_time_format(self):
        gameday, teams, service = self._setup()
        t0, t1, t2, t3, t4 = teams

        with pytest.raises(SwissTournamentError):
            service.generate_round(
                overrides={
                    "pairings": [
                        {
                            "home_team_id": t0.pk,
                            "away_team_id": t1.pk,
                            "start_time": "25:99",
                        },
                        {"home_team_id": t2.pk, "away_team_id": t3.pk},
                    ],
                    "bye_team_id": t4.pk,
                }
            )

    def test_overrides_reject_unknown_team(self):
        gameday, teams, service = self._setup()
        t0, t1, t2, t3, t4 = teams

        with pytest.raises(SwissTournamentError):
            service.generate_round(
                overrides={
                    "pairings": [
                        {"home_team_id": t0.pk, "away_team_id": 424242},
                        {"home_team_id": t2.pk, "away_team_id": t3.pk},
                    ],
                    "bye_team_id": t4.pk,
                }
            )
        with pytest.raises(SwissTournamentError):
            service.generate_round(
                overrides={
                    "pairings": [
                        {"home_team_id": t1.pk, "away_team_id": t2.pk},
                        {"home_team_id": t3.pk, "away_team_id": t0.pk},
                    ],
                    "bye_team_id": 424242,
                }
            )

    def test_odd_team_count_replaces_phantom_placeholder(self):
        gameday, teams, service = self._setup(rounds=2)
        # 5 teams seed ceil(5/2) = 3 placeholders for round 2.
        placeholders = [
            n
            for n in self._nodes(gameday)
            if n.get("parentId") == "swiss-round-2"
        ]
        assert len(placeholders) == 3

        first = service.generate_round()
        for game_id in first["game_ids"]:
            complete_game(Gameinfo.objects.get(pk=game_id), 10, 0)
        second = service.generate_round()

        assert second["round"] == 2
        assert len(second["game_ids"]) == 2  # floor(5/2) real games + bye
        nodes = self._nodes(gameday)
        round_two = [
            n for n in nodes if n.get("parentId") == "swiss-round-2"
        ]
        assert sorted(n["id"] for n in round_two) == ["swiss-r2-g1", "swiss-r2-g2"]
        assert all(n["data"].get("homeTeamId") is not None for n in round_two)
        ids = [n["id"] for n in nodes]
        assert len(ids) == len(set(ids))

    def test_stage_seed_order_is_strings(self):
        gameday, teams, service = self._setup(n=4, name="Swiss SeedStrings")

        nodes = self._nodes(gameday)

        stages = [n for n in nodes if n.get("type") == "stage"]
        assert stages
        for stage in stages:
            seed_order = stage["data"]["progressionConfig"]["seedOrder"]
            assert seed_order == [str(t.pk) for t in teams]
            assert all(isinstance(t, str) for t in seed_order)
        assert service.get_config()["seedOrder"] == [t.pk for t in teams]
