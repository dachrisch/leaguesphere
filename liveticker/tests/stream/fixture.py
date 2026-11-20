"""A today-dated live game for stream tests."""

import datetime

from django.contrib.auth.models import User

from gamedays.models import (
    Gameday,
    Gameinfo,
    Gameresult,
    League,
    Season,
    Team,
    TeamLog,
)


def make_ticker_fixture():
    """A gameday dated today with one live game and one tick."""
    author = User.objects.create(username="stream-author")
    league = League.objects.create(name="Streamliga", slug="streamliga")
    season = Season.objects.create(name="2026")
    gameday = Gameday.objects.create(
        name="Stream-Spieltag",
        season=season,
        league=league,
        date=datetime.date.today(),
        start=datetime.time(10, 0),
        author=author,
    )
    home = Team.objects.create(name="Home Stream", description="h", location="H")
    away = Team.objects.create(name="Away Stream", description="a", location="A")
    game = Gameinfo.objects.create(
        gameday=gameday,
        scheduled=datetime.time(11, 0),
        field=1,
        officials=home,
        status="1. Halbzeit",
        stage="Vorrunde",
        standing="Gruppe 1",
        in_possession="home",
    )
    Gameresult.objects.create(gameinfo=game, team=home, fh=7, sh=0, isHome=True)
    Gameresult.objects.create(gameinfo=game, team=away, fh=6, sh=0, isHome=False)
    TeamLog.objects.create(
        gameinfo=game,
        team=home,
        sequence=1,
        player=7,
        event="Touchdown",
        input="45 Yards",
        value=6,
        half=1,
        created_time=datetime.time(11, 10),
        author=author,
    )
    return {"author": author, "gameday": gameday, "game": game, "home": home}
