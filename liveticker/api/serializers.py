from datetime import datetime

from django.conf import settings
from django.utils import timezone
from rest_framework.fields import CharField, SerializerMethodField, IntegerField
from rest_framework.serializers import Serializer

from gamedays.service.utils import utc_time_as_iso
from gameevents.service.legacy import LEGACY_EVENTS

# The rows whose ``input`` is part of the story rather than bookkeeping (the
# play-by-play, the clocks and the penalty name).
_EVENTS_WITH_INPUT = frozenset(
    {
        "Auszeit",
        "Spielzeit",
        "Strafe",
        "Pass",
        "Pass unvollständig",
        "Run",
        "Sack",
        "Touchdown",
        "First Down",
        "Challenge",
        "Feldposition",
    }
)

# The two conversions. A conversion with ``value`` 0 is a miss: it says so and
# names the defender, so its input belongs to the story too.
_TRY_EVENTS = frozenset({"1-Extra-Punkt", "2-Extra-Punkte"})
_MISSED_TRY = "nicht verwandelt"

# The API kind for a legacy event's (kind, sub-kind). ``gameevents`` already
# owns the name -> kind table (``LEGACY_EVENTS``), so the liveticker derives its
# types from it instead of repeating the names: a new name that reuses an
# existing kind reaches the ticker without a second edit.
EVENT_TYPE_BY_LEGACY_KIND = {
    ("score", "touchdown"): "touchdown",
    ("score", "pat1"): "extra_point",
    ("score", "pat2"): "extra_point",
    ("score", "overtime"): "overtime_score",
    ("score", "safety"): "safety",
    ("possession", "turnover"): "turnover",
    ("possession", "interception"): "interception",
    ("series", "first_down"): "first_down",
    ("penalty", None): "penalty",
    ("time", "clock"): "clock",
    ("timeout", None): "timeout",
    ("period", "start"): "period_start",
    ("period", "half_time"): "period_half",
    ("period", "end"): "period_end",
}

# Names the legacy scorecard writer never posts: the v2 scorecard logs these
# directly, so ``LEGACY_EVENTS`` cannot describe them. They stay explicit here
# rather than being folded into ``other``.
LIVETICKER_EVENT_TYPES = {
    "Pass": "pass",
    "Pass unvollständig": "pass_incomplete",
    "Run": "run",
    "Sack": "sack",
    "Challenge": "challenge",
    "Feldposition": "field_position",
    "Overtime startet": "period_overtime",
}

# Stable machine-readable tick kinds. The value is derived from the stored
# TeamLog event name, never from the rendered text (which the serializer may
# still localise). A kind the API does not know is ``other``.
EVENT_TYPE_BY_NAME = {
    name: EVENT_TYPE_BY_LEGACY_KIND.get((spec.type, spec.code), "other")
    for name, spec in LEGACY_EVENTS.items()
}
EVENT_TYPE_BY_NAME.update(LIVETICKER_EVENT_TYPES)


class TeamlogSerializer(Serializer):
    EVENT = "event"
    PLAYER = "player"
    INPUT = "input"
    VALUE = "value"
    CREATED_TIME = "created_time"
    TEAM_NAME = "team__name"
    ALL_VALUE_FIELDS = [EVENT, PLAYER, INPUT, VALUE, CREATED_TIME, TEAM_NAME]

    text = SerializerMethodField()
    type = SerializerMethodField()
    team = SerializerMethodField()
    time = SerializerMethodField()

    def __init__(self, home_team, ref_now=None, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self.home_team = home_team
        self.ref_now = ref_now

    @staticmethod
    def _missed_try_text(obj: dict):
        """The miss detail of a conversion row, or ``None`` for a converted one.

        The write contract: a missed try stores ``value`` 0 and an input that
        starts with ``nicht verwandelt``. A legacy row (value 0, no input) is a
        miss too; an older row that kept its detail without the prefix still
        gets the prefix, so the ticker never shows a bare detail for a miss.
        """
        if obj.get(TeamlogSerializer.EVENT) not in _TRY_EVENTS:
            return None
        detail = (obj.get(TeamlogSerializer.INPUT) or "").strip()
        if obj.get(TeamlogSerializer.VALUE) != 0 and not detail.startswith(_MISSED_TRY):
            return None
        if detail == "":
            return _MISSED_TRY
        if detail.startswith(_MISSED_TRY):
            return detail
        return f"{_MISSED_TRY} · {detail}"

    def get_type(self, obj: dict):
        return EVENT_TYPE_BY_NAME.get(obj[self.EVENT], "other")

    def get_text(self, obj: dict):
        text = obj[self.EVENT]
        if obj[self.PLAYER] is not None:
            text = f"{text}: #{obj[self.PLAYER]}"
        missed = self._missed_try_text(obj)
        if missed is not None:
            # No ": -" placeholder for a missing jersey: the miss itself is the
            # story. Converted tries keep their slot.
            return f"{text} - {missed}"
        if obj[self.PLAYER] is None and "Extra" in obj[self.EVENT]:
            text = f"{text}: -"
        if obj[self.EVENT] in _EVENTS_WITH_INPUT and obj[self.INPUT]:
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
    SCHEDULED_DATE = "scheduled_date"
    TICK_COUNT = "tick_count"
    ID = "id"
    NAME_HOME = "name_home"
    FULL_NAME_HOME = "full_name_home"
    NAME_AWAY = "name_away"
    FULL_NAME_AWAY = "full_name_away"
    SCORE_HOME = "score_home"
    SCORE_AWAY = "score_away"
    IN_POSSESSION = "in_possession"
    TEAMLOG = "teamlog"
    GAMEDAY = "gameday"
    GAMEDAY_NAME = "gameday_name"
    GAMEDAY_ADDRESS = "gameday_address"
    LEAGUE_NAME = "league_name"
    FIELD = "field"
    STAGE = "stage"
    LOGO_HOME = "logo_home"
    LOGO_AWAY = "logo_away"
    FH_HOME = "fh_home"
    SH_HOME = "sh_home"
    FH_AWAY = "fh_away"
    SH_AWAY = "sh_away"
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
        SCHEDULED_DATE,
        TICK_COUNT,
        GAME_STARTED,
        GAMEDAY,
        GAMEDAY_NAME,
        GAMEDAY_ADDRESS,
        LEAGUE_NAME,
        FIELD,
        STAGE,
        LOGO_HOME,
        LOGO_AWAY,
        FH_HOME,
        SH_HOME,
        FH_AWAY,
        SH_AWAY,
    ]

    gameId = IntegerField(source=ID)
    status = CharField()
    standing = CharField()
    stage = CharField()
    field = IntegerField()
    league = SerializerMethodField()
    gameday = SerializerMethodField()
    time = SerializerMethodField(source=GAME_STARTED)
    scheduled_at = SerializerMethodField()
    tick_count = IntegerField()
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

    def get_scheduled_at(self, obj: dict):
        date = obj.get(self.SCHEDULED_DATE)
        scheduled = obj.get(self.SCHEDULED)
        if date is None or scheduled is None:
            return None
        scheduled_time = (
            scheduled.time() if isinstance(scheduled, datetime) else scheduled
        )
        aware = timezone.make_aware(
            datetime.combine(date, scheduled_time), timezone.get_current_timezone()
        )
        return aware.isoformat()

    def get_time(self, obj: dict):
        if obj.get(self.GAME_STARTED) is None:
            # scheduled is human-entered local wall-clock time; display as-is.
            return obj[self.SCHEDULED].strftime("%H:%M")
        return utc_time_as_iso(obj[self.GAME_STARTED], ref_now=self.ref_now)

    def get_league(self, obj: dict):
        return obj[self.LEAGUE_NAME]

    def get_gameday(self, obj: dict):
        return {
            "id": obj[self.GAMEDAY],
            "name": obj[self.GAMEDAY_NAME],
            "address": obj[self.GAMEDAY_ADDRESS],
        }

    def get_home(self, obj: dict):
        return self._get_team_dict(
            full_team_name=obj[self.FULL_NAME_HOME],
            team_name=obj[self.NAME_HOME],
            score=obj[self.SCORE_HOME],
            in_possession=obj[self.IN_POSSESSION],
            logo=obj[self.LOGO_HOME],
            first_half=obj[self.FH_HOME],
            second_half=obj[self.SH_HOME],
        )

    def get_away(self, obj: dict):
        return self._get_team_dict(
            full_team_name=obj[self.FULL_NAME_AWAY],
            team_name=obj[self.NAME_AWAY],
            score=obj[self.SCORE_AWAY],
            in_possession=obj[self.IN_POSSESSION],
            logo=obj[self.LOGO_AWAY],
            first_half=obj[self.FH_AWAY],
            second_half=obj[self.SH_AWAY],
        )

    # noinspection PyMethodMayBeStatic
    def _get_team_dict(
        self,
        full_team_name,
        team_name: str,
        score: int,
        in_possession: str,
        logo: str | None,
        first_half: int | None,
        second_half: int | None,
    ):
        logo_url = None
        if logo:
            logo_url = f"{settings.MEDIA_URL}{logo}"
        return {
            # ``name`` is the team's short name (Team.name, e.g. "Wall");
            # ``full_name`` keeps the long description for clients that want
            # the former display string.
            "name": team_name,
            "full_name": full_team_name,
            "score": score,
            "isInPossession": team_name == in_possession,
            "logo": logo_url,
            "fh": first_half,
            "sh": second_half,
        }
