"""home_service.build_context: role selection and the queries behind the cards.

Only the orchestration is tested here - the cards themselves are pure and
covered by test_cards.py.
"""

from datetime import date, datetime, timedelta

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


class TestGreeting:
    @pytest.mark.django_db
    def test_time_of_day_greeting(self):
        user = UserFactory(username="greeter")

        assert (
            build_context(user, now=datetime(2026, 10, 22, 8, 0))["greeting"]
            == "Guten Morgen"
        )
        assert (
            build_context(user, now=datetime(2026, 10, 22, 11, 0))["greeting"]
            == "Guten Tag"
        )
        assert (
            build_context(user, now=datetime(2026, 10, 22, 18, 0))["greeting"]
            == "Guten Abend"
        )

    @pytest.mark.django_db
    def test_greets_the_persons_first_name(self):
        user = UserFactory(username="greeter2")
        user.userprofile_set.create(firstname="Chris")

        context = build_context(user, now=datetime(2026, 10, 22, 12, 0))

        assert context["display_name"] == "Chris"
        assert context["heading"] == "Guten Tag, Chris"

    @pytest.mark.django_db
    def test_falls_back_to_the_accounts_first_name(self):
        user = UserFactory(username="greeter3", first_name="Sam")

        context = build_context(user, now=datetime(2026, 10, 22, 12, 0))

        assert context["display_name"] == "Sam"

    @pytest.mark.django_db
    def test_without_a_name_the_greeting_stays_neutral(self):
        user = UserFactory(username="staff_account", is_staff=True)

        context = build_context(user, now=datetime(2026, 10, 22, 12, 0))

        assert context["display_name"] is None
        assert context["heading"] == "Guten Tag"

    @pytest.mark.django_db
    def test_shows_the_german_date(self):
        context = build_context(UserFactory(username="dater"), today=date(2026, 10, 22))

        assert context["date_text"] == "Do, 22.10.2026"


class TestAvatar:
    @pytest.mark.django_db
    def test_uses_the_profile_avatar(self):
        user = UserFactory(username="avatar_user")
        user.userprofile_set.create(
            firstname="Chris", lastname="D", avatar="media/avatars/c.png"
        )

        avatar = build_context(user)["avatar"]

        assert avatar["kind"] == "image"
        assert avatar["url"].endswith("media/avatars/c.png")

    @pytest.mark.django_db
    def test_team_accounts_get_the_team_logo(self):
        team = TeamFactory(name="logo-team", description="Logo Team")
        team.logo = "teammanager/logos/t.png"
        team.save(update_fields=["logo"])
        user = UserFactory(username="logo-team")

        avatar = build_context(user)["avatar"]

        assert avatar["kind"] == "team_logo"
        assert avatar["url"].endswith("teammanager/logos/t.png")

    @pytest.mark.django_db
    def test_initials_are_the_fallback(self):
        user = UserFactory(username="initials_user")
        user.userprofile_set.create(firstname="Chris", lastname="D")

        avatar = build_context(user)["avatar"]

        assert avatar["kind"] == "initials"
        assert avatar["initials"] == "CD"


class TestRoleText:
    @pytest.mark.django_db
    def test_team_role_text_names_the_team(self):
        team, season, league = _team_in_league()

        context = build_context(_manager(team), today=TODAY)

        assert context["role_text"] == "Teamverantwortlich für Zenith Dragons"
        assert context["context_text"] == "Premier Division · Saison 2025/2026"

    @pytest.mark.django_db
    def test_staff_is_not_called_staff_in_the_headline(self):
        team, season, league = _team_in_league()
        _gameday(team, season, league, TODAY - timedelta(days=40))

        context = build_context(
            UserFactory(username="staff_role", is_staff=True), today=TODAY
        )

        assert context["heading"] == "Guten Tag"
        assert context["role_text"] == "Liga-Verwaltung"
        assert context["context_text"] == "Premier Division · Saison 2025/2026"


class TestSections:
    @pytest.mark.django_db
    def test_team_gets_the_site_sections_plus_its_own_table(self):
        team, season, league = _team_in_league()

        sections = build_context(_manager(team), today=TODAY)["sections"]
        labels = [section["label"] for section in sections]

        assert labels[:2] == ["Spieltage", "Ligen & Tabellen"]
        assert "Hilfe" in labels
        table = sections[1]["url"]
        assert league.slug in table
        assert season.slug in table

    @pytest.mark.django_db
    def test_staff_gets_the_season_administration(self):
        team, season, league = _team_in_league()
        _gameday(team, season, league, TODAY - timedelta(days=40))

        sections = build_context(
            UserFactory(username="staff_sections", is_staff=True), today=TODAY
        )["sections"]

        assert "Saisons" in [section["label"] for section in sections]

    @pytest.mark.django_db
    def test_guests_get_no_staff_only_section(self):
        sections = build_context(
            UserFactory(username="guest_sections", is_staff=False)
        )["sections"]

        labels = [section["label"] for section in sections]
        assert "Saisons" not in labels
        assert "Spieltage" in labels
        assert "Offizielle" in labels


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
    # The gameday step is the designer link (the card has no extra button).
    designer_step = next(step for step in nudge["steps"] if step["key"] == "gameday")
    assert f"league={league.pk}" in designer_step["url"]
    assert f"season={next_season.pk}" in designer_step["url"]


@pytest.mark.django_db
def test_staff_nudge_passes_the_existing_season_too():
    """An existing season counts, so the designer gets it even when no newer
    season has been created yet."""
    team, season, league = _team_in_league()
    _gameday(team, season, league, TODAY - timedelta(days=40))

    context = build_context(
        UserFactory(username="staff_designer_2", is_staff=True), today=TODAY
    )

    nudge = next(c for c in context["cards"] if c["key"] == "staff_gameday_nudge")
    designer_step = next(step for step in nudge["steps"] if step["key"] == "gameday")
    assert f"league={league.pk}" in designer_step["url"]
    assert f"season={season.pk}" in designer_step["url"]
