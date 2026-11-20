from functools import wraps
from hashlib import sha1

from django.conf import settings
from django.db.models import Count, Max, Sum
from django.utils.decorators import method_decorator
from django.views.decorators.cache import cache_page
from django.views.decorators.http import condition
from rest_framework.response import Response
from rest_framework.views import APIView

from gameevents.models import GameState
from gamedays.models import Gameresult, Gameinfo, TeamLog
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
    # Every Gameinfo field the payload renders or uses for selection. A plain
    # count/pk aggregate misses an in-place kickoff or field edit (and a
    # ``QuerySet.update`` does not advance ``updated_at``), which used to keep
    # answering 304 with the old kickoff.
    gameinfo_digest = sha1()
    for row in (
        Gameinfo.objects.order_by("pk")
        .values_list(
            "pk",
            "scheduled",
            "gameStarted",
            "gameFinished",
            "field",
            "status",
            "in_possession",
            "stage",
            "standing",
            "updated_at",
            "gameday__date",
            "gameday__name",
            "gameday__address",
            "gameday__league__name",
        )
        .iterator()
    ):
        gameinfo_digest.update(repr(row).encode())
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
        gameinfo_digest.hexdigest(),
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


def cache_liveticker(view):
    """Cache the feed with the TTL from ``LIVETICKER_CACHE_SECONDS``.

    The value is read per request so ``override_settings`` and a later,
    k6-measured TTL change need no import-time rebuild of the decorator.
    """

    @wraps(view)
    def wrapped(request, *args, **kwargs):
        # A conditional request only reaches this wrapper after the ETag
        # mismatched, so the stored page (keyed by URL alone) is stale by
        # definition: bypass it and render the current state. Plain polls keep
        # using the TTL cache.
        if request.META.get("HTTP_IF_NONE_MATCH"):
            return view(request, *args, **kwargs)
        seconds = getattr(settings, "LIVETICKER_CACHE_SECONDS", 60)
        return cache_page(seconds)(view)(request, *args, **kwargs)

    return wrapped


class LivetickerAPIView(APIView):
    # condition sits outside cache_page: ETag revalidation must see fresh
    # data, while plain requests reuse the configured page cache.
    @method_decorator(condition(etag_func=generate_liveticker_etag))
    @method_decorator(cache_liveticker)
    def get(self, request):
        league = request.query_params.get("league")
        league = [] if league is None or league == "" else league.split(",")
        games_with_all_ticks = self._parse_input(
            request.query_params.get("getAllTicksFor")
        )
        gameday_ids = self._parse_input(request.query_params.get("gameday"))
        liveticker_service = LivetickerService(
            league,
            games_with_all_ticks,
            gameday_ids,
            all_results=request.query_params.get("results") == "all",
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
