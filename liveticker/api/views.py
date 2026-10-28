from django.conf import settings
from django.db.models import Count, Max, Sum
from django.utils.decorators import method_decorator
from django.views.decorators.cache import cache_page
from django.views.decorators.http import condition
from rest_framework.response import Response
from rest_framework.views import APIView

from gameevents.models import GameState
from gamedays.models import Gameresult, TeamLog
from league_manager.utils.etag import build_etag
from liveticker.service.liveticker_service import LivetickerService


def generate_liveticker_etag(request):
    """ETag for the liveticker response.

    The payload changes whenever a game result is written or edited (score
    updates patch existing rows in place, so value sums are included) or a
    new tick (TeamLog event) arrives. Query parameters are part of the key
    because league/gameday/game filters change the response body.

    With ``SCORECARD_EVENT_FEED`` on, the score also comes from ``GameState``,
    so the validator has to include the projection's cursor: an event that
    writes no ``TeamLog`` row (a plain possession change) would otherwise
    answer a stale ``304`` and the widget would keep the old state. The extra
    parts are added only when the flag is on, so the flag-off validator is
    byte-identical to the pre-event-store one.
    """
    etag_data = request.GET.urlencode() or "all"
    results = Gameresult.objects.aggregate(
        count=Count("pk"),
        latest=Max("pk"),
        sum_fh=Sum("fh"),
        sum_sh=Sum("sh"),
    )
    ticks = TeamLog.objects.aggregate(
        count=Count("pk"), latest=Max("pk"), sum_value=Sum("value")
    )
    parts = [
        etag_data,
        results["count"],
        results["latest"],
        results["sum_fh"],
        results["sum_sh"],
        ticks["count"],
        ticks["latest"],
        ticks["sum_value"],
    ]
    if getattr(settings, "SCORECARD_EVENT_FEED", False):
        # last_seq is the cursor of the projection: every appended event
        # advances it. The score/period sums cover a rebuild that repairs a
        # drifted state without adding an event.
        projection = GameState.objects.aggregate(
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
    return build_etag(*parts)


class LivetickerAPIView(APIView):
    # condition sits outside cache_page: ETag revalidation must see fresh
    # data, while plain requests reuse the 60s page cache.
    @method_decorator(condition(etag_func=generate_liveticker_etag))
    @method_decorator(cache_page(60))
    def get(self, request):
        league = request.query_params.get("league")
        league = [] if league is None or league == "" else league.split(",")
        games_with_all_ticks = self._parse_input(
            request.query_params.get("getAllTicksFor")
        )
        gameday_ids = self._parse_input(request.query_params.get("gameday"))
        liveticker_service = LivetickerService(
            league, games_with_all_ticks, gameday_ids
        )

        return Response(liveticker_service.get_liveticker_as_json())

    # noinspection PyMethodMayBeStatic
    def _parse_input(self, input_value):
        if input_value is None:
            return []
        numbers_as_array = input_value.split(",")
        all_numbers_as_int = []
        for current_number in numbers_as_array:
            try:
                all_numbers_as_int += [int(current_number)]
            except ValueError:
                continue
        return all_numbers_as_int
