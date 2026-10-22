from django.urls import path


from .constants import (
    LEAGUE_GAMEDAY_DETAIL,
    LEAGUE_GAMEDAY_LIST,
    LEAGUE_GAMEDAY_LIST_AND_YEAR,
    LEAGUE_GAMEDAY_LIST_AND_YEAR_AND_LEAGUE,
    LEAGUE_GAMEDAY_CREATE,
    LEAGUE_GAMEDAY_CREATE_CHOOSER,
    LEAGUE_GAMEDAY_DELETE,
    LEAGUE_GAMEDAY_UPDATE,
    LEAGUE_GAMEDAY_GAMEINFOS_UPDATE,
    LEAGUE_GAMEDAY_GAMEINFOS_DELETE,
    LEAGUE_GAMEDAY_GAMEINFOS_WIZARD,
    LEAGUE_GAMEDAY_GAME_DETAIL,
    LEAGUE_GAMEDAY_LEAGUE_STATISTICS,
    LEAGUE_TOURNAMENT_DETAIL,
    LEAGUE_SEASON_LIST,
    LEAGUE_SEASON_CREATE,
    LEAGUE_SEASON_UPDATE,
    LEAGUE_SEASON_LEAGUE_SETUP,
    LEAGUE_SEASON_LEAGUE_COPY,
    LEAGUE_SEASON_LEAGUE_ASSIGN,
)
from .views import (
    GamedayDetailView,
    GamedayListView,
    GamedayCreateView,
    GamedayCreateChooserView,
    GamedayUpdateView,
    GameinfoWizard,
    GameinfoUpdateView,
    GamedayDeleteView,
    GameinfoDeleteView,
    GamedayGameDetailView,
    GamedayLeagueStatisticView,
    TournamentDetailView,
    SeasonListView,
    SeasonCreateView,
    SeasonUpdateView,
    SeasonLeagueTeamSetupView,
    SeasonLeagueTeamCopyView,
    SeasonLeagueTeamAssignView,
)

urlpatterns = [
    path("", GamedayListView.as_view(), name="league-home"),
    path("gamedays/", GamedayListView.as_view(), name=LEAGUE_GAMEDAY_LIST),
    path(
        "gameday/<int:gameday_pk>/game/<int:pk>",
        GamedayGameDetailView.as_view(),
        name=LEAGUE_GAMEDAY_GAME_DETAIL,
    ),
    path(
        "gamedays/<int:season>/",
        GamedayListView.as_view(),
        name=LEAGUE_GAMEDAY_LIST_AND_YEAR,
    ),
    path(
        "gamedays/<int:season>/<str:league>/",
        GamedayListView.as_view(),
        name=LEAGUE_GAMEDAY_LIST_AND_YEAR_AND_LEAGUE,
    ),
    path(
        "gamedays/<int:season>/<str:league>/statistics",
        GamedayLeagueStatisticView.as_view(),
        name=LEAGUE_GAMEDAY_LEAGUE_STATISTICS,
    ),
    path("gameday/<int:pk>/", GamedayDetailView.as_view(), name=LEAGUE_GAMEDAY_DETAIL),
    path("gameday/new/", GamedayCreateView.as_view(), name=LEAGUE_GAMEDAY_CREATE),
    path(
        "gameday/create/",
        GamedayCreateChooserView.as_view(),
        name=LEAGUE_GAMEDAY_CREATE_CHOOSER,
    ),
    path(
        "gameday/<int:pk>/update/",
        GamedayUpdateView.as_view(),
        name=LEAGUE_GAMEDAY_UPDATE,
    ),
    path(
        "gameday/<int:pk>/delete/",
        GamedayDeleteView.as_view(),
        name=LEAGUE_GAMEDAY_DELETE,
    ),
    path(
        "gameday/<int:pk>/gameinfos/wizard/",
        GameinfoWizard.as_view(),
        name=LEAGUE_GAMEDAY_GAMEINFOS_WIZARD,
    ),
    path(
        "gameday/<int:pk>/gameinfos/update/",
        GameinfoUpdateView.as_view(),
        name=LEAGUE_GAMEDAY_GAMEINFOS_UPDATE,
    ),
    path(
        "gameday/<int:pk>/gameinfos/delete/",
        GameinfoDeleteView.as_view(),
        name=LEAGUE_GAMEDAY_GAMEINFOS_DELETE,
    ),
    path("seasons/", SeasonListView.as_view(), name=LEAGUE_SEASON_LIST),
    path("seasons/new/", SeasonCreateView.as_view(), name=LEAGUE_SEASON_CREATE),
    path(
        "seasons/<int:pk>/update/",
        SeasonUpdateView.as_view(),
        name=LEAGUE_SEASON_UPDATE,
    ),
    path(
        "seasons/<int:pk>/leagues/",
        SeasonLeagueTeamSetupView.as_view(),
        name=LEAGUE_SEASON_LEAGUE_SETUP,
    ),
    path(
        "seasons/<int:pk>/leagues/copy/",
        SeasonLeagueTeamCopyView.as_view(),
        name=LEAGUE_SEASON_LEAGUE_COPY,
    ),
    path(
        "seasons/<int:pk>/leagues/<int:league_pk>/",
        SeasonLeagueTeamAssignView.as_view(),
        name=LEAGUE_SEASON_LEAGUE_ASSIGN,
    ),
    path(
        "tournament/<int:pk>/",
        TournamentDetailView.as_view(),
        name=LEAGUE_TOURNAMENT_DETAIL,
    ),
]
