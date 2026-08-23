from collections import defaultdict
from datetime import datetime, timedelta

from django.db.models import (
    Sum,
    Count,
    Q,
    OuterRef,
    Subquery,
    Value,
    FloatField,
    CharField,
    F,
)
from django.db.models.functions import Coalesce

from officials.models import (
    Official,
    OfficialLicenseHistory,
    OfficialExternalGames,
)
from officials.service.boff_license_calculation import LicenseStrategy
from officials.service.funcs import GroupConcat


class OfficialsRepositoryService:
    # noinspection PyMethodMayBeStatic
    def get_officials_game_count_for_license(
        self,
        latest_date: datetime,
        external_ids: list[str],
        license_ids: list[int] = (1, 3),
    ):
        officials = (
            Official.objects.filter(external_id__in=external_ids)
            # TODO: move into QuerySet
            .annotate(
                license_years=Coalesce(
                    Subquery(
                        OfficialLicenseHistory.objects.filter(
                            official=OuterRef("pk"), license_id__in=license_ids
                        )
                        .annotate(year=F("created_at__year"))
                        .values("official")
                        .annotate(
                            years=GroupConcat(F("year"), ordering="created_at ASC")
                        )
                        .values("years"),
                        output_field=CharField(),
                    ),
                    Value("-", output_field=CharField()),
                ),
                license_name=Coalesce(
                    Subquery(self._license_name_subquery(latest_date.year)), Value("-")
                ),
                license_id=Subquery(self._license_id_subquery(latest_date.year)),
                total_games=Subquery(self._internal_games_subquery(latest_date))
                + Subquery(self._external_games_subquery(latest_date)),
                total_season_games=Subquery(
                    self._current_season_external_subquery(latest_date)
                )
                + Subquery(self._current_season_internal_subquery(latest_date)),
            ).order_by("last_name")
        )

        return officials

    @classmethod
    def _generic_games_subquery_with_calculation(cls, query_filter: Q):
        """
        Subquery that calculates and sums `calculated_number_games` for official external games.
        """
        calculated_number_games = OfficialExternalGames.calculated_games_expression(
            "officialexternalgames__"
        )

        return (
            Official.objects.filter(pk=OuterRef("pk"))
            .annotate(
                games=Coalesce(
                    Sum(
                        calculated_number_games,
                        filter=query_filter,
                        output_field=FloatField(),
                    ),
                    Value(0),
                    output_field=FloatField(),
                )
            )
            .values("games")[:1]
        )

    @staticmethod
    def _license_subquery(year: int, field: str):
        """
        Helper method to create subqueries for license name or ID in a specific year.

        :param year: The target year for the query filter.
        :param field: The specific field to retrieve (e.g., 'license__name' or 'license__pk').
        :return: Subquery to retrieve the desired field for the license in the specified year.
        """
        return OfficialLicenseHistory.objects.filter(
            official=OuterRef("pk"), created_at__year=year
        ).values(field)[:1]

    @staticmethod
    def _license_name_subquery(year: int):
        return OfficialsRepositoryService._license_subquery(
            year=year - 1, field="license__name"
        )

    @staticmethod
    def _license_id_subquery(year: int):
        return OfficialsRepositoryService._license_subquery(
            year=year - 1, field="license__pk"
        )

    @staticmethod
    def _generic_games_subquery(
        field: str, aggregation, query_filter: Q, exclude_scorecard_judge: bool = False
    ):
        """
        Helper method to generate subqueries for various game counts.

        :param field: The field to aggregate on.
        :param aggregation: Aggregation function (Sum, Count, etc.)
        :param query_filter: The query filter to filter down the aggregation.
        :param exclude_scorecard_judge: Boolean indicating if Scorecard Judge positions should be excluded.
        :return: Subquery for the aggregated games count.
        """
        if exclude_scorecard_judge:
            query_filter &= ~Q(gameofficial__position="Scorecard Judge")

        return (
            Official.objects.filter(pk=OuterRef("pk"))
            .annotate(games=Coalesce(aggregation(field, filter=query_filter), Value(0)))
            .values("games")[:1]
        )

    @classmethod
    def _external_games_subquery(cls, date: datetime):
        return cls._generic_games_subquery_with_calculation(
            query_filter=Q(officialexternalgames__date__lte=date)
        )

    @classmethod
    def _current_season_external_subquery(cls, date: datetime):
        return cls._generic_games_subquery_with_calculation(
            query_filter=(
                Q(officialexternalgames__date__lte=date)
                & Q(
                    officialexternalgames__date__gte=OfficialsRepositoryService.sub_one_year_from(
                        date
                    )
                )
            )
        )

    @classmethod
    def sub_one_year_from(cls, date: datetime):
        return date - timedelta(days=365)

    @classmethod
    def _internal_games_subquery(cls, date: datetime):
        return cls._generic_games_subquery(
            field="gameofficial",
            query_filter=Q(gameofficial__gameinfo__gameday__date__lte=date),
            aggregation=Count,
            exclude_scorecard_judge=True,
        )

    @classmethod
    def _current_season_internal_subquery(cls, date: datetime):
        return cls._generic_games_subquery(
            field="gameofficial",
            query_filter=(
                Q(gameofficial__gameinfo__gameday__date__lte=date)
                & Q(
                    gameofficial__gameinfo__gameday__date__gte=OfficialsRepositoryService.sub_one_year_from(
                        date
                    )
                )
            ),
            aggregation=Count,
            exclude_scorecard_judge=True,
        )

    @classmethod
    def _position_games_subquery(cls, position: str, season: int):
        return cls._generic_games_subquery(
            field="gameofficial",
            aggregation=Count,
            query_filter=Q(
                gameofficial__position=position,
                gameofficial__gameinfo__gameday__date__year=season,
            ),
        )

    @classmethod
    def _external_games_total_subquery(cls, season: int):
        return cls._generic_games_subquery_with_calculation(
            query_filter=Q(officialexternalgames__date__year=season)
        )

    def get_officials_statistics_for_season(self, season: int):
        """
        Sitewide leaderboard of officials by LeagueSphere-recorded games
        ("Scorecard Judge" is never one of the four counted positions, so
        it's implicitly excluded) for one season, ranked by total games
        descending. External games are annotated for display only and do
        not affect the ranking. Officials without any LeagueSphere game
        that season are excluded. One query total.
        """
        referee_sq = self._position_games_subquery("Referee", season)
        down_judge_sq = self._position_games_subquery("Down Judge", season)
        field_judge_sq = self._position_games_subquery("Field Judge", season)
        side_judge_sq = self._position_games_subquery("Side Judge", season)

        return (
            Official.objects.select_related("team")
            .annotate(
                referee_count=Subquery(referee_sq),
                down_judge_count=Subquery(down_judge_sq),
                field_judge_count=Subquery(field_judge_sq),
                side_judge_count=Subquery(side_judge_sq),
                license_name=Subquery(
                    self._current_license_name_subquery(season),
                    output_field=CharField(),
                ),
                external_games_total=Subquery(
                    self._external_games_total_subquery(season)
                ),
                total_games=(
                    Subquery(referee_sq)
                    + Subquery(down_judge_sq)
                    + Subquery(field_judge_sq)
                    + Subquery(side_judge_sq)
                ),
            )
            .filter(total_games__gt=0)
            .order_by("-total_games", "last_name", "first_name")
        )

    @staticmethod
    def _current_license_name_subquery(as_of_year=None):
        """
        Subquery resolving the license an official currently holds: their
        single most recent `OfficialLicenseHistory` entry by year
        (excluding the "no license" sentinel), with rank breaking ties
        within that year - the same logic
        `OfficialSerializer._get_license_history()` already uses for the
        working per-team "Lizenzstufe" column and official profile pages.
        (An earlier version of this method instead shifted a license
        forward by a full calendar year, copying the Moodle-eligibility-
        specific `_license_name_subquery` by mistake - so e.g. a license
        earned 2025-03-31 didn't count until season 2026, even for an
        official whose games were all in season 2025.)
        When `as_of_year` is given, only history up to and including that
        year is considered, so a season's statistics never show a license
        the official didn't hold yet at that point; there is otherwise no
        expiration cutoff, matching the existing convention.
        """
        queryset = OfficialLicenseHistory.objects.filter(
            official=OuterRef("pk")
        ).exclude(license=LicenseStrategy.NO_LICENSE)
        if as_of_year is not None:
            queryset = queryset.filter(created_at__year__lte=as_of_year)
        return queryset.order_by_rank("-created_at__year").values("license__name")[:1]

    def get_team_license_breakdown(self) -> dict:
        """
        Returns `{team_id: {"total": n, <license name>: n, ...}}` for every
        official excluding the "no team" placeholder (`Official.OHNE_TEAM_ID`).
        An official's license is the one they currently hold (see
        `_current_license_name_subquery`); officials with no license
        history at all are counted only towards "total", not under any
        license bucket. Exactly one query, regardless of how many teams or
        officials exist.
        """
        rows = (
            Official.objects.exclude(team_id=Official.OHNE_TEAM_ID)
            .annotate(
                license_name=Subquery(
                    self._current_license_name_subquery(), output_field=CharField()
                )
            )
            .values("team_id", "license_name")
            .annotate(count=Count("id"))
        )
        breakdown = defaultdict(lambda: defaultdict(int))
        for row in rows:
            breakdown[row["team_id"]]["total"] += row["count"]
            if row["license_name"]:
                breakdown[row["team_id"]][row["license_name"]] += row["count"]
        return {team_id: dict(counts) for team_id, counts in breakdown.items()}

    # noinspection PyMethodMayBeStatic
    def get_all_years_with_team_official_licenses(self, team):
        return (
            OfficialLicenseHistory.objects.filter(official__team=team)
            .values_list("created_at__year", flat=True)
            .distinct()
        )
