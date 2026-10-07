"""Null Team.logo where the uploaded file no longer exists.

Uploads live on container disk (MEDIA_ROOT); a lost volume, a deleted file or
a stale DB row leaves a logo path that serves a 404 to every consumer
(snapshot include=teams, share widget, teammanager pages). This command finds
those rows so managers can be asked to re-upload.

Usage:
    python manage.py clear_missing_logos --dry-run   # list only
    python manage.py clear_missing_logos              # null the dead refs
"""

from django.core.management.base import BaseCommand

from gamedays.models import Team


class Command(BaseCommand):
    help = (
        "Null Team.logo where the file is missing from storage (--dry-run lists only)."
    )

    def add_arguments(self, parser):
        parser.add_argument(
            "--dry-run",
            action="store_true",
            help="List affected teams without changing anything.",
        )

    def handle(self, *args, **opts):
        dry_run = opts["dry_run"]
        missing = [
            team
            for team in Team.objects.exclude(logo="").exclude(logo__isnull=True)
            if not team.logo.storage.exists(team.logo.name)
        ]
        for team in missing:
            self.stdout.write(f"{team.pk}: {team.name} ({team.logo.name})")
            if not dry_run:
                team.logo = None
                team.save(update_fields=["logo", "updated_at"])
        if dry_run:
            self.stdout.write(f"Dry run: {len(missing)} team(s) would be cleared.")
        else:
            self.stdout.write(f"Cleared {len(missing)} team(s).")
