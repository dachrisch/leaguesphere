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
from django.db.models import Exists, OuterRef

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
        parser.add_argument(
            "--legacy-cutoff",
            type=int,
            default=None,
            help="include only accepted legacy games with id <= CUTOFF (reproducible digest)",
        )

    def handle(self, *args, **options):
        if options["game"] is not None:
            game_id = options["game"]
            if not Gameinfo.objects.filter(pk=game_id).exists():
                raise CommandError(f"No game found for gameId {game_id}")
            checks = check_games([game_id])
            # A shadow-only game is part of the accepted legacy set even when
            # it has events; only a v2 game has to reconcile.
            shadow_only_games = [
                (check.game_id, check.season_id)
                for check in checks
                if not check.legacy and check.source != GameEvent.Source.V2
            ]
            legacy_games = [
                (check.game_id, check.season_id) for check in checks if check.legacy
            ] + shadow_only_games
            event_game_ids = [
                check.game_id
                for check in checks
                if not check.legacy and check.source == GameEvent.Source.V2
            ]
        else:
            checks = check_games()
            legacy_games, shadow_only_games = self._legacy_games()
            event_game_ids = [check.game_id for check in checks]
        cutoff = options["legacy_cutoff"]
        if cutoff is not None:
            legacy_games = [game for game in legacy_games if game[0] <= cutoff]
            shadow_only_games = [
                game for game in shadow_only_games if game[0] <= cutoff
            ]
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
                shadow_only_games,
                cutoff,
            )

        if failed:
            raise CommandError(
                f"{len(failed)} game(s) with drift; "
                "run rebuild_game_projection --game <id>"
            )
        self.stdout.write(self.style.SUCCESS("projection matches the event log"))

    @staticmethod
    def _write_report(
        path, checks, legacy_games, ref_sha, cand_sha, shadow_only_games=(), cutoff=None
    ):
        """Write the report JSON. Pure data assembly; no extra queries."""

        payload = report_service.build_report(
            checks=checks,
            legacy_games=legacy_games,
            shadow_only_games=shadow_only_games,
            legacy_cutoff=cutoff,
            generated_at=datetime.datetime.now(datetime.timezone.utc).isoformat(),
            ref_sha=ref_sha,
            cand_sha=cand_sha,
        )
        Path(path).write_text(
            json.dumps(payload, indent=2, sort_keys=True) + "\n", encoding="utf-8"
        )

    @staticmethod
    def _legacy_games() -> tuple[list, list]:
        """``(whole accepted set, shadow-only breakdown)`` as ``(id, season)``.

        One query, as before: two ``EXISTS`` subqueries distinguish a game
        with no events from a shadow-only game without a second round trip.
        Both cases are part of the accepted set; a v2 game never is.
        """

        any_event = GameEvent.objects.filter(game_id=OuterRef("gameinfo_id"))
        v2_event = any_event.filter(source=GameEvent.Source.V2)
        rows = (
            TeamLog.objects.values("gameinfo_id", "gameinfo__gameday__season_id")
            .annotate(has_event=Exists(any_event), has_v2=Exists(v2_event))
            .distinct()
        )
        accepted = []
        shadow_only = []
        for row in rows:
            if row["has_v2"]:
                continue
            game = (row["gameinfo_id"], row["gameinfo__gameday__season_id"])
            accepted.append(game)
            if row["has_event"]:
                shadow_only.append(game)
        return accepted, shadow_only
