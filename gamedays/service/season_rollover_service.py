"""Season rollover: copy a season's league/team assignments forward.

This is the product version of the admin's ``duplicate_entry`` action: a new
season starts from last season's ``SeasonLeagueTeam`` rows instead of an empty
form. Copying is idempotent - running it twice creates nothing new and reports
the already-configured leagues as skipped.

There is deliberately no database uniqueness constraint on
``(season, league)``: duplicates are prevented in the form/service layer (see
``gamedays.forms.SeasonLeagueTeamForm`` and ``copy_league_teams``) and existing
historic duplicates are reported by the
``report_duplicate_season_league_teams`` management command.
"""

from dataclasses import dataclass

from django.db import transaction

from gamedays.models import Season, SeasonLeagueTeam


@dataclass(frozen=True)
class RolloverSummary:
    """Outcome of one copy run, rendered as the confirmation message."""

    created: int = 0
    skipped: int = 0


def previous_season(target: Season) -> Season | None:
    """The most recent season before ``target``, or ``None``.

    Seasons carry no dates, so "before" is the season *name* ordering used
    elsewhere in the codebase (``SeasonViewSet`` and
    ``LeagueTableRepository.get_seasons_for_league_slug`` order by ``-name``).
    ``pk`` breaks ties so the result is deterministic.
    """
    return Season.objects.filter(name__lt=target.name).order_by("-name", "-pk").first()


@transaction.atomic
def copy_league_teams(from_season: Season, to_season: Season) -> RolloverSummary:
    """Copy ``SeasonLeagueTeam`` rows (and their teams) to ``to_season``.

    Leagues already configured for the target season are skipped, never
    overwritten - a staff member may have adjusted them by hand.
    """
    existing_league_ids = set(
        SeasonLeagueTeam.objects.filter(season=to_season).values_list(
            "league_id", flat=True
        )
    )
    source_rows = (
        SeasonLeagueTeam.objects.filter(season=from_season)
        .select_related("league")
        .prefetch_related("teams")
        .order_by("league__name", "pk")
    )

    created = 0
    skipped = 0
    for row in source_rows:
        if row.league_id in existing_league_ids:
            skipped += 1
            continue
        assignment = SeasonLeagueTeam.objects.create(
            season=to_season, league=row.league
        )
        assignment.teams.set(row.teams.all())
        existing_league_ids.add(row.league_id)
        created += 1

    return RolloverSummary(created=created, skipped=skipped)
