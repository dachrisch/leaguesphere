from django.core.management.base import BaseCommand, CommandError

from passcheck.models import PasscheckVerification


class Command(BaseCommand):
    help = (
        "Clear the v2 field-app device lock on passcheck verifications. "
        "Use after a referee's phone was replaced or the app data was wiped."
    )

    def add_arguments(self, parser):
        parser.add_argument("--team", type=int, help="Only this team id.")
        parser.add_argument("--gameday", type=int, help="Only this gameday id.")
        parser.add_argument(
            "--all",
            action="store_true",
            help="Clear the lock on every verification (dangerous).",
        )

    def handle(self, *args, **options):
        if not (options["team"] or options["gameday"] or options["all"]):
            raise CommandError(
                "Provide --team and/or --gameday, or --all to clear every lock."
            )

        verifications = PasscheckVerification.objects.all()
        if options["team"]:
            verifications = verifications.filter(team_id=options["team"])
        if options["gameday"]:
            verifications = verifications.filter(gameday_id=options["gameday"])

        updated = verifications.update(device_id="")
        self.stdout.write(
            self.style.SUCCESS(f"Cleared the device lock on {updated} verification(s).")
        )
