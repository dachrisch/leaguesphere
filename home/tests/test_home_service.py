"""home_service.build_context: role selection and the queries behind the cards.

Only the orchestration is tested here - the cards themselves are pure and
covered by test_cards.py.
"""

from datetime import date, timedelta

import pytest

from gamedays.models import Gameresult, Gameinfo, SeasonLeagueTeam
from gamedays.tests.setup_factories.factories import (
    GamedayFactory,
    GameinfoFactory,
    LeagueFactory,
    SeasonFactory,
    TeamFactory,
    UserFactory,
)
from home.service.home_service import build_context, team_for_user
from officials.tests.setup_factories.factories_officials import OfficialFactory
from passcheck.models import PlayerlistTransfer
from league_table.models import LeagueRulesetTieBreak
from league_table.tests.setup_factories.factories_leaguetable import (
    LeagueSeasonConfigFactory,
    TieBreakStepFactory,
)
from passcheck.tests.setup_factories.factories_passcheck import PlayerlistFactory

TODAY = date(2026, 5, 21)


def _team_in_league(name="dragons", description="Zenith Dragons"):
    team = TeamFactory(name=name, description=description)
    season = SeasonFactory(name="2025/2026")
    league = LeagueFactory(name="Premier Division")
    SeasonLeagueTeam.objects.create(season=season, league=league).teams.add(team)
    return team, season, league


def _gameday(team, season, league, day):
    gameday = GamedayFactory(
        season=season, league=league, date=day, name=f"Spieltag {day.day}"
    )
    opponent = TeamFactory(name="opponent", description="Solar Panthers")
    game = GameinfoFactory(gameday=gameday, field=1, scheduled="10:00")
    Gameresult.objects.create(
        gameinfo=game, team=team, fh=20, sh=20, pa=34, isHome=True
    )
    Gameresult.objects.create(gameinfo=game, team=opponent, fh=20, sh=14, pa=40)
    return gameday, game


def _manager(team, username="manager"):
    user = UserFactory(username=username)
    user.userprofile_set.create(team=team)
    return user


class TestTeamForUser:
    @pytest.mark.django_db
    def test_uses_the_profile_team(self):
        team = TeamFactory()
        user = _manager(team)

        assert team_for_user(user) == team

    @pytest.mark.django_db
    def test_falls_back_to_the_team_account_convention(self):
        team = TeamFactory(name="dragons", description="Zenith Dragons")
        user = UserFactory(username="dragons")

        assert team_for_user(user) == team

    @pytest.mark.django_db
    def test_returns_none_without_a_team(self):
        assert team_for_user(UserFactory(username="nobody")) is None


class TestRoleSelection:
    @pytest.mark.django_db
    def test_team_role_with_upcoming_gameday(self):
        team, season, league = _team_in_league()
        _gameday(team, season, league, TODAY + timedelta(days=4))

        context = build_context(_manager(team), today=TODAY)

        assert context["role"] == "team"
        assert context["team"] == team
        assert "next_gameday" in [card["key"] for card in context["cards"]]

    @pytest.mark.django_db
    def test_team_without_upcoming_gameday_gets_the_season_break_state(self):
        team, season, league = _team_in_league()
        _gameday(team, season, league, TODAY - timedelta(days=40))

        context = build_context(_manager(team), today=TODAY)

        assert context["role"] == "team"
        keys = [card["key"] for card in context["cards"]]
        assert "season_break" in keys
        assert "next_gameday" not in keys

    @pytest.mark.django_db
    def test_teamless_staff_gets_the_nudge_when_nothing_is_planned(self):
        team, season, league = _team_in_league()
        _gameday(team, season, league, TODAY - timedelta(days=40))
        user = UserFactory(username="staff", is_staff=True)

        context = build_context(user, today=TODAY)

        assert context["role"] == "staff"
        keys = [card["key"] for card in context["cards"]]
        assert "staff_gameday_nudge" in keys

    @pytest.mark.django_db
    def test_staff_does_not_get_the_nudge_while_a_gameday_is_upcoming(self):
        team, season, league = _team_in_league()
        _gameday(team, season, league, TODAY + timedelta(days=4))
        user = UserFactory(username="staff", is_staff=True)

        context = build_context(user, today=TODAY)

        keys = [card["key"] for card in context["cards"]]
        assert "staff_gameday_nudge" not in keys
        assert "staff_readiness" in keys

    @pytest.mark.django_db
    def test_official_role_comes_from_the_moodle_session(self):
        official = OfficialFactory(
            team=TeamFactory(name="ref-team", description="Ref Team")
        )
        user = UserFactory(username="referee")

        context = build_context(user, official_id=official.pk, today=TODAY)

        assert context["role"] == "official"
        keys = [card["key"] for card in context["cards"]]
        assert "official_signup" in keys
        assert "next_gameday" not in keys

    @pytest.mark.django_db
    def test_teamless_non_staff_gets_no_roster_or_transfer_cards(self):
        user = UserFactory(username="visitor", is_staff=False)

        context = build_context(user, today=TODAY)

        assert context["role"] == "guest"
        keys = [card["key"] for card in context["cards"]]
        for forbidden in (
            "next_gameday",
            "roster_checks",
            "pending_transfers",
            "officials_ready",
            "last_gameday",
        ):
            assert forbidden not in keys


class TestTeamCards:
    @pytest.mark.django_db
    def test_roster_checks_flag_players_without_a_jersey_number(self):
        team, season, league = _team_in_league()
        _gameday(team, season, league, TODAY + timedelta(days=4))
        for jersey in (1, 2, None):
            PlayerlistFactory(team=team, jersey_number=jersey)

        context = build_context(_manager(team), today=TODAY)

        card = next(c for c in context["cards"] if c["key"] == "roster_checks")
        titles = [row["title"] for row in card["rows"]]
        assert any("ohne Trikotnummer" in title for title in titles)
        assert any("1 Spieler ohne Trikotnummer" in title for title in titles)

    @pytest.mark.django_db
    def test_pending_transfers_only_count_incoming_ones(self):
        team, season, league = _team_in_league()
        _gameday(team, season, league, TODAY + timedelta(days=4))
        other = TeamFactory(name="other", description="Other Team")
        playerlist = PlayerlistFactory(team=other, jersey_number=5)
        PlayerlistTransfer.objects.create(
            current_team=playerlist, new_team=team, status="pending"
        )

        context = build_context(_manager(team), today=TODAY)

        card = next(c for c in context["cards"] if c["key"] == "pending_transfers")
        assert "1 Transfer wartet" in card["title"]

    @pytest.mark.django_db
    def test_table_delta_is_omitted_without_a_league_season_config(self):
        team, season, league = _team_in_league()
        _gameday(team, season, league, TODAY - timedelta(days=4))

        context = build_context(_manager(team), today=TODAY)

        keys = [card["key"] for card in context["cards"]]
        assert "table_delta" not in keys


@pytest.mark.django_db
def test_table_delta_renders_for_a_ranked_league():
    """The card is derived from the existing ranking engine, not a new one."""
    team, season, league = _team_in_league()
    config = LeagueSeasonConfigFactory(league=league, season=season)
    config.leagues_for_league_points.add(league)
    LeagueRulesetTieBreak.objects.create(
        ruleset=config.ruleset, step=TieBreakStepFactory(key="win_quotient"), order=0
    )
    rival = TeamFactory(name="rival", description="Solar Panthers")
    SeasonLeagueTeam.objects.create(season=season, league=league).teams.add(rival)

    def played(day, own, other):
        gameday = GamedayFactory(
            season=season, league=league, date=day, name=f"Spieltag {day.day}"
        )
        game = Gameinfo.objects.create(
            gameday=gameday,
            scheduled="10:00",
            field=1,
            officials=team,
            status=Gameinfo.STATUS_COMPLETED,
            stage="Liga",
            standing="Liga",
        )
        Gameresult.objects.create(
            gameinfo=game, team=team, fh=own, sh=0, pa=other, isHome=True
        )
        Gameresult.objects.create(
            gameinfo=game, team=rival, fh=other, sh=0, pa=own, isHome=False
        )

    played(TODAY - timedelta(days=10), own=0, other=20)
    played(TODAY - timedelta(days=3), own=20, other=0)

    context = build_context(_manager(team), today=TODAY)

    card = next(c for c in context["cards"] if c["key"] == "table_delta")
    assert "→" in card["text"]
    assert card["severity"] in {"ok", "warning", "info"}


@pytest.mark.django_db
def test_staff_nudge_opens_the_designer_for_the_next_season_and_league():
    """The designer creates the gameday with the context it was opened for."""
    team, season, league = _team_in_league()
    _gameday(team, season, league, TODAY - timedelta(days=40))
    next_season = SeasonFactory(name="2026/2027")

    context = build_context(
        UserFactory(username="staff_designer", is_staff=True), today=TODAY
    )

    nudge = next(c for c in context["cards"] if c["key"] == "staff_gameday_nudge")
    primary = next(link for link in nudge["links"] if link["primary"])
    assert f"league={league.pk}" in primary["url"]
    assert f"season={next_season.pk}" in primary["url"]


@pytest.mark.django_db
def test_staff_nudge_omits_the_season_while_it_is_missing():
    team, season, league = _team_in_league()
    _gameday(team, season, league, TODAY - timedelta(days=40))

    context = build_context(
        UserFactory(username="staff_designer_2", is_staff=True), today=TODAY
    )

    nudge = next(c for c in context["cards"] if c["key"] == "staff_gameday_nudge")
    primary = next(link for link in nudge["links"] if link["primary"])
    assert f"league={league.pk}" in primary["url"]
    assert "season=" not in primary["url"]
