"""Data version for a liveticker selection.

The JSON endpoint's ETag and the SSE broadcaster both need to answer the same
question -- "did the payload for this selection change?" -- from the same
aggregates. Keeping one function means a new column or projection cursor can
never be added to one answer and forgotten in the other.
"""

from django.db.models import Count, Max, Min, Sum

from gameevents.models import GameState
from gamedays.models import Gameresult, Gameinfo, TeamLog
from league_manager.utils.etag import build_etag
from liveticker.service.liveticker_service import resolve_gameday_ids


def liveticker_version(etag_data, league, gameday_ids):
    """Return ``(version, resolved_gameday_ids)`` for one selection.

    The payload changes whenever a game result is written or edited (score
    updates patch existing rows in place, so value sums are included) or a
    new tick (TeamLog event) arrives. Query parameters and the resolved
    gameday identifiers are part of the key because league/gameday filters
    change the response body.

    Everything is scoped to the games this selection can return. A row-by-row
    scan of every ``Gameinfo`` in the database made every poll read the whole
    table; one aggregate per model stays flat regardless of how many other
    gamedays or seasons exist. ``Gameinfo.updated_at`` covers the editable
    fields (kickoff, field, status, possession, halbzeit): saves go through
    ``BumpUpdatedAtOnSaveMixin`` and every ``QuerySet.update`` call site stamps
    it explicitly. Max/min/sum over ``scheduled``/``field`` additionally cover
    an older writer that skipped that stamp.

    The event path is permanent, so the score also comes from ``GameState``:
    the version includes the projection's cursor. An event that writes no
    ``TeamLog`` row (a plain possession change) would otherwise answer a stale
    ``304`` and the widget would keep the old state.
    """
    gameday_ids = resolve_gameday_ids(gameday_ids, league)
    games = Gameinfo.objects.filter(gameday_id__in=gameday_ids).aggregate(
        count=Count("pk"),
        latest_update=Max("updated_at"),
        scheduled_max=Max("scheduled"),
        scheduled_min=Min("scheduled"),
        field_sum=Sum("field"),
        field_max=Max("field"),
    )
    results = Gameresult.objects.filter(gameinfo__gameday_id__in=gameday_ids).aggregate(
        count=Count("pk"),
        latest=Max("pk"),
        sum_fh=Sum("fh"),
        sum_sh=Sum("sh"),
    )
    ticks = TeamLog.objects.filter(gameinfo__gameday_id__in=gameday_ids).aggregate(
        count=Count("pk"), latest=Max("pk"), sum_value=Sum("value")
    )
    parts = [
        etag_data,
        ",".join(str(gameday_id) for gameday_id in sorted(gameday_ids)),
        games["count"],
        games["latest_update"],
        games["scheduled_max"],
        games["scheduled_min"],
        games["field_sum"],
        games["field_max"],
        results["count"],
        results["latest"],
        results["sum_fh"],
        results["sum_sh"],
        ticks["count"],
        ticks["latest"],
        ticks["sum_value"],
    ]
    # The event path is permanent: last_seq is the projection cursor, and the
    # score/period sums cover a rebuild that repairs a drifted state without
    # adding an event.
    projection = GameState.objects.filter(game__gameday_id__in=gameday_ids).aggregate(
        count=Count("pk"),
        latest_seq=Max("last_seq"),
        sum_home=Sum("score_home"),
        sum_away=Sum("score_away"),
        latest_updated=Max("updated_at"),
    )
    parts += [
        projection["count"],
        projection["latest_seq"],
        projection["sum_home"],
        projection["sum_away"],
        projection["latest_updated"],
    ]
    return build_etag(*parts), gameday_ids
