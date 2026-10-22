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
    main = content.split("<main", 1)[1].split("</main>", 1)[0]
    assert "Keine Spieltage geplant" in main
    assert "Kader &amp; Transfers" in main
    # One link per destination: the gameday list is offered by the strip only.
    assert main.count(f'href="{reverse("league-gameday-list")}"') == 1


@pytest.mark.django_db
def test_staff_without_upcoming_gameday_sees_the_two_step_nudge(client):
    _team_with_gameday(TODAY - timedelta(days=40))
    client.force_login(UserFactory(username="staff_user", is_staff=True))

    response = client.get(reverse("home"))

    content = response.content.decode()
    assert "Spieltag im Designer anlegen" in content
    assert "Spieltag manuell anlegen" in content
    assert "Saison" in content
    keys = [card["key"] for card in response.context["cards"]]
    assert keys == ["staff_gameday_nudge", "staff_review"]


@pytest.mark.django_db
def test_staff_sees_the_past_review_in_both_states(client):
    _team_with_gameday(TODAY - timedelta(days=40))
    client.force_login(UserFactory(username="staff_user_a", is_staff=True))
    content = client.get(reverse("home")).content.decode()
    assert "Saison 2025/2026" in content
    assert "Letzter Spieltag" in content

    _team_with_gameday(TODAY + timedelta(days=4))
    client.force_login(UserFactory(username="staff_user_b", is_staff=True))
    content = client.get(reverse("home")).content.decode()
    assert "Saison 2025/2026" in content


@pytest.mark.django_db
def test_staff_with_an_upcoming_gameday_does_not_see_the_nudge(client):
    _team_with_gameday(TODAY + timedelta(days=4))
    client.force_login(UserFactory(username="staff_user", is_staff=True))

    response = client.get(reverse("home"))

    assert "Spieltag im Designer anlegen" not in response.content.decode()
    keys = [card["key"] for card in response.context["cards"]]
    assert "staff_readiness" in keys
    assert "staff_review" in keys


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


@pytest.mark.django_db
def test_home_greets_the_person_not_the_role(client):
    team, *_ = _team_with_gameday(TODAY + timedelta(days=4))
    user = _manager(team)
    user.userprofile_set.update(firstname="Chris", lastname="D")
    client.force_login(user)

    content = client.get(reverse("home")).content.decode()

    assert "Guten" in content
    assert "Teamverantwortlich für Zenith Dragons" in content
    assert 'class="home-avatar"' in content
    assert "CD" in content
    assert ">Staff<" not in content


@pytest.mark.django_db
def test_home_links_onwards_to_the_other_sections(client):
    client.force_login(_manager(TeamFactory(name="solo-two", description="Solo Two")))

    content = client.get(reverse("home")).content.decode()

    assert "home-pill" in content
    assert 'class="bi bi-calendar3"' in content
    assert reverse("league-gameday-list") in content
    assert reverse("view-officials-list-for-all-teams") in content
    assert reverse("teammanager") in content
    assert reverse("help-index") in content


@pytest.mark.django_db
def test_home_does_not_repeat_a_destination(client):
    """Each action appears once: the step already links the designer, so the
    nudge must not also render a designer button."""
    _team_with_gameday(TODAY - timedelta(days=40))
    client.force_login(UserFactory(username="staff_once", is_staff=True))

    content = client.get(reverse("home")).content.decode()

    main = content.split("<main", 1)[1].split("</main>", 1)[0]
    designer = "/gamedays/gameday/design/"
    # The step links the designer; the card must not also render a button for it
    # (the nav carries one more, which is chrome outside <main>).
    assert main.count(f'href="{designer}') == 1
    assert "Spieltag im Designer anlegen" in main
    assert main.count("Spieltag manuell anlegen") == 1
    # ... and it is a quiet fallback link, not a button competing with the step.
    assert "home-quiet-link" in main
    assert "oder Spieltag manuell anlegen" in main
    # The past is stated by the review card only.
    assert main.count("Letzter Spieltag") == 1


@pytest.mark.django_db
def test_home_header_has_no_date_and_no_hint_chip(client):
    _team_with_gameday(TODAY - timedelta(days=40))
    client.force_login(UserFactory(username="staff_chrome", is_staff=True))

    content = client.get(reverse("home")).content.decode()

    assert "Do," not in content
    assert ">Hinweis<" not in content
    assert "Weitermachen" not in content  # the strip is icons now, not a text row
    assert "home-pill" in content


@pytest.mark.django_db
def test_staff_nudge_does_not_call_an_existing_season_missing(client):
    """The chain's first link is about having a season at all - the season of
    the last gameday counts, even when no newer season exists."""
    team, season, league, _ = _team_with_gameday(TODAY - timedelta(days=6))
    client.force_login(UserFactory(username="staff_season_exists", is_staff=True))

    response = client.get(reverse("home"))

    nudge = next(
        card
        for card in response.context["cards"]
        if card["key"] == "staff_gameday_nudge"
    )
    season_step = nudge["steps"][0]
    assert season_step["state"] == "done"
    assert season.name in season_step["text"]
    assert "fehlt" not in season_step["text"]
