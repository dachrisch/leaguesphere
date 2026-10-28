"""``manage.py rebuild_game_projection --game ID`` (T6).

Drops the projection the event log owns -- ``GameState`` and the ``TeamLog``
groups the log's submissions produced -- replays the log and clears
``needs_reconciliation``. Rows written before the log existed are not touched
(see ``gameevents/service/reconcile.py``), so a mixed game is repaired, not
rewritten.

A legacy game (no events) is refused: there is no log, and inventing one would
be worse than the flag it is trying to clear. ``Gameresult`` is not rebuilt --
it is maintained by the write path, not projected from the log.
"""

from django.contrib.auth.models import User
from django.core.management.base import BaseCommand, CommandError

from gameevents.models import GameState
from gameevents.service.reconcile import LegacyGameError, RebuildError, rebuild_game
from gamedays.models import Gameinfo


class Command(BaseCommand):
    help = (
        "Drop a game's projection (state and the rows its event log owns) and "
        "replay it."
    )

    def add_arguments(self, parser):
        parser.add_argument(
            "--game",
            type=int,
            required=True,
            metavar="ID",
            help="the game whose projection should be rebuilt",
        )
        parser.add_argument(
            "--author",
            type=int,
            metavar="USER_ID",
            help=(
                "user id recorded on rows that have no previous row to inherit "
                "an author from (defaults to TeamLog's default author)"
            ),
        )

    def handle(self, *args, **options):
        game = Gameinfo.objects.filter(pk=options["game"]).first()
        if game is None:
            raise CommandError(f"No game found for gameId {options['game']}")

        author = None
        if options["author"] is not None:
            author = User.objects.filter(pk=options["author"]).first()
            if author is None:
                raise CommandError(f"No user found for id {options['author']}")

        was_flagged = GameState.objects.filter(
            game=game, needs_reconciliation=True
        ).exists()
        try:
            result = rebuild_game(game, author=author)
        except LegacyGameError as error:
            raise CommandError(str(error))
        except RebuildError as error:
            raise CommandError(str(error))

        self.stdout.write(
            f"game {result.game_id}: replayed {result.event_count} event(s) into "
            f"{result.sequences} row group(s), {result.rows_written} row(s); "
            f"state seq {result.last_seq}"
        )
        if was_flagged:
            self.stdout.write("needs_reconciliation cleared")
        self.stdout.write(self.style.SUCCESS("projection rebuilt"))
