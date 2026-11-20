import datetime

from django.contrib.auth.models import User
from django.test import TestCase, override_settings
from django.urls import reverse

from gamedays.models import Gameday, Gameinfo, League, Season, Team
from liveticker.constants import (
    LIVETICKER_V2_GAMEDAY,
    LIVETICKER_V2_GAME,
    LIVETICKER_V2_HOME,
)


def make_ticker_fixture():
    league = League.objects.create(name="Testliga", slug="testliga")
    season = Season.objects.create(name="2026")
    author = User.objects.create(username="ticker-author")

    def gameday(name):
        return Gameday.objects.create(
            name=name,
            date=datetime.date(2026, 8, 15),
            start=datetime.time(9, 0),
            league=league,
            season=season,
            author=author,
        )

    home = Team.objects.create(name="Home Team", description="h", location="H")
    away = Team.objects.create(name="Away Team", description="a", location="A")

    def game(day, field):
        return Gameinfo.objects.create(
            gameday=day,
            scheduled=datetime.time(10, 0),
            field=field,
            officials=home,
            status="Geplant",
            stage="Vorrunde",
            standing="Gruppe 1",
        )

    first_day = gameday("Spieltag am Waldrand")
    second_day = gameday("Zweiter Spieltag")
    first_game = game(first_day, 1)
    game(second_day, 2)  # a game on another gameday, for mismatch cases
    return {
        "league": league,
        "gameday": first_day,
        "other_gameday": second_day,
        "game": first_game,
        "home": home,
        "away": away,
    }


class TestLivetickerV2Paths(TestCase):
    def setUp(self):
        self.fixture = make_ticker_fixture()
        self.day = self.fixture["gameday"]
        self.game = self.fixture["game"]

    def get(self, name, **kwargs):
        return self.client.get(reverse(name, kwargs=kwargs))

    def test_root_renders_without_ids(self):
        response = self.get(LIVETICKER_V2_HOME)

        assert response.status_code == 200
        html = response.content.decode()
        assert 'data-gameday-id=""' in html
        assert 'data-game-id=""' in html

    def test_root_keeps_site_chrome_and_metadata(self):
        html = self.get(LIVETICKER_V2_HOME).content.decode()

        assert 'class="site-header"' in html
        assert 'class="footer mt-auto py-3 bg-light border-top"' in html
        assert 'id="liveticker-v2-app"' in html
        assert "<title>LeagueSphere - Liveticker</title>" in html
        assert '<meta property="og:title" content="Liveticker' in html
        assert 'data-stream-enabled="false"' in html

    def test_gameday_path_passes_the_gameday_to_the_app(self):
        response = self.get(LIVETICKER_V2_GAMEDAY, gameday_id=self.day.pk)

        assert response.status_code == 200
        html = response.content.decode()
        assert f'data-gameday-id="{self.day.pk}"' in html
        assert 'data-game-id=""' in html
        assert "Spieltag am Waldrand" in html
        assert (
            f'<link rel="canonical" href="http://testserver/liveticker/v2/gameday/{self.day.pk}/">'
            in html
        )

    def test_game_path_passes_both_ids_and_canonical_path(self):
        response = self.get(
            LIVETICKER_V2_GAME,
            gameday_id=self.day.pk,
            game_id=self.game.pk,
        )

        assert response.status_code == 200
        html = response.content.decode()
        assert f'data-gameday-id="{self.day.pk}"' in html
        assert f'data-game-id="{self.game.pk}"' in html
        assert (
            f'<link rel="canonical" href="http://testserver/liveticker/v2/gameday/'
            f'{self.day.pk}/game/{self.game.pk}/">' in html
        )

    def test_og_url_is_the_canonical_path(self):
        response = self.get(
            LIVETICKER_V2_GAME,
            gameday_id=self.day.pk,
            game_id=self.game.pk,
        )

        html = response.content.decode()
        assert (
            f'<meta property="og:url" content="http://testserver/liveticker/v2/gameday/'
            f'{self.day.pk}/game/{self.game.pk}/">' in html
        )

    def test_unknown_gameday_is_404(self):
        response = self.get(LIVETICKER_V2_GAMEDAY, gameday_id=999999)

        assert response.status_code == 404

    def test_unknown_game_is_404(self):
        response = self.get(LIVETICKER_V2_GAME, gameday_id=self.day.pk, game_id=999999)

        assert response.status_code == 404

    def test_game_of_another_gameday_is_404(self):
        foreign_game = Gameinfo.objects.get(gameday=self.fixture["other_gameday"])

        response = self.get(
            LIVETICKER_V2_GAME,
            gameday_id=self.day.pk,
            game_id=foreign_game.pk,
        )

        assert response.status_code == 404


class TestLivetickerV2LegacyRedirects(TestCase):
    def setUp(self):
        self.fixture = make_ticker_fixture()
        self.day = self.fixture["gameday"]
        self.game = self.fixture["game"]

    def test_gameday_and_game_redirect_to_the_path_form(self):
        response = self.client.get(
            reverse(LIVETICKER_V2_HOME),
            {"gameday": self.day.pk, "game": self.game.pk},
        )

        assert response.status_code == 301
        assert response["Location"] == (
            f"/liveticker/v2/gameday/{self.day.pk}/game/{self.game.pk}/"
        )

    def test_game_alone_looks_up_its_gameday(self):
        with self.assertNumQueries(1):
            response = self.client.get(
                reverse(LIVETICKER_V2_HOME), {"game": self.game.pk}
            )

        assert response.status_code == 301
        assert response["Location"] == (
            f"/liveticker/v2/gameday/{self.day.pk}/game/{self.game.pk}/"
        )

    def test_league_and_gameday_redirect_to_the_gameday_path(self):
        response = self.client.get(
            reverse(LIVETICKER_V2_HOME),
            {"league": "testliga", "gameday": self.day.pk},
        )

        assert response.status_code == 301
        assert response["Location"] == f"/liveticker/v2/gameday/{self.day.pk}/"

    def test_all_is_dropped(self):
        response = self.client.get(
            reverse(LIVETICKER_V2_HOME),
            {"gameday": self.day.pk, "all": "1"},
        )

        assert response.status_code == 301
        assert response["Location"] == f"/liveticker/v2/gameday/{self.day.pk}/"
        assert "all" not in response["Location"]

    def test_league_alone_redirects_to_the_root(self):
        response = self.client.get(reverse(LIVETICKER_V2_HOME), {"league": "testliga"})

        assert response.status_code == 301
        assert response["Location"] == "/liveticker/v2/"

    def test_unknown_game_in_an_old_link_is_404(self):
        response = self.client.get(reverse(LIVETICKER_V2_HOME), {"game": 999999})

        assert response.status_code == 404

    def test_unknown_gameday_in_an_old_link_is_404(self):
        response = self.client.get(reverse(LIVETICKER_V2_HOME), {"gameday": 999999})

        assert response.status_code == 404

    def test_unrelated_query_parameters_do_not_redirect(self):
        response = self.client.get(reverse(LIVETICKER_V2_HOME), {"isExtern": "1"})

        assert response.status_code == 200


@override_settings(LIVETICKER_V2_ENABLED=True)
class TestTickerUrlBuilders(TestCase):
    def test_menu_uses_a_path_without_query(self):
        html = self.client.get(reverse(LIVETICKER_V2_HOME)).content.decode()

        assert 'href="/liveticker/v2/"' in html
        assert "?league=" not in html

    def test_gameday_page_link_is_the_gameday_path(self):
        from liveticker.urls import gameday_ticker_url

        day = make_ticker_fixture()["gameday"]

        url = gameday_ticker_url(day)

        assert url.endswith(f"/liveticker/v2/gameday/{day.pk}/")
        assert "?" not in url

    @override_settings(LIVETICKER_V2_ENABLED=False)
    def test_gameday_page_link_keeps_the_legacy_query_for_the_legacy_app(self):
        from liveticker.urls import gameday_ticker_url

        day = make_ticker_fixture()["gameday"]

        url = gameday_ticker_url(day)

        assert "/liveticker/?league=testliga&gameday=" in url
        assert f"gameday={day.pk}" in url
