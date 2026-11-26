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

import datetime
import json
from pathlib import Path

from django.core.management.base import BaseCommand, CommandError

from gameevents.models import GameEvent
from gameevents.service import report as report_service
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
        # Additive: none of these change stdout, exit status or query count.
        parser.add_argument(
            "--report",
            metavar="PATH",
            help="also write a JSON reconciliation report to PATH",
        )
        parser.add_argument(
            "--ref-sha", default="", help="baseline commit recorded in the report"
        )
        parser.add_argument(
            "--cand-sha", default="", help="candidate commit recorded in the report"
        )

    def handle(self, *args, **options):
        if options["game"] is not None:
            game_id = options["game"]
            if not Gameinfo.objects.filter(pk=game_id).exists():
                raise CommandError(f"No game found for gameId {game_id}")
            checks = check_games([game_id])
            legacy_games = [
                (check.game_id, check.season_id) for check in checks if check.legacy
            ]
            event_game_ids = [check.game_id for check in checks if not check.legacy]
        else:
            checks = check_games()
            legacy_games = self._legacy_games()
            event_game_ids = [check.game_id for check in checks]
        legacy = len(legacy_games)

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

        if options["report"]:
            self._write_report(
                options["report"],
                checks,
                legacy_games,
                options["ref_sha"],
                options["cand_sha"],
            )

        if failed:
            raise CommandError(
                f"{len(failed)} game(s) with drift; "
                "run rebuild_game_projection --game <id>"
            )
        self.stdout.write(self.style.SUCCESS("projection matches the event log"))

    @staticmethod
    def _write_report(path, checks, legacy_games, ref_sha, cand_sha):
        """Write the report JSON. Pure data assembly; no extra queries."""

        payload = report_service.build_report(
            checks=checks,
            legacy_games=legacy_games,
            generated_at=datetime.datetime.now(datetime.timezone.utc).isoformat(),
            ref_sha=ref_sha,
            cand_sha=cand_sha,
        )
        Path(path).write_text(
            json.dumps(payload, indent=2, sort_keys=True) + "\n", encoding="utf-8"
        )

    @staticmethod
    def _legacy_games() -> list:
        """``(game id, season id)`` for games with rows but no events.

        One query, as before -- the season is read through the same join so
        the report needs no extra query. The caller derives the skipped count
        with ``len()``; stdout stays byte-identical.
        """

        event_game_ids = GameEvent.objects.values_list("game_id", flat=True).distinct()
        return list(
            TeamLog.objects.exclude(gameinfo_id__in=event_game_ids)
            .values_list("gameinfo_id", "gameinfo__gameday__season_id")
            .distinct()
        )
