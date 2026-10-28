from django.urls import path

from officials.api.views import (
    CrewPositionsForGameAPIView,
    OfficialsSearchList,
    OfficialsTeamListAPIView,
    OfficialsSearchName,
)

API_OFFICIALS_FOR_TEAM = "api-officials-for-team"
API_OFFICIALS_SEARCH_BY_NAME = "api-officials-search-by-name"
API_OFFICIALS_SEARCH_LIST = "api-officials-search-list"
API_CREW_POSITIONS_FOR_GAME = "api-crew-positions-for-game"

urlpatterns = [
    path(
        "team/<int:pk>/list",
        OfficialsTeamListAPIView.as_view(),
        name=API_OFFICIALS_FOR_TEAM,
    ),
    path(
        "search/list",
        OfficialsSearchList.as_view(),
        name=API_OFFICIALS_SEARCH_LIST,
    ),
    path(
        "search/exclude/team/<int:pk>/list",
        OfficialsSearchName.as_view(),
        name=API_OFFICIALS_SEARCH_BY_NAME,
    ),
    path(
        "crew-positions/game/<int:pk>",
        CrewPositionsForGameAPIView.as_view(),
        name=API_CREW_POSITIONS_FOR_GAME,
    ),
]
