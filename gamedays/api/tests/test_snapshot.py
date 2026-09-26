"""Tests for GET /api/snapshot/ — the mass endpoint for API consumers.

Replaces the N+1 scrape pattern (catalog + per-gameday /games/ + per-game
HTML game-log parsing) with one configurable, gzipped, ETag'd response:
1 x catalog + 919 x /games/ + 1660 x HTML pages becomes 1 request.
"""

from unittest import mock

from django.contrib.auth.models import User
from django.db import connection
from django.test import override_settings
from django.test.utils import CaptureQueriesContext
from rest_framework import status
from rest_framework.test import APITestCase
from rest_framework.throttling import ScopedRateThrottle

from gamedays.models import Gameday, TeamLog
from gamedays.tests.setup_factories.factories import (
    GamedayFactory,
    GameinfoFactory,
    GameresultFactory,
    LeagueFactory,
    SeasonFactory,
    TeamFactory,
    TeamLogFactory,
)

SNAPSHOT_URL = "/api/snapshot/"
LOC_MEM_CACHES = {
    "default": {"BACKEND": "django.core.cache.backends.locmem.LocMemCache"},
    "snapshot": {"BACKEND": "django.core.cache.backends.locmem.LocMemCache"},
}


def make_gameday_with_game(
    league=None,
    season=None,
    gameday_status=Gameday.STATUS_PUBLISHED,
    with_scores=True,
    with_log=True,
    author=None,
):
    """One gameday with one game (home+away results, optional team log)."""
    gameday_kwargs = {"status": gameday_status}
    if league is not None:
        gameday_kwargs["league"] = league
    if season is not None:
        gameday_kwargs["season"] = season
    gameday = GamedayFactory(**gameday_kwargs)
    game = GameinfoFactory(gameday=gameday)
    home_kwargs = {"gameinfo": game, "isHome": True}
    away_kwargs = {"gameinfo": game, "isHome": False}
    if with_scores:
        home_kwargs.update({"fh": 6, "sh": 7})
        away_kwargs.update({"fh": 0, "sh": 6})
    GameresultFactory(**home_kwargs)
    GameresultFactory(**away_kwargs)
    if with_log:
        home_team = game.gameresult_set.get(isHome=True).team
        TeamLogFactory(
            gameinfo=game,
            team=home_team,
            sequence=1,
            event="Touchdown",
            player=42,
            half=1,
            author=author,
        )
    return gameday


@override_settings(CACHES=LOC_MEM_CACHES)
class SnapshotEndpointTest(APITestCase):
    def setUp(self):
        self.user = User.objects.create_user(username="logger", password="pw")

    def test_snapshot_returns_envelope_with_gameday_fields(self):
        gameday = make_gameday_with_game(author=self.user)

        response = self.client.get(SNAPSHOT_URL)

        assert response.status_code == status.HTTP_200_OK
        assert set(response.data.keys()) >= {
            "generated_at",
            "scope",
            "etag",
            "gamedays",
        }
        entry = next(g for g in response.data["gamedays"] if g["id"] == gameday.id)
        assert set(entry.keys()) >= {
            "id",
            "name",
            "season",
            "season_display",
            "league",
            "league_display",
            "date",
            "format",
            "status",
        }
        assert entry["league_display"] == gameday.league.name

    def test_snapshot_is_publicly_readable(self):
        make_gameday_with_game(author=self.user)

        response = self.client.get(SNAPSHOT_URL)

        assert response.status_code == status.HTTP_200_OK

    def test_snapshot_excludes_drafts_by_default(self):
        make_gameday_with_game(gameday_status=Gameday.STATUS_DRAFT, author=self.user)

        response = self.client.get(SNAPSHOT_URL)

        assert response.status_code == status.HTTP_200_OK
        assert response.data["gamedays"] == []

    def test_snapshot_includes_drafts_when_status_requested(self):
        gameday = make_gameday_with_game(
            gameday_status=Gameday.STATUS_DRAFT, author=self.user
        )

        response = self.client.get(SNAPSHOT_URL, {"status": "DRAFT"})

        assert response.status_code == status.HTTP_200_OK
        assert [g["id"] for g in response.data["gamedays"]] == [gameday.id]

    def test_snapshot_filters_by_league_and_season(self):
        league = LeagueFactory(name="wanted-league")
        other_league = LeagueFactory(name="other-league")
        season = SeasonFactory(name="2031")
        wanted = make_gameday_with_game(league=league, season=season, author=self.user)
        make_gameday_with_game(league=other_league, season=season, author=self.user)

        response = self.client.get(
            SNAPSHOT_URL, {"league": str(league.id), "season": str(season.id)}
        )

        assert response.status_code == status.HTTP_200_OK
        assert [g["id"] for g in response.data["gamedays"]] == [wanted.id]

    def test_snapshot_team_filter_includes_unplayed_fixtures(self):
        """A team filter must match scheduled-but-unplayed games: results rows
        exist (teams assigned) while fh/sh are still NULL."""
        team = TeamFactory(name="fixture-team")
        gameday = GamedayFactory(status=Gameday.STATUS_PUBLISHED)
        game = GameinfoFactory(gameday=gameday)
        GameresultFactory(gameinfo=game, team=team, isHome=True)
        GameresultFactory(gameinfo=game, isHome=False)
        assert game.gameresult_set.filter(fh__isnull=True).exists()

        response = self.client.get(SNAPSHOT_URL, {"team": str(team.id)})

        assert response.status_code == status.HTTP_200_OK
        assert [g["id"] for g in response.data["gamedays"]] == [gameday.id]

    def test_snapshot_include_games_matches_games_endpoint_shape(self):
        gameday = make_gameday_with_game(author=self.user)

        snapshot = self.client.get(SNAPSHOT_URL, {"include": "games"})
        games_endpoint = self.client.get(f"/api/gamedays/{gameday.id}/games/")

        assert snapshot.status_code == status.HTTP_200_OK
        entry = next(g for g in snapshot.data["gamedays"] if g["id"] == gameday.id)
        assert [game["id"] for game in entry["games"]] == [
            game["id"] for game in games_endpoint.data
        ]
        game = entry["games"][0]
        assert set(game.keys()) >= {
            "results",
            "halftime_score",
            "final_score",
        }
        assert game["final_score"] == {"home": 13, "away": 6}

    def test_snapshot_include_logs_matches_gamelog_endpoint_shape(self):
        gameday = make_gameday_with_game(author=self.user)
        game_id = gameday.gameinfo_set.get().id

        snapshot = self.client.get(SNAPSHOT_URL, {"include": "games,logs"})
        gamelog_endpoint = self.client.get(f"/api/gamelog/{game_id}")

        assert snapshot.status_code == status.HTTP_200_OK
        assert gamelog_endpoint.status_code == status.HTTP_200_OK
        entry = next(g for g in snapshot.data["gamedays"] if g["id"] == gameday.id)
        log = entry["games"][0]["log"]
        assert log["gameId"] == game_id
        assert set(log.keys()) >= {"home", "away"}
        # Same pass-number exposure as the per-game endpoint: no new
        # restriction, no new leak either.
        assert log == gamelog_endpoint.data

    def test_snapshot_without_include_has_no_games_key(self):
        make_gameday_with_game(author=self.user)

        response = self.client.get(SNAPSHOT_URL)

        assert response.status_code == status.HTTP_200_OK
        assert "games" not in response.data["gamedays"][0]

    def test_snapshot_rejects_invalid_params(self):
        make_gameday_with_game(author=self.user)

        assert self.client.get(SNAPSHOT_URL, {"league": "nope"}).status_code == (
            status.HTTP_400_BAD_REQUEST
        )
        assert self.client.get(SNAPSHOT_URL, {"league": "99999"}).status_code == (
            status.HTTP_400_BAD_REQUEST
        )
        assert self.client.get(SNAPSHOT_URL, {"team": "99999"}).status_code == (
            status.HTTP_400_BAD_REQUEST
        )
        assert self.client.get(SNAPSHOT_URL, {"season": "99999"}).status_code == (
            status.HTTP_400_BAD_REQUEST
        )
        assert self.client.get(SNAPSHOT_URL, {"include": "everything"}).status_code == (
            status.HTTP_400_BAD_REQUEST
        )
        assert self.client.get(
            SNAPSHOT_URL, {"date_from": "yesterday"}
        ).status_code == (status.HTTP_400_BAD_REQUEST)
        assert self.client.get(SNAPSHOT_URL, {"status": "MAYBE"}).status_code == (
            status.HTTP_400_BAD_REQUEST
        )

    def test_snapshot_etag_revalidates_with_304(self):
        make_gameday_with_game(author=self.user)

        first = self.client.get(SNAPSHOT_URL, {"include": "games"})
        assert first.status_code == status.HTTP_200_OK

        revalidated = self.client.get(
            SNAPSHOT_URL,
            {"include": "games"},
            HTTP_IF_NONE_MATCH=first["ETag"],
        )

        assert revalidated.status_code == status.HTTP_304_NOT_MODIFIED

    def test_snapshot_etag_changes_when_result_entered(self):
        gameday = make_gameday_with_game(
            with_scores=False, with_log=False, author=self.user
        )

        first = self.client.get(SNAPSHOT_URL, {"include": "games"})
        etag_before = first["ETag"]

        result = gameday.gameinfo_set.get().gameresult_set.get(isHome=True)
        result.fh = 6
        result.save()

        revalidated = self.client.get(
            SNAPSHOT_URL,
            {"include": "games"},
            HTTP_IF_NONE_MATCH=etag_before,
        )

        assert revalidated.status_code == status.HTTP_200_OK

    def test_snapshot_second_identical_request_is_cached(self):
        make_gameday_with_game(author=self.user)
        params = {"include": "games,logs"}

        with CaptureQueriesContext(connection) as first_ctx:
            first = self.client.get(SNAPSHOT_URL, params)
        assert first.status_code == status.HTTP_200_OK

        with CaptureQueriesContext(connection) as second_ctx:
            second = self.client.get(SNAPSHOT_URL, params)
        assert second.status_code == status.HTTP_200_OK

        assert second.data == first.data
        assert len(second_ctx) < len(first_ctx), (
            "second identical request ran as many queries as the first -- "
            "the TTL cache did not serve it"
        )

    def test_snapshot_throttle_blocks_abuse(self):
        # DRF binds THROTTLE_RATES at import, so override_settings cannot
        # change the rate: patch the class attribute and clear history.
        from django.core.cache import caches

        make_gameday_with_game(author=self.user)
        caches["default"].delete("throttle_snapshot_127.0.0.1")
        rates = {"snapshot": "2/min"}
        with mock.patch.object(ScopedRateThrottle, "THROTTLE_RATES", rates):
            assert self.client.get(SNAPSHOT_URL).status_code == status.HTTP_200_OK
            assert self.client.get(SNAPSHOT_URL).status_code == status.HTTP_200_OK
            assert self.client.get(SNAPSHOT_URL).status_code == (
                status.HTTP_429_TOO_MANY_REQUESTS
            )

    def test_snapshot_throttle_scope_is_configured(self):
        from django.conf import settings as django_settings

        from gamedays.api.snapshot import SnapshotAPIView

        assert (
            django_settings.REST_FRAMEWORK["DEFAULT_THROTTLE_RATES"]["snapshot"]
            == "60/hour"
        )
        assert SnapshotAPIView.throttle_scope == "snapshot"
        assert ScopedRateThrottle in SnapshotAPIView.throttle_classes

    def test_snapshot_does_not_leak_roster_pii(self):
        """Scores and game logs are public data; roster PII (passcheck names,
        join dates) must not appear in the dump."""
        make_gameday_with_game(author=self.user)

        response = self.client.get(SNAPSHOT_URL, {"include": "games,logs"})

        assert response.status_code == status.HTTP_200_OK
        blob = str(response.data)
        assert "passcheck" not in blob.lower()
        assert "join" not in blob.lower()
        teamlog_count = TeamLog.objects.count()
        assert teamlog_count > 0
