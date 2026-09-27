import pytest

from gamedays.models import Team


@pytest.fixture
def teams(db):
    return [
        Team.objects.create(name="Nürnberg Renegades", description="Nürn"),
        Team.objects.create(name="Erlangen Sharks", description="Erl"),
    ]


def test_teams_endpoint_is_public_and_lists_teams(client, teams):
    response = client.get("/api/teams/")
    assert response.status_code == 200
    names = {team["name"] for team in response.json()["results"]}
    assert {"Nürnberg Renegades", "Erlangen Sharks"} <= names


def test_team_payload_has_id_name_description_logo(client, teams):
    response = client.get("/api/teams/")
    item = response.json()["results"][0]
    assert set(item.keys()) == {"id", "name", "description", "logo"}
    assert item["id"]
    assert item["logo"] is None


def test_team_search_matches_name(client, teams):
    response = client.get("/api/teams/", {"search": "Renegades"})
    assert [team["name"] for team in response.json()["results"]] == [
        "Nürnberg Renegades"
    ]


def test_team_search_matches_description(client, teams):
    response = client.get("/api/teams/", {"search": "Erl"})
    assert [team["name"] for team in response.json()["results"]] == [
        "Erlangen Sharks"
    ]


def test_team_payload_exposes_no_sensitive_fields(client, teams):
    item = client.get("/api/teams/").json()["results"][0]
    assert "location" not in item
    assert "association" not in item
