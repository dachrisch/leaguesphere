from django.contrib.auth.models import User
from django.test import TestCase

from gamedays.models import Team, Gameinfo, TeamLog
from gamedays.service.gamelog import GameLogCreator
from gamedays.tests.setup_factories.db_setup import DBSetup


class TestGamelogPlayerSanitization(TestCase):
    """Regression for #1465 (gamelog 8262).

    The jersey number arrives raw from the client and was written without
    validation, so a decimal like ``'51.85'`` ended up in the integer
    ``player`` column and later blew up on read. The write path must coerce it
    to a valid integer (truncating) and never persist garbage.
    """

    def _setup_game(self):
        DBSetup().g62_status_empty()
        return Gameinfo.objects.first(), Team.objects.first(), User.objects.first()

    def test_decimal_player_number_is_truncated_to_integer(self):
        game, team, user = self._setup_game()

        GameLogCreator(
            game, team, [{"name": "Touchdown", "player": "51.85"}], user
        ).create()

        teamlog = TeamLog.objects.get(event="Touchdown")
        assert teamlog.player == 51

    def test_non_numeric_player_number_becomes_none(self):
        game, team, user = self._setup_game()

        GameLogCreator(
            game, team, [{"name": "Touchdown", "player": "abc"}], user
        ).create()

        teamlog = TeamLog.objects.get(event="Touchdown")
        assert teamlog.player is None

    def test_valid_player_number_is_kept(self):
        game, team, user = self._setup_game()

        GameLogCreator(
            game, team, [{"name": "Touchdown", "player": "19"}], user
        ).create()

        teamlog = TeamLog.objects.get(event="Touchdown")
        assert teamlog.player == 19

    def test_out_of_range_player_number_becomes_none(self):
        game, team, user = self._setup_game()

        # 99999 > PositiveSmallIntegerField max (32767): not a storable jersey
        # number, so it is dropped rather than silently persisted invalid.
        GameLogCreator(
            game, team, [{"name": "Touchdown", "player": "99999"}], user
        ).create()

        teamlog = TeamLog.objects.get(event="Touchdown")
        assert teamlog.player is None
