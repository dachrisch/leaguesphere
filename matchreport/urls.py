from django.urls import path

from .constants import (
    MATCHREPORT_GAMEDAY_LIST,
    MATCHREPORT_GAMEDAY_LIST_AND_YEAR,
    MATCHREPORT_GAMEDAY_LIST_AND_YEAR_AND_LEAGUE,
    MATCHREPORT_GAMEDAY_DETAIL,
    MATCHREPORT_GAMEDAY_PASSCHECK_DOWNLOAD,
    MATCHREPORT_GAMEDAY_LIST_CSV_DOWNLOAD,
    MATCHREPORT_GAMEDAY_LIST_CSV_DOWNLOAD_AND_LEAGUE,
)
from matchreport.views import (
    MatchreportGamedayListView,
    MatchreportGamedayDetailView,
    MatchreportGamedayPasscheckDownloadView,
    MatchreportGamedayListCsvDownloadView,
)

urlpatterns = [
    path("", MatchreportGamedayListView.as_view(), name=MATCHREPORT_GAMEDAY_LIST),
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
        "download/<int:season>/",
        MatchreportGamedayListCsvDownloadView.as_view(),
        name=MATCHREPORT_GAMEDAY_LIST_CSV_DOWNLOAD,
    ),
    path(
        "download/<int:season>/<str:league>/",
        MatchreportGamedayListCsvDownloadView.as_view(),
        name=MATCHREPORT_GAMEDAY_LIST_CSV_DOWNLOAD_AND_LEAGUE,
    ),
    path(
        "gameday/<int:pk>/",
        MatchreportGamedayDetailView.as_view(),
        name=MATCHREPORT_GAMEDAY_DETAIL,
    ),
    path(
        "gameday/<int:pk>/passcheck/download/",
        MatchreportGamedayPasscheckDownloadView.as_view(),
        name=MATCHREPORT_GAMEDAY_PASSCHECK_DOWNLOAD,
    ),
]
