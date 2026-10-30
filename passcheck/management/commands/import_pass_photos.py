from pathlib import Path

from django.core.files import File
from django.core.management.base import BaseCommand, CommandError
from django.utils import timezone

from passcheck.models import Player

PHOTO_EXTENSIONS = {".jpg", ".jpeg", ".png", ".webp"}


class Command(BaseCommand):
    help = (
        "Attach pass photos from a directory, matching each file name (without "
        "extension) to Player.pass_number. Consent is NOT recorded unless "
        "--consent is passed for a batch with written consent."
    )

    def add_arguments(self, parser):
        parser.add_argument(
            "--dir", required=True, help="Directory containing the photo files."
        )
        parser.add_argument(
            "--consent",
            action="store_true",
            help="Record photo consent for every imported photo (written consent only).",
        )
        parser.add_argument(
            "--dry-run",
            action="store_true",
            help="Report matches without writing photos.",
        )

    def handle(self, *args, **options):
        source = Path(options["dir"])
        if not source.is_dir():
            raise CommandError(f"Not a directory: {source}")

        imported = 0
        missing = []
        ambiguous = []
        for path in sorted(source.iterdir()):
            if path.suffix.lower() not in PHOTO_EXTENSIONS:
                continue
            pass_number = path.stem
            players = list(
                Player.objects.filter(pass_number=pass_number).select_related("person")
            )
            if not players:
                missing.append(pass_number)
                continue
            if len(players) > 1:
                ambiguous.append(pass_number)
                continue

            person = players[0].person
            if options["dry_run"]:
                self.stdout.write(
                    f"[dry-run] {path.name} -> {person.first_name} "
                    f"{person.last_name} ({pass_number})"
                )
                imported += 1
                continue

            if person.photo:
                person.photo.delete(save=False)
            with path.open("rb") as source_file:
                person.photo.save(path.name, File(source_file), save=False)
            person.photo_updated_at = timezone.now()
            if options["consent"]:
                person.photo_consent_at = timezone.now()
            person.save(update_fields=["photo", "photo_updated_at", "photo_consent_at"])
            imported += 1

        self.stdout.write(self.style.SUCCESS(f"Imported {imported} photo(s)."))
        if missing:
            self.stdout.write(
                self.style.WARNING(
                    f"No player for pass number(s): {', '.join(sorted(missing))}"
                )
            )
        if ambiguous:
            self.stdout.write(
                self.style.WARNING(
                    "Pass number(s) matched more than one player: "
                    f"{', '.join(sorted(ambiguous))}"
                )
            )
