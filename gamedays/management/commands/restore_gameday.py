"""Scoped, reversible recovery of a single gameday's game data.

Restores the ``Gameinfo`` subtree (games + results + team logs + officials +
setups + player achievements) for ONE gameday from a JSON export, replacing
whatever is currently on the target DB for that gameday. Optionally also
restores the gameday's designer canvas (``GamedayDesignerState``).

Built for the gd874 incident (dachrisch/leaguesphere#1550): an unlock ->
re-publish ran ``CanvasPublishService.apply()``, which deletes every ``Gameinfo``
for the gameday; ``Gameresult``, ``TeamLog``, ``GameSetup``, ``GameOfficial`` and
``PlayerAchievement`` all CASCADE off ``Gameinfo``, so entered results were lost.
This command promotes the correct rows from a source DB (e.g. the stage DB
restored from the pre-wipe backup) into prod, touching ONLY that one gameday.

Two modes
---------
1) EXPORT -- run in the container whose DB holds the good data (e.g. stage)::

     python manage.py restore_gameday --gameday 874 --export gd874.json [--include-canvas]

2) APPLY -- run in the container whose DB you want to fix (e.g. prod). DRY-RUN by
   default; nothing is committed unless you pass ``--execute``::

     python manage.py restore_gameday --gameday 874 --load gd874.json [--include-canvas] [--execute]

Safety
------
* Apply is a DRY RUN unless ``--execute`` is given: everything runs inside a
  transaction that is rolled back, after printing exactly what would change.
* Before any change the target's current rows for the gameday are written to a
  timestamped pre-image backup file (the rollback point).
* The whole apply is one transaction: delete-current + re-insert-from-export
  commit together or not at all. A missing FK target (e.g. a Team that no longer
  exists) raises and rolls back, leaving the target untouched.
* The loaded file is validated to belong to the requested gameday before use.
* PKs are preserved (raw save), so foreign keys that pointed at the original rows
  resolve unchanged.

No image rebuild is required to run this against a live container: copy this file
into the running container's ``gamedays/management/commands/`` directory and
invoke it with ``manage.py`` -- Django discovers commands at runtime.
"""

from __future__ import annotations

import os
from datetime import datetime

from django.core import serializers
from django.core.serializers.base import DeserializationError
from django.core.management.base import BaseCommand, CommandError
from django.db import transaction

from gamedays.models import (
    Gameinfo,
    Gameresult,
    GameOfficial,
    GameSetup,
    TeamLog,
    PlayerAchievement,
    GamedayDesignerState,
)

# The complete blast radius of a gameday publish/wipe: Gameinfo plus every table
# with a FK to it. Verified exhaustively -- only gamedays.models references
# Gameinfo. Ordered parents-first so deserialize() saves Gameinfo before its
# children (FK integrity on insert).
GAMEINFO_LABEL = "gamedays.gameinfo"
CANVAS_LABEL = "gamedays.gamedaydesignerstate"


class Command(BaseCommand):
    help = (
        "Scoped, reversible restore of a single gameday's Gameinfo subtree "
        "from a JSON export (dry-run by default)."
    )

    def add_arguments(self, parser):
        parser.add_argument(
            "--gameday", type=int, required=True,
            help="Gameday id to export/restore -- the scope of the operation.",
        )
        mode = parser.add_mutually_exclusive_group(required=True)
        mode.add_argument(
            "--export", metavar="PATH",
            help="EXPORT mode: write the gameday's rows to this JSON file.",
        )
        mode.add_argument(
            "--load", metavar="PATH",
            help="APPLY mode: restore the gameday from this JSON file "
                 "(dry-run unless --execute).",
        )
        parser.add_argument(
            "--include-canvas", action="store_true",
            help="Also include/restore the GamedayDesignerState (designer canvas) row.",
        )
        parser.add_argument(
            "--execute", action="store_true",
            help="APPLY mode only: actually COMMIT. Without it, apply is a dry-run "
                 "that rolls back.",
        )
        parser.add_argument(
            "--backup-dir", default=".",
            help="APPLY mode: directory for the pre-image rollback backup "
                 "(default: current directory).",
        )

    def handle(self, *args, **opts):
        gameday_id = opts["gameday"]
        if opts["export"]:
            self._export(gameday_id, opts["export"], opts["include_canvas"])
        else:
            self._apply(
                gameday_id, opts["load"], opts["include_canvas"],
                opts["execute"], opts["backup_dir"],
            )

    # -- scope -----------------------------------------------------------------

    def _scoped_querysets(self, gameday_id, include_canvas):
        """(label, queryset) pairs for the gameday, parents-first."""
        qs = [
            (GAMEINFO_LABEL,
             Gameinfo.objects.filter(gameday_id=gameday_id).order_by("id")),
            ("gamedays.gameresult",
             Gameresult.objects.filter(gameinfo__gameday_id=gameday_id).order_by("id")),
            ("gamedays.gameofficial",
             GameOfficial.objects.filter(gameinfo__gameday_id=gameday_id).order_by("id")),
            ("gamedays.gamesetup",
             GameSetup.objects.filter(gameinfo__gameday_id=gameday_id).order_by("id")),
            ("gamedays.teamlog",
             TeamLog.objects.filter(gameinfo__gameday_id=gameday_id).order_by("id")),
            ("gamedays.playerachievement",
             PlayerAchievement.objects.filter(game__gameday_id=gameday_id).order_by("id")),
        ]
        if include_canvas:
            qs.append(
                (CANVAS_LABEL,
                 GamedayDesignerState.objects.filter(gameday_id=gameday_id))
            )
        return qs

    def _db_counts(self, gameday_id, include_canvas):
        return {label: q.count()
                for label, q in self._scoped_querysets(gameday_id, include_canvas)}

    # -- export ----------------------------------------------------------------

    def _export(self, gameday_id, path, include_canvas):
        objects, counts = [], {}
        for label, q in self._scoped_querysets(gameday_id, include_canvas):
            rows = list(q)
            counts[label] = len(rows)
            objects.extend(rows)
        if counts.get(GAMEINFO_LABEL, 0) == 0:
            raise CommandError(
                f"No Gameinfo rows for gameday {gameday_id}; nothing to export."
            )
        with open(path, "w") as fh:
            serializers.serialize("json", objects, indent=2, stream=fh)
        self.stdout.write(self.style.SUCCESS(
            f"Exported gameday {gameday_id} -> {path}"))
        self._print_counts("exported", counts)

    # -- apply -----------------------------------------------------------------

    def _apply(self, gameday_id, path, include_canvas, execute, backup_dir):
        if not os.path.exists(path):
            raise CommandError(f"Load file not found: {path}")
        with open(path) as fh:
            content = fh.read()

        try:
            loaded = list(serializers.deserialize("json", content))
        except DeserializationError as exc:
            raise CommandError(f"Could not parse load file {path}: {exc}")

        self._validate_scope(loaded, gameday_id, include_canvas)
        source_counts = self._count_objects(o.object for o in loaded)
        if source_counts.get(GAMEINFO_LABEL, 0) == 0:
            raise CommandError(
                "Load file contains no Gameinfo rows; refusing to wipe the gameday."
            )

        mode = "EXECUTE" if execute else "DRY RUN"
        self.stdout.write(self.style.WARNING(
            f"=== restore_gameday {gameday_id} [{mode}] ==="))

        preimage = self._write_preimage(gameday_id, include_canvas, backup_dir)
        self.stdout.write(f"Pre-image rollback backup: {preimage}")

        before = self._db_counts(gameday_id, include_canvas)

        try:
            with transaction.atomic():
                # Remove the gameday's current subtree. Deleting Gameinfo cascades
                # to results/logs/officials/setups/achievements at the DB level.
                Gameinfo.objects.filter(gameday_id=gameday_id).delete()
                if include_canvas:
                    GamedayDesignerState.objects.filter(gameday_id=gameday_id).delete()

                # Re-insert from the export, parents-first, preserving PKs.
                for obj in loaded:
                    obj.save()

                after = self._db_counts(gameday_id, include_canvas)
                self._verify(source_counts, after)
                self._print_diff(before, after)

                if not execute:
                    transaction.set_rollback(True)
        except CommandError:
            raise
        except Exception as exc:  # noqa: BLE001 -- surface any failure, stay rolled back
            raise CommandError(
                f"Restore failed (transaction rolled back, target unchanged): {exc}"
            )

        if execute:
            self.stdout.write(self.style.SUCCESS(
                f"COMMITTED restore of gameday {gameday_id}."))
        else:
            self.stdout.write(self.style.WARNING(
                "DRY RUN complete -- rolled back, target unchanged. "
                "Re-run with --execute to commit."))
        self.stdout.write(f"Rollback point: {preimage}")

    # -- helpers ---------------------------------------------------------------

    def _validate_scope(self, loaded, gameday_id, include_canvas):
        """Reject a file that carries rows for a different gameday (or a canvas
        row when --include-canvas was not requested)."""
        gameinfo_pks = {
            o.object.pk for o in loaded
            if o.object._meta.label_lower == GAMEINFO_LABEL
        }
        for o in loaded:
            obj = o.object
            label = obj._meta.label_lower
            if label == GAMEINFO_LABEL:
                if obj.gameday_id != gameday_id:
                    raise CommandError(
                        f"Load file has Gameinfo {obj.pk} for gameday "
                        f"{obj.gameday_id}, expected {gameday_id}.")
            elif label == CANVAS_LABEL:
                if not include_canvas:
                    raise CommandError(
                        "Load file contains a designer-canvas row but "
                        "--include-canvas was not given. Re-run with "
                        "--include-canvas or re-export without it.")
                if obj.gameday_id != gameday_id:
                    raise CommandError(
                        f"Load file has canvas for gameday {obj.gameday_id}, "
                        f"expected {gameday_id}.")
            elif label == "gamedays.playerachievement":
                if obj.game_id not in gameinfo_pks:
                    raise CommandError(
                        f"PlayerAchievement {obj.pk} references gameinfo "
                        f"{obj.game_id} that is not in the load file.")
            else:  # gameresult / gameofficial / gamesetup / teamlog
                if obj.gameinfo_id not in gameinfo_pks:
                    raise CommandError(
                        f"{label} {obj.pk} references gameinfo {obj.gameinfo_id} "
                        f"that is not in the load file.")

    def _verify(self, source_counts, after_counts):
        for label, expected in source_counts.items():
            actual = after_counts.get(label, 0)
            if actual != expected:
                raise CommandError(
                    f"Post-restore count mismatch for {label}: "
                    f"expected {expected}, got {actual}.")

    @staticmethod
    def _count_objects(objs):
        counts = {}
        for obj in objs:
            label = obj._meta.label_lower
            counts[label] = counts.get(label, 0) + 1
        return counts

    def _write_preimage(self, gameday_id, include_canvas, backup_dir):
        objects = []
        for _, q in self._scoped_querysets(gameday_id, include_canvas):
            objects.extend(list(q))
        os.makedirs(backup_dir, exist_ok=True)
        ts = datetime.now().strftime("%Y%m%d-%H%M%S")
        path = os.path.join(backup_dir, f"gameday_{gameday_id}_preimage_{ts}.json")
        with open(path, "w") as fh:
            serializers.serialize("json", objects, indent=2, stream=fh)
        return path

    def _print_counts(self, verb, counts):
        for label, n in counts.items():
            self.stdout.write(f"  {label:<32} {verb} {n}")

    def _print_diff(self, before, after):
        self.stdout.write(f"  {'table':<32} {'before':>8} {'after':>8}")
        for label in before:
            self.stdout.write(
                f"  {label:<32} {before[label]:>8} {after.get(label, 0):>8}")
