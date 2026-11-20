from django.conf import settings
from django.urls import path

from league_manager.utils.url_service import UrlService
from liveticker.constants import (
    LIVETICKER_HOME,
    LIVETICKER_SWISS_STANDINGS,
    LIVETICKER_V2_GAMEDAY,
    LIVETICKER_V2_GAME,
    LIVETICKER_V2_HOME,
)
from liveticker.views import LivetickerV2View, LivetickerView, SwissStandingsPublicView


def gameday_ticker_url(gameday):
    """Public ticker URL for one gameday, in the form the active app reads.

    The v2 app uses paths (no query parameters); the legacy app still needs
    its ``league``/``gameday`` query, so the flag picks the shape.
    """
    if getattr(settings, "LIVETICKER_V2_ENABLED", False):
        return UrlService.build_absolute_url(
            LIVETICKER_V2_GAMEDAY, {"gameday_id": gameday.pk}
        )
    return (
        f"{UrlService.build_absolute_url(LIVETICKER_HOME)}"
        f"?league={gameday.league.slug}&gameday={gameday.pk}"
    )


urlpatterns = [
    path("", LivetickerView.as_view(), name=LIVETICKER_HOME),
    path("v2/", LivetickerV2View.as_view(), name=LIVETICKER_V2_HOME),
    path(
        "v2/gameday/<int:gameday_id>/",
        LivetickerV2View.as_view(),
        name=LIVETICKER_V2_GAMEDAY,
    ),
    path(
        "v2/gameday/<int:gameday_id>/game/<int:game_id>/",
        LivetickerV2View.as_view(),
        name=LIVETICKER_V2_GAME,
    ),
    path(
        "swiss/<int:gameday_id>/standings/",
        SwissStandingsPublicView.as_view(),
        name=LIVETICKER_SWISS_STANDINGS,
    ),
]
