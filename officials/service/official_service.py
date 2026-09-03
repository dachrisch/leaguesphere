import re
from typing import Optional

from django.db.models import Sum, Prefetch, Q
from django.db.models.functions import Coalesce

from gamedays.models import GameOfficial
from gamedays.service.team_repository_service import TeamRepositoryService
from officials.api.serializers import OfficialGameCountSerializer
from officials.models import Official, OfficialExternalGames
from officials.service.game_official_entries import (
    InternalGameOfficialEntry,
    ExternalGameOfficialEntry,
)
from officials.service.moodle.moodle_api import ApiCourse
from officials.service.moodle.moodle_service import MoodleService
from officials.service.officials_repository_service import OfficialsRepositoryService
from officials.service.serializers import OfficialLicenseCheckSerializer

# Closed set of license levels an official can hold, ordered highest to
# lowest (mirrors LicenseStrategy.COURSE_MAPPING's F1..F4 course names).
LICENSE_LEVELS = ["F1", "F2", "F3", "F4"]

# OfficialLicense.name is a free CharField with no choices/enum, and the
# established convention elsewhere in this codebase (see
# matchreport/tests/test_model_wrapper.py) is to suffix it with a year, e.g.
# "F1 2027" - so license levels are resolved by prefix, not exact match,
# matching how OfficialLicenseHistoryQuerySet.order_by_rank() already
# relies on plain alphabetical sorting rather than an exact-match filter.
_LICENSE_LEVEL_PATTERN = re.compile(r"^(F[1-4])\b")


def license_rank(license_name) -> Optional[int]:
    """Resolves a license name (e.g. "F2" or "F2 2022") to its rank index
    (0 = F1, the best, through 3 = F4), or None if it doesn't match a
    recognized F1-F4 level at all (e.g. a "-"/no-license placeholder)."""
    if not license_name:
        return None
    match = _LICENSE_LEVEL_PATTERN.match(license_name)
    if not match:
        return None
    return LICENSE_LEVELS.index(match.group(1))


class OfficialService:
    def __init__(self):
        self.official_repository_service = OfficialsRepositoryService()

    def get_all_teams_with_license_breakdown(self):
        """
        Combines the cached all-teams list (TeamRepositoryService.get_all_teams(),
        reused as-is) with a fresh per-team license breakdown. The team list
        may come from its existing 24h cache; the license breakdown is
        never cached since it must reflect officials' current license data.
        Officials without a currently valid license are only counted in
        each breakdown's "total", not shown as their own bucket.
        """
        teams = TeamRepositoryService.get_all_teams()
        breakdown = self.official_repository_service.get_team_license_breakdown()
        return {
            "teams_with_breakdown": [
                {"team": team, "license_breakdown": breakdown.get(team.pk, {})}
                for team in teams
            ],
            "license_levels": LICENSE_LEVELS,
        }

    def get_all_officials_with_team_infos(self, team_id, season, is_staff):
        team_repository_service = TeamRepositoryService(team_id)

        game_official_prefetch = Prefetch(
            "gameofficial_set",
            queryset=GameOfficial.objects.filter(
                gameinfo__gameday__date__year=season
            ).select_related("gameinfo__gameday"),
        )
        external_games_prefetch = Prefetch(
            "officialexternalgames_set",
            queryset=OfficialExternalGames.objects.filter(date__year=season),
        )

        all_team_officials = (
            Official.objects.select_related("team")
            .prefetch_related(
                game_official_prefetch,
                external_games_prefetch,
                "officiallicensehistory_set",
            )
            .filter(
                officiallicensehistory__created_at__gte=f"{season - 1}-10-01",
                officiallicensehistory__created_at__lte=f"{season}-12-31",
                team=team_repository_service.team,
            )
            .order_by("last_name", "first_name")
            .distinct()
        )
        all_team_years_with_official_license = sorted(
            self.official_repository_service.get_all_years_with_team_official_licenses(
                team_repository_service.team
            ),
            reverse=True,
        )
        from officials.urls import OFFICIALS_LIST_FOR_TEAM_AND_YEAR

        return {
            "season": season,
            "url_pattern": OFFICIALS_LIST_FOR_TEAM_AND_YEAR,
            "pk": team_id,
            "team_id": team_id,
            "team": team_repository_service.get_team_description(),
            "years": all_team_years_with_official_license,
            "officials_list": OfficialGameCountSerializer(
                many=True, instance=all_team_officials, season=season, is_staff=is_staff
            ).data,
        }

    def _obfuscate_result_list(self, result_list):
        for current_official in result_list.get("officials_list").get("list"):
            obfuscated_first_name = self._obfuscate_name(
                current_official.get("first_name")
            )
            obfuscated_last_name = self._obfuscate_name(
                current_official.get("last_name")
            )
            current_official.update(
                first_name=obfuscated_first_name, last_name=obfuscated_last_name
            )

    def _obfuscate_name(self, name: str):
        first_letter = name[0]
        all_other_letters = name[1:]
        return "".join(
            (first_letter, all_other_letters.replace(all_other_letters, "****"))
        )

    @staticmethod
    def create_game_official_entry(result) -> str:
        entry = InternalGameOfficialEntry(*result)
        return entry.save()

    def create_external_official_entry(self, result) -> str:
        entry = ExternalGameOfficialEntry(*result)
        return entry.save()

    def get_game_count_for_license(self, course_id: int) -> tuple[dict, ApiCourse]:
        moodle_service = MoodleService()
        course = moodle_service.get_course_by_id(course_id)
        external_ids: [] = moodle_service.get_all_users_for_course(course_id)
        officials = list(
            self.official_repository_service.get_officials_game_count_for_license(
                course.get_date(), external_ids
            ).values(*OfficialLicenseCheckSerializer.ALL_FIELD_VALUES)
        )
        for official in officials:
            external_ids.remove(int(official["external_id"]))
        for current_external_id in external_ids:
            officials.append(self._get_official_not_in_database(current_external_id))
        return (
            OfficialLicenseCheckSerializer(
                instance=officials,
                context={"license_id": course.get_license_id()},
                many=True,
            ).data,
            course,
        )

    def _get_official_not_in_database(self, external_id):
        return {
            "external_id": f"{external_id}",
            "id": None,
            "first_name": "",
            "last_name": "",
            "license_name": "-",
            "license_years": "-",
            "team__description": "Person hat noch nie an einem Kurs teilgenommen",
            "total_games": 0,
            "total_season_games": 0,
        }

    def _aggregate_games(self, external_official_qs):
        all_external_games_count = (
            external_official_qs.aggregate(num_games=Sum("number_games")).get(
                "num_games", 0
            )
            or 0
        )
        return all_external_games_count
