from functools import wraps

from django.conf import settings
from django.core.cache import cache
from django.utils.cache import patch_response_headers
from django.utils.decorators import method_decorator
from django.views.decorators.http import condition
from rest_framework.response import Response
from rest_framework.views import APIView

from liveticker.service.liveticker_service import LivetickerService
from liveticker.service.version import liveticker_version


def parse_int_csv(input_value):
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


def _request_selection(request):
    league = request.GET.get("league")
    league = [] if league is None or league == "" else league.split(",")
    return league, parse_int_csv(request.GET.get("gameday"))


def generate_liveticker_etag(request):
    """ETag for the liveticker response, from the shared version helper.

    ``condition`` computes this before the view; the response cache below
    reuses it as the cache key.
    """
    league, gameday_ids = _request_selection(request)
    etag, _ = liveticker_version(request.GET.urlencode() or "all", league, gameday_ids)
    request._liveticker_etag = etag
    return etag


def cache_liveticker(view):
    """Cache the response data under URL + current ETag.

    ``cache_page`` keyed only by URL, so a changed ETag still served the old
    body for the rest of the TTL. Caching under the ETag makes every client
    share one render per data version: a changed ETag is a new key and
    therefore fresh data immediately. Conditional requests no longer bypass
    the cache.
    """

    @wraps(view)
    def wrapped(request, *args, **kwargs):
        seconds = getattr(settings, "LIVETICKER_CACHE_SECONDS", 60)
        etag = getattr(request, "_liveticker_etag", None)
        cache_key = f"liveticker:{etag}" if etag else None
        if cache_key:
            cached = cache.get(cache_key)
            if cached is not None:
                response = Response(cached)
                patch_response_headers(response, seconds)
                return response
        response = view(request, *args, **kwargs)
        if cache_key and response.status_code == 200:
            cache.set(cache_key, response.data, seconds)
        patch_response_headers(response, seconds)
        return response

    return wrapped


class LivetickerAPIView(APIView):
    # condition sits outside the data cache: it computes the ETag once and
    # answers 304 on a match; on a mismatch the cache wrapper uses that same
    # ETag as its key.
    @method_decorator(condition(etag_func=generate_liveticker_etag))
    @method_decorator(cache_liveticker)
    def get(self, request):
        league, gameday_ids = _request_selection(request)
        games_with_all_ticks = self._parse_input(
            request.query_params.get("getAllTicksFor")
        )
        liveticker_service = LivetickerService(
            league,
            games_with_all_ticks,
            gameday_ids,
            all_results=request.query_params.get("results") == "all",
        )

        return Response(liveticker_service.get_liveticker_as_json())

    # noinspection PyMethodMayBeStatic
    def _parse_input(self, input_value):
        return parse_int_csv(input_value)
