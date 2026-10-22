from datetime import date, timedelta

import pytest
from django.db import connection
from django.test.utils import CaptureQueriesContext
from django.urls import reverse

from gamedays.models import Gameresult, SeasonLeagueTeam
from gamedays.tests.setup_factories.factories import (
    GamedayFactory,
    GameinfoFactory,
    LeagueFactory,
    SeasonFactory,
    TeamFactory,
    UserFactory,
)

TODAY = date.today()


def _team_with_gameday(day, name="dragons", description="Zenith Dragons"):
    team = TeamFactory(name=name, description=description)
    season = SeasonFactory(name="2025/2026")
    league = LeagueFactory(name="Premier Division")
    SeasonLeagueTeam.objects.create(season=season, league=league).teams.add(team)
    gameday = GamedayFactory(season=season, league=league, date=day, name="Spieltag 3")
    game = GameinfoFactory(gameday=gameday, field=2, scheduled="10:00")
    opponent = TeamFactory(name="opponent", description="Solar Panthers")
    Gameresult.objects.create(
        gameinfo=game, team=team, fh=20, sh=20, pa=34, isHome=True
    )
    Gameresult.objects.create(gameinfo=game, team=opponent, fh=20, sh=14, pa=40)
    return team, season, league, gameday


def _manager(team, username="manager"):
    user = UserFactory(username=username)
    user.userprofile_set.create(team=team)
    return user


@pytest.mark.django_db
def test_home_requires_login(client):
    response = client.get(reverse("home"))

    assert response.status_code == 302
    assert "/login/" in response.url


@pytest.mark.django_db
def test_home_renders_the_home_template(client):
    client.force_login(_manager(TeamFactory(name="solo", description="Solo Team")))

    response = client.get(reverse("home"))

    assert response.status_code == 200
    assert "home/home.html" in [template.name for template in response.templates]


@pytest.mark.django_db
def test_team_with_upcoming_gameday_sees_it(client):
    team, *_ = _team_with_gameday(TODAY + timedelta(days=4))
    client.force_login(_manager(team))

    response = client.get(reverse("home"))

    keys = [card["key"] for card in response.context["cards"]]
    assert "next_gameday" in keys
    content = response.content.decode()
    assert "Nächster Spieltag" in content
    assert "Solar Panthers" in content


@pytest.mark.django_db
def test_season_break_is_explained_and_offers_chores(client):
    team, season, league, _ = _team_with_gameday(TODAY - timedelta(days=40))
    client.force_login(_manager(team))

    response = client.get(reverse("home"))

    content = response.content.decode()
    assert "Keine Spieltage geplant" in content
    assert "Jetzt sinnvoll" in content


@pytest.mark.django_db
def test_staff_without_upcoming_gameday_sees_the_three_step_nudge(client):
    _team_with_gameday(TODAY - timedelta(days=40))
    client.force_login(UserFactory(username="staff_user", is_staff=True))

    response = client.get(reverse("home"))

    content = response.content.decode()
    assert "Aus Vorlage anwenden" in content
    assert "Spieltag manuell anlegen" in content
    assert "Saison" in content


@pytest.mark.django_db
def test_staff_with_an_upcoming_gameday_does_not_see_the_nudge(client):
    _team_with_gameday(TODAY + timedelta(days=4))
    client.force_login(UserFactory(username="staff_user", is_staff=True))

    response = client.get(reverse("home"))

    assert "Aus Vorlage anwenden" not in response.content.decode()
    keys = [card["key"] for card in response.context["cards"]]
    assert "staff_readiness" in keys


@pytest.mark.django_db
def test_teamless_user_sees_no_roster_checks(client):
    client.force_login(UserFactory(username="visitor", is_staff=False))

    response = client.get(reverse("home"))

    content = response.content.decode()
    assert "Trikotnummer" not in content
    assert "wartet auf Freigabe" not in content


@pytest.mark.django_db
def test_query_count_is_flat_between_one_and_twelve_teams(client):
    team, season, league, _ = _team_with_gameday(TODAY + timedelta(days=4))
    client.force_login(_manager(team))
    url = reverse("home")
    client.get(url)  # warm middleware / menu caches

    with CaptureQueriesContext(connection) as small:
        client.get(url)
    for index in range(11):
        other = TeamFactory(name=f"other-{index}", description=f"Other Team {index}")
        SeasonLeagueTeam.objects.create(season=season, league=league).teams.add(other)

    with CaptureQueriesContext(connection) as large:
        client.get(url)

    assert len(small) > 0
    assert len(small) == len(large)
