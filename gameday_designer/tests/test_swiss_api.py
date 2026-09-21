"""
Tests for the Swiss tournament API (issue #1970, Path B slice 1).

Endpoints (mounted at /api/designer/):
- POST gamedays/<id>/swiss/setup/
- POST gamedays/<id>/swiss/generate-round/
- GET  gamedays/<id>/swiss/standings/
"""

import pytest
from rest_framework import status

from gamedays.models import Gameday, GamedayDesignerState, Gameinfo, Gameresult
from gameday_designer.tests.test_swiss_tournament_service import (
    complete_game,
    make_gameday,
    make_teams,
)


def setup_payload(teams, **overrides):
    payload = {
        "seed_team_ids": [t.pk for t in teams],
        "rounds": 3,
        "fields": 2,
        "game_duration": 30,
    }
    payload.update(overrides)
    return payload


@pytest.mark.django_db
class TestSwissSetupEndpoint:
    def test_setup_persists_config(self, api_client, staff_user):
        gameday = make_gameday()
        teams = make_teams(6)
        api_client.force_authenticate(user=staff_user)

        response = api_client.post(
            f"/api/designer/gamedays/{gameday.pk}/swiss/setup/",
            setup_payload(teams),
            format="json",
        )

        assert response.status_code == status.HTTP_200_OK
        assert response.data["success"] is True
        assert response.data["config"]["rounds"] == 3
        assert response.data["config"]["seedOrder"] == [t.pk for t in teams]

    def test_setup_rejects_bad_input(self, api_client, staff_user):
        gameday = make_gameday()
        teams = make_teams(4)
        api_client.force_authenticate(user=staff_user)

        response = api_client.post(
            f"/api/designer/gamedays/{gameday.pk}/swiss/setup/",
            setup_payload(teams, rounds=99),
            format="json",
        )

        assert response.status_code == status.HTTP_400_BAD_REQUEST

    def test_setup_rejects_unknown_team(self, api_client, staff_user):
        gameday = make_gameday()
        teams = make_teams(4)
        api_client.force_authenticate(user=staff_user)

        response = api_client.post(
            f"/api/designer/gamedays/{gameday.pk}/swiss/setup/",
            setup_payload(teams, seed_team_ids=[t.pk for t in teams] + [424242]),
            format="json",
        )

        assert response.status_code == status.HTTP_400_BAD_REQUEST

    def test_setup_requires_authentication(self, api_client):
        gameday = make_gameday()
        teams = make_teams(4)

        response = api_client.post(
            f"/api/designer/gamedays/{gameday.pk}/swiss/setup/",
            setup_payload(teams),
            format="json",
        )

        assert response.status_code == status.HTTP_401_UNAUTHORIZED

    def test_setup_missing_gameday_is_404(self, api_client, staff_user):
        teams = make_teams(4)
        api_client.force_authenticate(user=staff_user)

        response = api_client.post(
            "/api/designer/gamedays/424242/swiss/setup/",
            setup_payload(teams),
            format="json",
        )

        assert response.status_code == status.HTTP_404_NOT_FOUND


@pytest.mark.django_db
class TestSwissGenerateRoundEndpoint:
    def _setup(self, api_client, staff_user, n=6, **overrides):
        gameday = make_gameday()
        teams = make_teams(n)
        api_client.force_authenticate(user=staff_user)
        response = api_client.post(
            f"/api/designer/gamedays/{gameday.pk}/swiss/setup/",
            setup_payload(teams, **overrides),
            format="json",
        )
        assert response.status_code == status.HTTP_200_OK
        return gameday, teams

    def test_generate_round_one(self, api_client, staff_user):
        gameday, _teams = self._setup(api_client, staff_user)

        response = api_client.post(
            f"/api/designer/gamedays/{gameday.pk}/swiss/generate-round/"
        )

        assert response.status_code == status.HTTP_200_OK
        assert response.data["success"] is True
        assert response.data["round"] == 1
        assert len(response.data["pairings"]) == 3
        assert len(response.data["game_ids"]) == 3

    def test_generate_is_gated(self, api_client, staff_user):
        gameday, _teams = self._setup(api_client, staff_user, n=4)
        first = api_client.post(
            f"/api/designer/gamedays/{gameday.pk}/swiss/generate-round/"
        )
        assert first.status_code == status.HTTP_200_OK

        response = api_client.post(
            f"/api/designer/gamedays/{gameday.pk}/swiss/generate-round/"
        )

        assert response.status_code == status.HTTP_400_BAD_REQUEST
        assert "completed" in response.data["error"]

    def test_generate_round_two_after_results(self, api_client, staff_user):
        gameday, _teams = self._setup(api_client, staff_user, n=4)
        first = api_client.post(
            f"/api/designer/gamedays/{gameday.pk}/swiss/generate-round/"
        )
        for game_id in first.data["game_ids"]:
            complete_game(Gameinfo.objects.get(pk=game_id), home_score=10, away_score=0)

        response = api_client.post(
            f"/api/designer/gamedays/{gameday.pk}/swiss/generate-round/"
        )

        assert response.status_code == status.HTTP_200_OK
        assert response.data["round"] == 2

    def test_generate_without_setup_is_400(self, api_client, staff_user):
        gameday = make_gameday()
        api_client.force_authenticate(user=staff_user)

        response = api_client.post(
            f"/api/designer/gamedays/{gameday.pk}/swiss/generate-round/"
        )

        assert response.status_code == status.HTTP_400_BAD_REQUEST

    def test_generate_requires_authentication(self, api_client):
        gameday = make_gameday()

        response = api_client.post(
            f"/api/designer/gamedays/{gameday.pk}/swiss/generate-round/"
        )

        assert response.status_code == status.HTTP_401_UNAUTHORIZED

    def test_generate_round_dry_run_creates_nothing(self, api_client, staff_user):
        gameday, _teams = self._setup(api_client, staff_user)

        response = api_client.post(
            f"/api/designer/gamedays/{gameday.pk}/swiss/generate-round/?dry_run=true"
        )

        assert response.status_code == status.HTTP_200_OK
        assert response.data["success"] is True
        assert response.data["round"] == 1
        assert len(response.data["pairings"]) > 0
        assert Gameinfo.objects.filter(gameday=gameday).count() == 0
        swiss = GamedayDesignerState.objects.get(gameday=gameday).state_data["swiss"]
        assert swiss["completedRounds"] == []
        assert swiss["byes"] == {}


@pytest.mark.django_db
class TestSwissStandingsEndpoint:
    def test_standings_reflect_results_and_byes(self, api_client, staff_user):
        gameday = make_gameday()
        teams = make_teams(5)
        api_client.force_authenticate(user=staff_user)
        api_client.post(
            f"/api/designer/gamedays/{gameday.pk}/swiss/setup/",
            setup_payload(teams),
            format="json",
        )
        generated = api_client.post(
            f"/api/designer/gamedays/{gameday.pk}/swiss/generate-round/"
        ).data
        for game_id in generated["game_ids"]:
            complete_game(Gameinfo.objects.get(pk=game_id), home_score=10, away_score=0)

        response = api_client.get(
            f"/api/designer/gamedays/{gameday.pk}/swiss/standings/"
        )

        assert response.status_code == status.HTTP_200_OK
        assert response.data["rounds_completed"] == 1
        assert response.data["rounds_total"] == 3
        table = {row["team_id"]: row for row in response.data["standings"]}
        assert table[generated["bye_team_id"]]["points"] == 2
        home_id = Gameresult.objects.get(
            gameinfo_id=generated["game_ids"][0], isHome=True
        ).team_id
        assert table[home_id]["points"] == 2
        assert table[home_id]["wins"] == 1

    def test_standings_without_setup_is_400(self, api_client, staff_user):
        gameday = make_gameday()
        api_client.force_authenticate(user=staff_user)

        response = api_client.get(
            f"/api/designer/gamedays/{gameday.pk}/swiss/standings/"
        )

        assert response.status_code == status.HTTP_400_BAD_REQUEST


@pytest.mark.django_db
class TestSwissGenerateRoundOverridesEndpoint:
    def _setup(self, api_client, staff_user, n=5, **overrides):
        gameday = make_gameday(name=f"Swiss API Overrides {n}")
        teams = make_teams(n, prefix=f"AO{n}")
        api_client.force_authenticate(user=staff_user)
        response = api_client.post(
            f"/api/designer/gamedays/{gameday.pk}/swiss/setup/",
            setup_payload(teams, **overrides),
            format="json",
        )
        assert response.status_code == status.HTTP_200_OK
        return gameday, teams

    def _overrides(self, teams, **kw):
        t0, t1, t2, t3, t4 = teams
        payload = {
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
        payload.update(kw)
        return payload

    def test_overrides_envelope_accepted(self, api_client, staff_user):
        gameday, teams = self._setup(api_client, staff_user)

        response = api_client.post(
            f"/api/designer/gamedays/{gameday.pk}/swiss/generate-round/",
            self._overrides(teams),
            format="json",
        )

        assert response.status_code == status.HTTP_200_OK
        assert response.data["success"] is True
        assert response.data["round"] == 1
        assert response.data["bye_team_id"] == teams[4].pk
        assert response.data["pairings"] == [
            {"home_team_id": teams[0].pk, "away_team_id": teams[1].pk},
            {"home_team_id": teams[2].pk, "away_team_id": teams[3].pk},
        ]
        state = GamedayDesignerState.objects.get(gameday=gameday)
        round_games = [
            n
            for n in state.state_data["nodes"]
            if n.get("type") == "game" and n.get("parentId") == "swiss-round-1"
        ]
        assert len(round_games) == 2
        assert round_games[0]["data"]["startTime"] == "11:15"

    @pytest.mark.parametrize(
        "mutate",
        [
            # duplicate team across pairings
            {"dup": True},
            # bye team also paired
            {"bye_to": 0},
            # field out of 1..F
            {"field": 99},
            # bad time format
            {"start_time": "9am"},
            # unknown team id
            {"away_to": 424242},
        ],
    )
    def test_override_validation_errors_are_400(
        self, api_client, staff_user, mutate
    ):
        gameday, teams = self._setup(api_client, staff_user)
        payload = self._overrides(teams)
        if mutate.get("dup"):
            payload["pairings"][1] = {
                "home_team_id": teams[0].pk,
                "away_team_id": teams[2].pk,
            }
        if "bye_to" in mutate:
            payload["bye_team_id"] = teams[mutate["bye_to"]].pk
        if "field" in mutate:
            payload["pairings"][0]["field"] = mutate["field"]
        if "start_time" in mutate:
            payload["pairings"][0]["start_time"] = mutate["start_time"]
        if "away_to" in mutate:
            payload["pairings"][0]["away_team_id"] = mutate["away_to"]

        response = api_client.post(
            f"/api/designer/gamedays/{gameday.pk}/swiss/generate-round/",
            payload,
            format="json",
        )

        assert response.status_code == status.HTTP_400_BAD_REQUEST
        assert "error" in response.data

    def test_overrides_keep_prior_round_gate(self, api_client, staff_user):
        gameday, teams = self._setup(api_client, staff_user, n=4)
        first = api_client.post(
            f"/api/designer/gamedays/{gameday.pk}/swiss/generate-round/"
        )
        assert first.status_code == status.HTTP_200_OK
        payload = {
            "pairings": [
                {"home_team_id": teams[0].pk, "away_team_id": teams[1].pk},
                {"home_team_id": teams[2].pk, "away_team_id": teams[3].pk},
            ]
        }

        response = api_client.post(
            f"/api/designer/gamedays/{gameday.pk}/swiss/generate-round/",
            payload,
            format="json",
        )

        assert response.status_code == status.HTTP_400_BAD_REQUEST
        assert "error" in response.data
