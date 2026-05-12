from django.urls import path

from .constants import (
    MATCHREPORT_GAMEDAY_LIST,
    MATCHREPORT_GAMEDAY_LIST_AND_YEAR,
    MATCHREPORT_GAMEDAY_LIST_AND_YEAR_AND_LEAGUE,
    MATCHREPORT_GAMEDAY_DETAIL
)
from matchreport.views import MatchreportGamedayListView, MatchreportGamedayDetailView

urlpatterns = [
    path(
        "",
        MatchreportGamedayListView.as_view(),
        name=MATCHREPORT_GAMEDAY_LIST
    ),
    path(
        "<int:season>/",
        MatchreportGamedayListView.as_view(),
        name=MATCHREPORT_GAMEDAY_LIST_AND_YEAR,
    ),
    path(
        "<int:season>/<str:league>/",
        MatchreportGamedayListView.as_view(),
        name=MATCHREPORT_GAMEDAY_LIST_AND_YEAR_AND_LEAGUE,
    ),
    path(
        "gameday/<int:pk>/",
        MatchreportGamedayDetailView.as_view(),
        name=MATCHREPORT_GAMEDAY_DETAIL
    )
]