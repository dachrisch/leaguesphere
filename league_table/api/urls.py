from django.urls import path

from league_table.api.constants import (
    API_LEAGUE_TABLE_BY_LEAGUE,
    API_LEAGUE_TABLE_BY_SEASON,
)
from league_table.api.views import LeagueTableAPIView

urlpatterns = [
    path(
        "<str:league>/<str:season>/",
        LeagueTableAPIView.as_view(),
        name=API_LEAGUE_TABLE_BY_SEASON,
    ),
    path("<str:league>/", LeagueTableAPIView.as_view(), name=API_LEAGUE_TABLE_BY_LEAGUE),
]
