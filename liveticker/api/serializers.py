from rest_framework.fields import CharField, SerializerMethodField, IntegerField
from rest_framework.serializers import Serializer

from gamedays.service.utils import utc_time_as_iso


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

    def __init__(self, home_team, ref_now=None, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self.home_team = home_team
        self.ref_now = ref_now

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
        # created_time is the UTC instant of the tick, emitted as a
        # self-describing UTC ISO timestamp.
        return utc_time_as_iso(obj[self.CREATED_TIME], ref_now=self.ref_now)


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

    def __init__(self, ref_now=None, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self.ref_now = ref_now

    def get_ticks(self, obj: dict):
        return TeamlogSerializer(
            instance=obj[self.TEAMLOG],
            home_team=obj[self.NAME_HOME],
            ref_now=self.ref_now,
            many=True,
        ).data

    def get_time(self, obj: dict):
        if obj.get(self.GAME_STARTED) is None:
            # scheduled is human-entered local wall-clock time; display as-is.
            return obj[self.SCHEDULED].strftime("%H:%M")
        return utc_time_as_iso(obj[self.GAME_STARTED], ref_now=self.ref_now)

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
