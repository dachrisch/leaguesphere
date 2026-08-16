from datetime import UTC, datetime

from django.utils import timezone
from rest_framework.fields import CharField, SerializerMethodField, IntegerField
from rest_framework.serializers import Serializer


def _utc_time_as_iso(time_value) -> str:
    """Serialize a stored UTC wall-clock time as an explicit UTC ISO-8601 timestamp.

    ``TeamLog.created_time`` / ``Gameinfo.gameStarted`` are ``TimeField``s holding
    the UTC time-of-day (they are written from ``timezone.now()``, whose time
    component ``TimeField.to_python()`` keeps in UTC). Recombining that time with
    the current date and the UTC offset makes the value self-describing, so the
    frontend can render it in the viewer's local time.
    """
    if hasattr(time_value, "time"):
        time_value = time_value.time()
    return datetime.combine(timezone.now().date(), time_value, tzinfo=UTC).isoformat()


class TeamlogSerializer(Serializer):
    EVENT = "event"
    PLAYER = "player"
    INPUT = "input"
    CREATED_TIME = "created_time"
    TEAM_NAME = "team__name"
    ALL_VALUE_FIELDS = [EVENT, PLAYER, INPUT, CREATED_TIME, TEAM_NAME]

    text = SerializerMethodField()
    team = SerializerMethodField()
    time = SerializerMethodField()

    def __init__(self, home_team, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self.home_team = home_team

    def get_text(self, obj: dict):
        text = obj[self.EVENT]
        if obj[self.PLAYER] is not None:
            text = f"{text}: #{obj[self.PLAYER]}"
        if obj[self.PLAYER] is None and "Extra" in obj[self.EVENT]:
            text = f"{text}: -"
        if obj[self.EVENT] in ["Auszeit", "Spielzeit", "Strafe"]:
            text = f"{text} - {obj[self.INPUT]}"
        if "Turnover" == obj[self.EVENT]:
            text = "Ballabgabe"
        return text

    def get_team(self, obj: dict):
        team_name = obj[self.TEAM_NAME]
        if team_name is None or obj[self.EVENT] == "Spielzeit":
            return None
        if team_name == self.home_team:
            return "home"
        return "away"

    def get_time(self, obj: dict):
        return _utc_time_as_iso(obj[self.CREATED_TIME])


class LivetickerSerializer(Serializer):
    GAME_STARTED = "gameStarted"
    SCHEDULED = "scheduled"
    ID = "id"
    NAME_HOME = "name_home"
    FULL_NAME_HOME = "full_name_home"
    NAME_AWAY = "name_away"
    FULL_NAME_AWAY = "full_name_away"
    SCORE_HOME = "score_home"
    SCORE_AWAY = "score_away"
    IN_POSSESSION = "in_possession"
    TEAMLOG = "teamlog"
    ALL_VALUE_FIELDS = [
        "status",
        "standing",
        NAME_HOME,
        NAME_AWAY,
        SCORE_HOME,
        SCORE_AWAY,
        IN_POSSESSION,
        ID,
        FULL_NAME_HOME,
        FULL_NAME_AWAY,
        SCHEDULED,
        GAME_STARTED,
    ]

    gameId = IntegerField(source=ID)
    status = CharField()
    standing = CharField()
    time = SerializerMethodField(source=GAME_STARTED)
    home = SerializerMethodField()
    away = SerializerMethodField()
    ticks = SerializerMethodField()

    def get_ticks(self, obj: dict):
        return TeamlogSerializer(
            instance=obj[self.TEAMLOG], home_team=obj[self.NAME_HOME], many=True
        ).data

    def get_time(self, obj: dict):
        if obj.get(self.GAME_STARTED) is None:
            # scheduled is human-entered local wall-clock time; display as-is.
            return obj[self.SCHEDULED].strftime("%H:%M")
        return _utc_time_as_iso(obj[self.GAME_STARTED])

    def get_home(self, obj: dict):
        return self._get_team_dict(
            obj[self.FULL_NAME_HOME],
            obj[self.NAME_HOME],
            obj[self.SCORE_HOME],
            obj[self.IN_POSSESSION],
        )

    def get_away(self, obj: dict):
        return self._get_team_dict(
            obj[self.FULL_NAME_AWAY],
            obj[self.NAME_AWAY],
            obj[self.SCORE_AWAY],
            obj[self.IN_POSSESSION],
        )

    # noinspection PyMethodMayBeStatic
    def _get_team_dict(
        self, full_team_name, team_name: str, score: int, in_possession: str
    ):
        return {
            "name": full_team_name,
            "score": score,
            "isInPossession": team_name == in_possession,
        }
