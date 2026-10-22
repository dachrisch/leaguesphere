"""Report existing duplicate ``(season, league)`` assignments.

``SeasonLeagueTeam`` has no uniqueness constraint: the seeder relies on
``get_or_create`` and the admin's ``duplicate_entry`` action can create
duplicates, so historic rows may hold more than one assignment per
``(season, league)``. The UI prevents new ones (form + service layer); this
command reports the existing ones so a follow-up migration can be prepared
safely. It changes nothing.

Usage:
    python manage.py report_duplicate_season_league_teams
"""

from collections import defaultdict

from django.core.management.base import BaseCommand

from gamedays.models import SeasonLeagueTeam


class Command(BaseCommand):
    help = (
        "Report SeasonLeagueTeam rows that duplicate an existing "
        "(season, league) assignment. Read-only."
    )

    def handle(self, *args, **options):
        rows = SeasonLeagueTeam.objects.order_by(
            "season__name", "league__name", "pk"
        ).values_list("season__name", "league__name", "pk")

        grouped = defaultdict(list)
        for season_name, league_name, pk in rows:
            grouped[(season_name, league_name)].append(pk)

        duplicates = {key: pks for key, pks in grouped.items() if len(pks) > 1}

        if not duplicates:
            self.stdout.write("Keine Duplikate gefunden.")
            return

        for (season_name, league_name), pks in sorted(duplicates.items()):
            ids = ", ".join(str(pk) for pk in pks)
            self.stdout.write(
                f"{season_name} / {league_name}: {len(pks)} Zuordnungen "
                f"(ids: {ids})"
            )
        self.stdout.write(
            f"{len(duplicates)} Duplikat(e) gefunden. Es wurde nichts geändert."
        )
