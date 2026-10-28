"""``manage.py check_game_projection [--game ID | --all]`` (T6).

Compares each game's ``GameState`` and the ``TeamLog`` groups its log produced
with a replay of ``GameEvent`` and reports the first offending ``seq``. Drift
is a non-zero exit (a cron/CI check after a gameday must be able to fail the
run); a legacy game (rows, no events) is skipped, never failed, because there
is no log to compare it with.

``--all`` loads events, states, rows and results in one pass each -- five
queries for a whole gameday (plus one to count the skipped legacy games), not
five per game and nothing per event -- so it is cheap enough to run after every
gameday.
"""

from django.core.management.base import BaseCommand, CommandError

from gameevents.models import GameEvent
from gameevents.service.reconcile import check_games
from gamedays.models import Gameinfo, TeamLog


class Command(BaseCommand):
    help = (
        "Compare GameState and TeamLog against a replay of GameEvent and "
        "report the first offending seq per game."
    )

    def add_arguments(self, parser):
        group = parser.add_mutually_exclusive_group(required=True)
        group.add_argument(
            "--game",
            type=int,
            metavar="ID",
            help="check one game",
        )
        group.add_argument(
            "--all",
            action="store_true",
            help="check every game that has events (legacy games are skipped)",
        )

    def handle(self, *args, **options):
        if options["game"] is not None:
            game_id = options["game"]
            if not Gameinfo.objects.filter(pk=game_id).exists():
                raise CommandError(f"No game found for gameId {game_id}")
            checks = check_games([game_id])
            legacy = sum(1 for check in checks if check.legacy)
            event_game_ids = [check.game_id for check in checks if not check.legacy]
        else:
            checks = check_games()
            legacy = self._legacy_games()
            event_game_ids = [check.game_id for check in checks]

        failed = [check for check in checks if not check.ok]
        for check in checks:
            self.stdout.write(check.summary())

        if options["all"]:
            self.stdout.write(
                f"checked {len(event_game_ids)} event-sourced game(s); "
                f"skipped {legacy} legacy game(s) without events"
            )
        elif legacy:
            self.stdout.write(
                f"game {checks[0].game_id} has no events; nothing to compare"
            )

        if failed:
            raise CommandError(
                f"{len(failed)} game(s) with drift; "
                "run rebuild_game_projection --game <id>"
            )
        self.stdout.write(self.style.SUCCESS("projection matches the event log"))

    @staticmethod
    def _legacy_games() -> int:
        """How many games with rows have no events at all (skipped, not failed)."""

        event_game_ids = GameEvent.objects.values_list("game_id", flat=True).distinct()
        return (
            TeamLog.objects.exclude(gameinfo_id__in=event_game_ids)
            .values("gameinfo_id")
            .distinct()
            .count()
        )
