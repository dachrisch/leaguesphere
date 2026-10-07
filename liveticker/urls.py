from django.urls import path

from liveticker.constants import LIVETICKER_HOME, LIVETICKER_SWISS_STANDINGS
from liveticker.views import LivetickerView, SwissStandingsPublicView

urlpatterns = [
    path("", LivetickerView.as_view(), name=LIVETICKER_HOME),
    path(
        "swiss/<int:gameday_id>/standings/",
        SwissStandingsPublicView.as_view(),
        name=LIVETICKER_SWISS_STANDINGS,
    ),
]
