from unittest.mock import patch

from django.test import TestCase

from gamedays.models import Gameinfo, Gameresult
from gamedays.service.gameday_settings import FINISHED
from gamedays.service.model_wrapper import GamedayModelWrapper
from gamedays.tests.setup_factories.db_setup import DBSetup
from league_table.tests.setup_factories.db_setup_leaguetable import (
    LEAGUE_TABLE_TEST_RULESET,
)
from league_table.tests.setup_factories.factories_leaguetable import (
    LeagueSeasonConfigFactory,
)


class TestQualifyTableWithNullScores(TestCase):
    """Regression for #1465.

    On prod, gameday 779 had games marked finished (``beendet``) whose
    ``Gameresult`` rows still had ``fh``/``sh``/``pa`` NULL. The league-table
    ranking engine computes ``(pf > pa) & finished`` and casts the result to
    ``int``; a finished-but-scoreless game leaves ``<NA>`` in that mask, so the
    cast blew up with ``ValueError: cannot convert NA to integer`` (26x).
    """

    @patch("league_table.service.datatypes.LeagueConfigRuleset.from_ruleset")
    def test_get_qualify_table_when_finished_game_has_null_scores(
        self, mock_from_ruleset
    ):
        mock_from_ruleset.return_value = LEAGUE_TABLE_TEST_RULESET
        gameday = DBSetup().create_main_round_gameday(status=FINISHED)
        LeagueSeasonConfigFactory(league=gameday.league, season=gameday.season)
        # One finished game whose scores were never entered (inconsistent data).
        scoreless = Gameinfo.objects.filter(gameday=gameday).first()
        Gameresult.objects.filter(gameinfo=scoreless).update(
            fh=None, sh=None, pa=None
        )

        gmw = GamedayModelWrapper(gameday.pk)

        qualify_table = gmw.get_qualify_table()  # must not raise

        assert qualify_table is not None
