"""
Read-only reconstruction of a "migration plan" for turning an existing
(pre-Designer) gameday into a Gameday Designer canvas.

GamedayMigrationService never writes to Gameinfo, Gameresult, GameOfficial,
Gameday, or any other existing model, and it never creates a
GamedayDesignerState row. It only reads the gameday's real, already-played
(or already-scheduled) schedule and results, and serializes a plan describing
how to reconstruct that schedule as a Designer canvas. Building the actual
GamedayDesignerState row is the frontend's job, via the existing
``designer-state`` PUT action, using the plan this service returns.
"""

import logging
from collections import defaultdict

from gamedays.models import Gameday, Gameinfo, Gameresult
from gamedays.service.placeholder_service import GamedayPlaceholderService
from gamedays.service.stage_category import derive_legacy_stage_category
from gameday_designer.models import TemplateSlot

logger = logging.getLogger(__name__)


class GamedayMigrationError(Exception):
    """Raised when a gameday cannot be migrated to a Designer-based plan."""


class GamedayMigrationService:
    """
    Reconstructs a migration plan for ``gameday`` describing how its existing
    schedule/results map onto a Designer ``ScheduleTemplate``.

    The plan mirrors the ``GenericTemplate`` shape the frontend's
    ``applyGenericTemplate`` (gameday_designer/src/utils/templateMapper.ts)
    already knows how to turn into canvas nodes/edges, plus the extra
    ``team_mapping``/``warnings`` this migration-specific step needs.
    """

    def __init__(self, gameday: Gameday):
        self.gameday = gameday
        self._placeholder_service = GamedayPlaceholderService(gameday.pk)

    def build_plan(self) -> dict:
        template = self._placeholder_service.get_template()
        if template is None:
            raise GamedayMigrationError(
                f"No schedule template could be resolved for gameday "
                f"{self.gameday.pk}; cannot build a migration plan."
            )

        gameinfos = list(Gameinfo.objects.filter(gameday=self.gameday))
        if not gameinfos:
            raise GamedayMigrationError(
                f"Gameday {self.gameday.pk} has no games; nothing to migrate."
            )

        warnings: list[str] = []
        team_mapping: dict[str, dict] = {}
        # Backfilled stage_category per matched TemplateSlot.pk -- only slots
        # that were successfully matched to a real Gameinfo get an entry here;
        # everything else falls back to derive_legacy_stage_category(slot.stage).
        stage_category_by_slot_id: dict[int, str] = {}

        for gi in gameinfos:
            slot = self._placeholder_service._find_slot_for_game(gi)
            if slot is None or gi.standing != slot.standing:
                # Either no slot lines up at all, or the chronological
                # field/time match landed on a slot meant for a *different*
                # standing -- a real tie-break edge case when two games on
                # the same field share an identical `scheduled` time and
                # collapse to the same slot index. Either way: best-effort,
                # skip and warn, never raise.
                warnings.append(
                    f"Game {gi.pk} (standing '{gi.standing}') could not be "
                    "reliably matched to a template slot; skipped."
                )
                continue

            stage_category_by_slot_id[slot.pk] = gi.stage_category

            self._record_slot_role(
                team_mapping,
                warnings,
                slot.home_group,
                slot.home_team,
                gi,
                is_home=True,
            )
            self._record_slot_role(
                team_mapping,
                warnings,
                slot.away_group,
                slot.away_team,
                gi,
                is_home=False,
            )
            self._record_official(
                team_mapping, warnings, slot.official_group, slot.official_team, gi
            )

        all_slots = list(
            TemplateSlot.objects.filter(template=template).order_by(
                "field", "slot_order"
            )
        )

        return {
            "template_id": template.pk,
            "num_fields": template.num_fields,
            "num_groups": template.num_groups,
            "group_config": self._build_group_config(template, team_mapping),
            "slots": [
                self._serialize_slot(slot, stage_category_by_slot_id)
                for slot in all_slots
            ],
            "team_mapping": team_mapping,
            "warnings": warnings,
        }

    def _record_slot_role(
        self, team_mapping, warnings, group, team_idx, gi, *, is_home
    ):
        if group is None:
            return
        result = Gameresult.objects.filter(gameinfo=gi, isHome=is_home).first()
        if result is None or result.team is None:
            return
        self._add_mapping(team_mapping, warnings, group, team_idx, result.team)

    def _record_official(self, team_mapping, warnings, group, team_idx, gi):
        if group is None:
            return
        # `officials` is a non-nullable FK on Gameinfo -- always resolvable.
        self._add_mapping(team_mapping, warnings, group, team_idx, gi.officials)

    @staticmethod
    def _add_mapping(team_mapping, warnings, group, team_idx, team):
        key = f"{group}_{team_idx}"
        existing = team_mapping.get(key)
        if existing is None:
            team_mapping[key] = {"id": team.pk, "label": team.name}
        elif existing["id"] != team.pk:
            warnings.append(
                f"Slot {key} has conflicting team assignments across games; "
                "using the first one found."
            )

    @staticmethod
    def _build_group_config(template, team_mapping) -> list[dict]:
        team_indices_by_group: dict[int, set] = defaultdict(set)
        for key in team_mapping:
            group_str, team_str = key.split("_", 1)
            team_indices_by_group[int(group_str)].add(int(team_str))

        return [
            {
                # Matches the frontend's own default group-naming convention
                # (templateMapper.ts / useDesignerController.ts fallback:
                # `Gruppe ${String.fromCharCode(65 + i)}`), so a migrated
                # canvas looks the same as one built by hand.
                "name": f"Gruppe {chr(65 + group_idx)}",
                "team_count": len(team_indices_by_group.get(group_idx, ())),
            }
            for group_idx in range(template.num_groups)
        ]

    @staticmethod
    def _serialize_slot(slot: TemplateSlot, stage_category_by_slot_id: dict) -> dict:
        stage_category = stage_category_by_slot_id.get(slot.pk)
        if not stage_category:
            stage_category = derive_legacy_stage_category(slot.stage)

        return {
            "field": slot.field,
            "slot_order": slot.slot_order,
            "stage": slot.stage,
            "stage_type": slot.stage_type,
            "stage_category": stage_category,
            "standing": slot.standing,
            "home_group": slot.home_group,
            "home_team": slot.home_team,
            "home_reference": slot.home_reference,
            "away_group": slot.away_group,
            "away_team": slot.away_team,
            "away_reference": slot.away_reference,
            "official_group": slot.official_group,
            "official_team": slot.official_team,
            "official_reference": slot.official_reference,
            "break_after": slot.break_after,
        }
