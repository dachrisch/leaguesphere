from django.urls import path

from liveticker.constants import (
    LIVETICKER_HOME,
    LIVETICKER_SWISS_STANDINGS,
    LIVETICKER_V2_HOME,
)
from liveticker.views import LivetickerV2View, LivetickerView, SwissStandingsPublicView

urlpatterns = [
    path("", LivetickerView.as_view(), name=LIVETICKER_HOME),
    path("v2/", LivetickerV2View.as_view(), name=LIVETICKER_V2_HOME),
    path(
        "swiss/<int:gameday_id>/standings/",
        SwissStandingsPublicView.as_view(),
        name=LIVETICKER_SWISS_STANDINGS,
    ),
]
