"""Tests for the public-API additions to GET /api/snapshot/.

The snapshot is LeagueSphere's only public API: these cover what external
consumers (and the share widget) need from it without any other endpoint —
team names/logos, standings, live ticker data, a year filter — plus the
per-scope rebuild bound that keeps live polling cheap.
"""

from datetime import date, timedelta
from unittest import mock

from django.core.cache import caches
from django.db import connection
from django.test import override_settings
from django.test.utils import CaptureQueriesContext
from rest_framework import status
from rest_framework.test import APITestCase
from rest_framework.throttling import ScopedRateThrottle

from gamedays.api.snapshot import SNAPSHOT_MIN_REBUILD_SECONDS
from gamedays.api.tests.test_snapshot import LOC_MEM_CACHES, SNAPSHOT_URL
from gamedays.models import Gameday, Gameinfo, Gameresult, SeasonLeagueTeam
from gamedays.tests.setup_factories.factories import (
    GamedayFactory,
    GameinfoFactory,
    GameresultFactory,
    LeagueFactory,
    SeasonFactory,
    TeamFactory,
    TeamLogFactory,
)
from league_table.models import LeagueRulesetTieBreak
from league_table.tests.setup_factories.factories_leaguetable import (
    LeagueSeasonConfigFactory,
    TieBreakStepFactory,
)


def make_game(gameday, home, away, home_score=None, away_score=None, **game_kwargs):
    game = GameinfoFactory(gameday=gameday, officials=home, **game_kwargs)
    GameresultFactory(
        gameinfo=game,
        team=home,
        isHome=True,
        fh=home_score,
        sh=0 if home_score is not None else None,
        pa=away_score,
    )
    GameresultFactory(
        gameinfo=game,
        team=away,
        isHome=False,
        fh=away_score,
        sh=0 if away_score is not None else None,
        pa=home_score,
    )
    return game


def gameday_entry(response, gameday):
    return next(g for g in response.data["gamedays"] if g["id"] == gameday.id)


@override_settings(CACHES=LOC_MEM_CACHES)
class SnapshotPublicApiTestBase(APITestCase):
    def setUp(self):
        caches["snapshot"].clear()
        caches["default"].clear()
        self.home = TeamFactory(name="Nürn", description="Nürnberg Renegades")
        self.away = TeamFactory(name="Spatz4", description="Munich Spatzen 4")
        self.gameday = GamedayFactory(status=Gameday.STATUS_PUBLISHED)
        self.game = make_game(self.gameday, self.home, self.away, 13, 6)


class SnapshotEnvelopeTest(SnapshotPublicApiTestBase):
    def test_payload_carries_schema_version(self):
        response = self.client.get(SNAPSHOT_URL)

        assert response.status_code == status.HTTP_200_OK
        assert response.data["schema_version"] == 1

    def test_new_includes_are_opt_in(self):
        response = self.client.get(SNAPSHOT_URL, {"include": "games"})

        assert "teams" not in response.data
        assert "standings" not in response.data
        assert "live" not in gameday_entry(response, self.gameday)["games"][0]


class SnapshotTeamsTest(SnapshotPublicApiTestBase):
    def test_teams_map_covers_result_teams_with_full_names(self):
        response = self.client.get(SNAPSHOT_URL, {"include": "games,teams"})

        assert response.status_code == status.HTTP_200_OK
        teams = response.data["teams"]
        assert teams[str(self.home.pk)]["description"] == "Nürnberg Renegades"
        assert teams[str(self.home.pk)]["name"] == "Nürn"
        assert teams[str(self.away.pk)]["description"] == "Munich Spatzen 4"

    def test_teams_map_includes_filter_team_without_games_in_scope(self):
        idle = TeamFactory(name="Idle", description="Idle Team")

        response = self.client.get(
            SNAPSHOT_URL, {"include": "teams", "team": [str(idle.pk)]}
        )

        assert response.status_code == status.HTTP_200_OK
        assert response.data["gamedays"] == []
        assert response.data["teams"][str(idle.pk)]["description"] == "Idle Team"

    def test_logo_is_absolute_and_null_when_unset(self):
        self.home.logo.name = "teammanager/logos/nuern.png"
        self.home.save()

        response = self.client.get(SNAPSHOT_URL, {"include": "teams"})

        teams = response.data["teams"]
        assert teams[str(self.home.pk)]["logo"] == (
            "http://testserver/media/teammanager/logos/nuern.png"
        )
        assert teams[str(self.away.pk)]["logo"] is None

    def test_team_edit_changes_etag_only_with_teams_included(self):
        with_teams = self.client.get(SNAPSHOT_URL, {"include": "teams"})
        without_teams = self.client.get(SNAPSHOT_URL, {"include": "games"})

        self.away.description = "Munich Spatzen IV"
        self.away.save()
        caches["snapshot"].clear()

        assert (
            self.client.get(
                SNAPSHOT_URL,
                {"include": "teams"},
                HTTP_IF_NONE_MATCH=with_teams["ETag"],
            ).status_code
            == status.HTTP_200_OK
        )
        assert (
            self.client.get(
                SNAPSHOT_URL,
                {"include": "games"},
                HTTP_IF_NONE_MATCH=without_teams["ETag"],
            ).status_code
            == status.HTTP_304_NOT_MODIFIED
        )

    def test_teams_query_count_does_not_grow_with_scope(self):
        def count_queries():
            caches["snapshot"].clear()
            with CaptureQueriesContext(connection) as ctx:
                response = self.client.get(SNAPSHOT_URL, {"include": "games,teams"})
            assert response.status_code == status.HTTP_200_OK
            return len(ctx)

        count_queries()  # warm-up: first request pays one-off lookups
        small = count_queries()
        for _ in range(3):
            other = GamedayFactory(status=Gameday.STATUS_PUBLISHED)
            make_game(other, self.home, self.away, 7, 0)

        assert count_queries() == small


class SnapshotYearFilterTest(SnapshotPublicApiTestBase):
    def test_year_selects_seasons_by_name(self):
        season = SeasonFactory(name="2031")
        wanted = GamedayFactory(status=Gameday.STATUS_PUBLISHED, season=season)

        response = self.client.get(SNAPSHOT_URL, {"year": "2031"})

        assert response.status_code == status.HTTP_200_OK
        assert [g["id"] for g in response.data["gamedays"]] == [wanted.id]
        assert response.data["scope"]["season"] == [season.pk]

    def test_invalid_or_unknown_year_is_rejected(self):
        assert self.client.get(SNAPSHOT_URL, {"year": "26"}).status_code == (
            status.HTTP_400_BAD_REQUEST
        )
        assert self.client.get(SNAPSHOT_URL, {"year": "1899"}).status_code == (
            status.HTTP_400_BAD_REQUEST
        )


class SnapshotStandingsTest(APITestCase):
    def setUp(self):
        caches["snapshot"].clear()
        caches["default"].clear()
        self.config = LeagueSeasonConfigFactory(
            league=LeagueFactory(name="Liga"), season=SeasonFactory(name="2032")
        )
        self.league = self.config.league
        self.season = self.config.season
        self.config.leagues_for_league_points.add(self.league)
        for order, key in enumerate(["win_quotient", "overall_point_diff"]):
            LeagueRulesetTieBreak.objects.create(
                ruleset=self.config.ruleset,
                step=TieBreakStepFactory(key=key),
                order=order,
            )
        self.titans = TeamFactory(name="Titans", description="Titans Club")
        self.sharks = TeamFactory(name="Sharks", description="Sharks Club")
        self.rays = TeamFactory(name="Rays", description="Rays Club")
        membership = SeasonLeagueTeam.objects.create(
            season=self.season, league=self.league
        )
        membership.teams.add(self.titans, self.sharks, self.rays)

        self.gameday = GamedayFactory(
            league=self.league, season=self.season, status=Gameday.STATUS_PUBLISHED
        )
        make_game(
            self.gameday,
            self.titans,
            self.sharks,
            20,
            0,
            status=Gameinfo.STATUS_COMPLETED,
            standing="Gruppe 1",
        )
        # A cup the titans also play in: no LeagueSeasonConfig, no table.
        self.cup = LeagueFactory(name="Pokal")
        cup_day = GamedayFactory(
            league=self.cup, season=self.season, status=Gameday.STATUS_PUBLISHED
        )
        make_game(
            cup_day, self.titans, self.rays, 6, 0, status=Gameinfo.STATUS_COMPLETED
        )
        self.params = {
            "include": "standings",
            "team": [str(self.titans.pk)],
            "season": [str(self.season.pk)],
        }

    @override_settings(CACHES=LOC_MEM_CACHES)
    def test_one_table_per_configured_league_in_scope(self):
        response = self.client.get(SNAPSHOT_URL, self.params)

        assert response.status_code == status.HTTP_200_OK
        standings = response.data["standings"]
        assert [table["league"]["id"] for table in standings] == [self.league.pk]
        table = standings[0]
        assert table["season"] == {
            "id": self.season.pk,
            "slug": self.season.slug,
            "name": "2032",
        }
        assert table["ranking"] == ["win_quotient", "overall_point_diff"]

    @override_settings(CACHES=LOC_MEM_CACHES)
    def test_rows_match_league_table_api_plus_rank_and_group(self):
        response = self.client.get(SNAPSHOT_URL, self.params)
        api = self.client.get(
            f"/api/league-table/{self.league.slug}/{self.season.slug}/"
        )

        rows = response.data["standings"][0]["rows"]
        assert [
            {k: v for k, v in row.items() if k not in ("rank", "group")} for row in rows
        ] == api.json()["standing"]
        # rank restarts per group; a team without games has no group label.
        expected_ranks, previous = [], object()
        for row in rows:
            expected_ranks.append(
                expected_ranks[-1] + 1 if row["standing"] == previous else 1
            )
            previous = row["standing"]
        assert [row["rank"] for row in rows] == expected_ranks
        assert [row["group"] for row in rows] == [row["standing"] for row in rows]
        assert rows[0]["team_id"] == self.titans.pk
        assert rows[0]["rank"] == 1

    @override_settings(CACHES=LOC_MEM_CACHES)
    def test_result_outside_team_scope_changes_etag_only_with_standings(self):
        with_standings = self.client.get(SNAPSHOT_URL, self.params)
        plain_params = {**self.params, "include": "games"}
        plain = self.client.get(SNAPSHOT_URL, plain_params)

        # Sharks vs Rays on another gameday: not in the titans' scope, but it
        # changes the league table the titans' snapshot shows.
        other_day = GamedayFactory(
            league=self.league,
            season=self.season,
            status=Gameday.STATUS_PUBLISHED,
            date=date.today() + timedelta(days=7),
        )
        make_game(
            other_day,
            self.sharks,
            self.rays,
            14,
            7,
            status=Gameinfo.STATUS_COMPLETED,
            standing="Gruppe 1",
        )

        assert (
            self.client.get(
                SNAPSHOT_URL, self.params, HTTP_IF_NONE_MATCH=with_standings["ETag"]
            ).status_code
            == status.HTTP_200_OK
        )
        assert (
            self.client.get(
                SNAPSHOT_URL, plain_params, HTTP_IF_NONE_MATCH=plain["ETag"]
            ).status_code
            == status.HTTP_304_NOT_MODIFIED
        )


class SnapshotLiveTest(SnapshotPublicApiTestBase):
    def setUp(self):
        super().setUp()
        # self.gameday is today (GamedayFactory default); make its game live.
        self.game.status = "1. Halbzeit"
        self.game.scheduled = "10:00"
        self.game.in_possession = self.home.name
        self.game.save()
        TeamLogFactory(
            gameinfo=self.game,
            team=self.home,
            sequence=1,
            event="Touchdown",
            player=7,
            half=1,
        )
        self.finished = make_game(
            self.gameday,
            self.home,
            self.away,
            21,
            0,
            status=Gameinfo.STATUS_COMPLETED,
            scheduled="09:00",
            gameFinished="09:50",
        )
        tomorrow = GamedayFactory(
            status=Gameday.STATUS_PUBLISHED, date=date.today() + timedelta(days=1)
        )
        self.tomorrow_game = make_game(tomorrow, self.home, self.away)

    def games_by_id(self, response):
        return {
            game["id"]: game
            for gameday in response.data["gamedays"]
            for game in gameday["games"]
        }

    def test_live_block_only_on_todays_open_games(self):
        response = self.client.get(SNAPSHOT_URL, {"include": "live"})

        assert response.status_code == status.HTTP_200_OK
        games = self.games_by_id(response)  # live implies games
        live = games[self.game.pk]["live"]
        assert live["status"] == "1. Halbzeit"
        assert live["home"]["isInPossession"] is True
        assert live["home"]["name"] == "Nürnberg Renegades"
        assert "live" not in games[self.finished.pk]
        assert "live" not in games[self.tomorrow_game.pk]

    def test_live_ticks_equal_the_liveticker(self):
        response = self.client.get(SNAPSHOT_URL, {"include": "live"})
        liveticker = self.client.get(
            "/api/liveticker/", {"gameday": str(self.gameday.pk)}
        )

        ticker_entry = next(
            entry for entry in liveticker.json() if entry["gameId"] == self.game.pk
        )
        live = self.games_by_id(response)[self.game.pk]["live"]
        assert live["ticks"] == ticker_entry["ticks"]
        assert live["ticks"][0]["text"] == "Touchdown: #7"

    def test_no_liveticker_work_when_nothing_is_today(self):
        with mock.patch(
            "gamedays.api.snapshot.LivetickerService"
        ) as liveticker_service:
            response = self.client.get(
                SNAPSHOT_URL,
                {
                    "include": "live",
                    "date_from": (date.today() + timedelta(days=1)).isoformat(),
                },
            )

        assert response.status_code == status.HTTP_200_OK
        liveticker_service.assert_not_called()


class SnapshotRebuildControlTest(SnapshotPublicApiTestBase):
    params = {"include": "games"}

    def enter_score(self, home_fh):
        Gameresult.objects.filter(gameinfo=self.game, isHome=True).update(fh=home_fh)
        Gameinfo.objects.filter(pk=self.game.pk).update(status="2. Halbzeit")
        # .update() bypasses auto_now; production write paths set it.
        from django.utils import timezone

        Gameresult.objects.filter(gameinfo=self.game).update(updated_at=timezone.now())

    def test_writes_within_rebuild_window_serve_the_last_build(self):
        first = self.client.get(SNAPSHOT_URL, self.params)
        self.enter_score(20)

        again = self.client.get(SNAPSHOT_URL, self.params)

        assert again.status_code == status.HTTP_200_OK
        assert again["ETag"] == first["ETag"]
        assert again.data["etag"] == first.data["etag"]
        assert again.data["gamedays"] == first.data["gamedays"]

    def test_scope_rebuilds_after_the_window(self):
        first = self.client.get(SNAPSHOT_URL, self.params)
        self.enter_score(20)

        import time as real_time

        later = real_time.time() + SNAPSHOT_MIN_REBUILD_SECONDS + 1
        with mock.patch("gamedays.api.snapshot.time.time", return_value=later):
            again = self.client.get(SNAPSHOT_URL, self.params)

        assert again["ETag"] != first["ETag"]
        game = gameday_entry(again, self.gameday)["games"][0]
        assert game["final_score"]["home"] == 20

    def test_narrow_scope_rebuilds_are_not_ip_throttled(self):
        params = {"include": "games", "team": [str(self.home.pk)]}
        rates = {"snapshot": "1/min"}
        with mock.patch.object(ScopedRateThrottle, "THROTTLE_RATES", rates):
            for _ in range(3):
                caches["snapshot"].clear()
                assert self.client.get(SNAPSHOT_URL, params).status_code == (
                    status.HTTP_200_OK
                )
