import pytest
from django.core.exceptions import ValidationError
from django.db import IntegrityError, transaction
from django.test import TestCase

from gamedays.models import Gameinfo, Gameday
from gamedays.tests.setup_factories.db_setup import DBSetup
from gamedays.tests.setup_factories.factories import LeagueFactory
from officials.models import CrewPosition
from officials.service.crew_positions import (
    DEFAULT_CREW_POSITIONS,
    crew_positions_for_game,
    crew_positions_for_league,
)


class TestCrewPositionModel(TestCase):
    def test_the_stored_position_is_the_wire_value_not_the_label(self):
        league = LeagueFactory()
        crew_position = CrewPosition.objects.create(
            league=league,
            position="Referee",
            label="Schiedsrichter",
            order=1,
            required=True,
        )

        crew_position.full_clean()
        assert CrewPosition.objects.get(pk=crew_position.pk).position == "Referee"

    def test_full_clean_rejects_a_position_twice_in_one_league(self):
        league = LeagueFactory()
        CrewPosition.objects.create(
            league=league, position="Referee", label="Schiedsrichter", order=1
        )
        duplicate = CrewPosition(
            league=league, position="Referee", label="Hauptschiedsrichter", order=2
        )

        with pytest.raises(ValidationError):
            duplicate.full_clean()

    def test_the_database_rejects_a_position_twice_in_one_league(self):
        league = LeagueFactory()
        CrewPosition.objects.create(
            league=league, position="Referee", label="Schiedsrichter", order=1
        )

        with pytest.raises(IntegrityError), transaction.atomic():
            CrewPosition.objects.create(
                league=league, position="Referee", label="Zweiter", order=2
            )

    def test_the_same_position_may_exist_in_two_leagues(self):
        first = LeagueFactory(name="Liga A")
        second = LeagueFactory(name="Liga B")
        CrewPosition.objects.create(
            league=first, position="Referee", label="Schiedsrichter", order=1
        )
        CrewPosition.objects.create(
            league=second, position="Referee", label="Head Referee", order=1
        )

        assert CrewPosition.objects.filter(position="Referee").count() == 2

    def test_positions_are_listed_per_league_in_configured_order(self):
        league = LeagueFactory()
        CrewPosition.objects.create(
            league=league, position="Down Judge", label="DJ", order=20
        )
        CrewPosition.objects.create(
            league=league, position="Referee", label="SR", order=10
        )

        assert [
            row.position
            for row in CrewPosition.objects.filter(league=league).all()
        ] == ["Referee", "Down Judge"]


class TestCrewPositionDefaults(TestCase):
    def test_the_defaults_are_todays_five_positions(self):
        assert [row["position"] for row in DEFAULT_CREW_POSITIONS] == [
            "Scorecard Judge",
            "Referee",
            "Down Judge",
            "Field Judge",
            "Side Judge",
        ]
        assert [
            row["label"] for row in DEFAULT_CREW_POSITIONS if row["required"]
        ] == ["Schiedsrichter", "Down Judge", "Field Judge", "Side Judge"]
        assert [
            row["position"] for row in DEFAULT_CREW_POSITIONS if not row["required"]
        ] == ["Scorecard Judge"]

    def test_a_league_without_configuration_gets_the_defaults(self):
        league = LeagueFactory()

        assert crew_positions_for_league(league.pk) == DEFAULT_CREW_POSITIONS


class TestCrewPositionsForLeague(TestCase):
    def test_a_configured_league_is_served_its_own_labels_in_order(self):
        league = LeagueFactory()
        CrewPosition.objects.create(
            league=league,
            position="Referee",
            label="Head Referee",
            order=2,
            required=True,
        )
        CrewPosition.objects.create(
            league=league,
            position="Scorekeeper",
            label="Protokoll",
            order=1,
            required=False,
        )

        assert crew_positions_for_league(league.pk) == [
            {
                "position": "Scorekeeper",
                "label": "Protokoll",
                "order": 1,
                "required": False,
            },
            {
                "position": "Referee",
                "label": "Head Referee",
                "order": 2,
                "required": True,
            },
        ]

    def test_another_leagues_configuration_never_leaks_in(self):
        configured = LeagueFactory(name="Konfiguriert")
        other = LeagueFactory(name="Ohne Konfiguration")
        CrewPosition.objects.create(
            league=configured, position="Scorekeeper", label="Protokoll", order=1
        )

        assert crew_positions_for_league(other.pk) == DEFAULT_CREW_POSITIONS


class TestCrewPositionsForGame(TestCase):
    def setUp(self):
        self.gameday: Gameday = DBSetup().g62_status_empty()
        self.game: Gameinfo = Gameinfo.objects.first()

    def test_an_unconfigured_league_gets_the_defaults_for_its_game(self):
        assert crew_positions_for_game(self.game.pk) == DEFAULT_CREW_POSITIONS

    def test_the_games_gameday_league_selects_the_configuration(self):
        CrewPosition.objects.create(
            league=self.gameday.league,
            position="Referee",
            label="Head Referee",
            order=1,
            required=True,
        )

        assert crew_positions_for_game(self.game.pk) == [
            {
                "position": "Referee",
                "label": "Head Referee",
                "order": 1,
                "required": True,
            }
        ]

    def test_a_game_of_another_league_is_not_affected(self):
        CrewPosition.objects.create(
            league=LeagueFactory(name="Andere Liga"),
            position="Scorekeeper",
            label="Protokoll",
            order=1,
        )

        assert crew_positions_for_game(self.game.pk) == DEFAULT_CREW_POSITIONS

    def test_an_unknown_game_raises(self):
        with pytest.raises(Gameinfo.DoesNotExist):
            crew_positions_for_game(self.game.pk + 999)
