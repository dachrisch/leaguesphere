"""Copy the built-in crew defaults into a league so they can be edited."""

from django.core.management.base import BaseCommand, CommandError

from gamedays.models import League
from officials.models import CrewPosition
from officials.service.crew_positions import DEFAULT_CREW_POSITIONS


class Command(BaseCommand):
    help = (
        "Legt für eine Liga die Standard-Crew-Positionen an (Scorecard Judge "
        "optional, Schiedsrichter/Down Judge/Field Judge/Side Judge "
        "erforderlich). Bereits vorhandene Positionen bleiben unverändert."
    )

    def add_arguments(self, parser):
        parser.add_argument(
            "leagues",
            nargs="*",
            metavar="LIGA",
            help="Slug oder ID einer Liga; mehrere möglich. Ohne Angabe ist "
            "--all nötig.",
        )
        parser.add_argument(
            "--all",
            action="store_true",
            help="Alle Ligen der Datenbank befüllen.",
        )

    def handle(self, *args, **options):
        leagues = self._leagues(options["leagues"], options["all"])
        created = 0
        for league in leagues:
            existing = set(
                CrewPosition.objects.filter(league=league).values_list(
                    "position", flat=True
                )
            )
            for position in DEFAULT_CREW_POSITIONS:
                if position["position"] in existing:
                    continue
                CrewPosition.objects.create(league=league, **position)
                created += 1
            self.stdout.write(
                self.style.SUCCESS(f"{league.name}: Crew-Positionen vollständig")
            )
        self.stdout.write(
            self.style.SUCCESS(f"{created} Crew-Position(en) angelegt.")
        )

    @staticmethod
    def _leagues(identifiers, seed_all: bool) -> list[League]:
        if seed_all:
            if identifiers:
                raise CommandError("Entweder Ligen angeben oder --all, nicht beides.")
            leagues = list(League.objects.order_by("name"))
            if not leagues:
                raise CommandError("Es gibt keine Liga zum Befüllen.")
            return leagues
        if not identifiers:
            raise CommandError("Bitte einen Liga-Slug, eine ID oder --all angeben.")
        leagues = []
        for identifier in identifiers:
            league = League.objects.filter(slug=identifier).first()
            if league is None and identifier.isdigit():
                league = League.objects.filter(pk=int(identifier)).first()
            if league is None:
                raise CommandError(f"Liga '{identifier}' wurde nicht gefunden.")
            leagues.append(league)
        return leagues
