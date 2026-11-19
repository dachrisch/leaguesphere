from datetime import UTC, date, datetime

from gameevents.service.legacy import LEGACY_EVENTS
from liveticker.api.serializers import (
    EVENT_TYPE_BY_NAME,
    LIVETICKER_EVENT_TYPES,
    TeamlogSerializer,
    LivetickerSerializer,
)


class TestTeamlogSerializer:
    @staticmethod
    def create_some_teamlog(**kwargs):
        allowed_keys = [
            "event",
            "player",
            "input",
            "value",
            "created_time",
            "team__name",
        ]
        defaults = {
            "event": "Touchdown",
            "player": None,
            "input": None,
            "value": 1,
            "created_time": datetime.now(),
            "team__name": "name of team",
        }
        updated_values = {key: kwargs[key] for key in allowed_keys if key in kwargs}
        defaults.update(updated_values)
        return defaults

    def test_default_works(self):
        ref_now = datetime(2026, 8, 15, 12, 0, 0, tzinfo=UTC)
        created_time = datetime(2026, 8, 15, 8, 5, 0, tzinfo=UTC)
        teamlog_entries = [
            TestTeamlogSerializer.create_some_teamlog(
                player=7, created_time=created_time
            ),
            TestTeamlogSerializer.create_some_teamlog(created_time=created_time),
        ]
        serializer = TeamlogSerializer(
            instance=teamlog_entries,
            home_team="name of team",
            ref_now=ref_now,
            many=True,
        )
        assert dict(serializer.data[0]) == {
            "team": "home",
            "text": "Touchdown: #7",
            "type": "touchdown",
            "time": "2026-08-15T08:05:00+00:00",
        }

    def test_team_is_none(self):
        ref_now = datetime(2026, 8, 15, 12, 0, 0, tzinfo=UTC)
        created_time = datetime(2026, 8, 15, 8, 5, 0, tzinfo=UTC)
        teamlog_entries = [
            TestTeamlogSerializer.create_some_teamlog(
                event="Spielzeit", input="1:05", created_time=created_time
            )
        ]
        serializer = TeamlogSerializer(
            instance=teamlog_entries,
            home_team="name of team",
            ref_now=ref_now,
            many=True,
        )
        assert dict(serializer.data[0]) == {
            "team": None,
            "text": "Spielzeit - 1:05",
            "type": "clock",
            "time": "2026-08-15T08:05:00+00:00",
        }

    def test_get_text_for_pat(self):
        teamlog_entries = [
            TestTeamlogSerializer.create_some_teamlog(player=7, event="1-Extra-Punkt")
        ]
        serializer = TeamlogSerializer(
            instance=teamlog_entries, home_team=None, many=True
        )
        assert serializer.data[0]["text"] == "1-Extra-Punkt: #7"

    def test_get_text_for_timeout(self):
        teamlog_entries = [
            TestTeamlogSerializer.create_some_teamlog(event="Auszeit", input="00:01")
        ]
        serializer = TeamlogSerializer(
            instance=teamlog_entries, home_team=None, many=True
        )
        assert serializer.data[0]["text"] == "Auszeit - 00:01"

    def test_get_text_for_incomplete_pat(self):
        teamlog_entries = [
            TestTeamlogSerializer.create_some_teamlog(event="1-Extra-Punkt")
        ]
        serializer = TeamlogSerializer(
            instance=teamlog_entries, home_team=None, many=True
        )
        assert serializer.data[0]["text"] == "1-Extra-Punkt: -"

    def test_get_text_for_safety(self):
        teamlog_entries = [
            TestTeamlogSerializer.create_some_teamlog(player=7, event="Safety")
        ]
        serializer = TeamlogSerializer(
            instance=teamlog_entries, home_team=None, many=True
        )
        assert serializer.data[0]["text"] == "Safety: #7"

    def test_get_text_for_turnover(self):
        teamlog_entries = [TestTeamlogSerializer.create_some_teamlog(event="Turnover")]
        serializer = TeamlogSerializer(
            instance=teamlog_entries, home_team=None, many=True
        )
        assert serializer.data[0]["text"] == "Ballabgabe"

    def test_is_home_or_way_in_possession(self):
        teamlog_entries = [
            TestTeamlogSerializer.create_some_teamlog(),
            TestTeamlogSerializer.create_some_teamlog(team__name="not home team name"),
        ]
        serializer = TeamlogSerializer(
            instance=teamlog_entries, home_team="name of team", many=True
        )
        assert serializer.data[0]["team"] == "home"
        assert serializer.data[1]["team"] == "away"

    def test_a_penalty_is_attributed_to_the_penalised_team(self):
        teamlog_entries = [
            TestTeamlogSerializer.create_some_teamlog(
                event="Strafe",
                input="Fehlstart",
                team__name="not home team name",
            )
        ]
        serializer = TeamlogSerializer(
            instance=teamlog_entries, home_team="name of team", many=True
        )
        assert serializer.data[0]["team"] == "away"

    def test_a_penalty_against_the_home_team_is_home(self):
        teamlog_entries = [
            TestTeamlogSerializer.create_some_teamlog(
                event="Strafe",
                input="Fehlstart",
                team__name="name of team",
            )
        ]
        serializer = TeamlogSerializer(
            instance=teamlog_entries, home_team="name of team", many=True
        )
        assert serializer.data[0]["team"] == "home"


class TestTeamlogType:
    def test_every_known_event_has_a_stable_type(self):
        for event_name, expected in EVENT_TYPE_BY_NAME.items():
            entry = TestTeamlogSerializer.create_some_teamlog(event=event_name)
            serializer = TeamlogSerializer(
                instance=[entry], home_team="name of team", many=True
            )
            assert serializer.data[0]["type"] == expected

    def test_an_unknown_event_falls_back_to_other(self):
        entry = TestTeamlogSerializer.create_some_teamlog(event="Something new")
        serializer = TeamlogSerializer(
            instance=[entry], home_team="name of team", many=True
        )
        assert serializer.data[0]["type"] == "other"

    def test_every_legacy_event_has_a_specific_type(self):
        for name in LEGACY_EVENTS:
            assert EVENT_TYPE_BY_NAME[name] != "other", name

    def test_the_derived_types_are_the_published_contract(self):
        assert EVENT_TYPE_BY_NAME == {
            "Touchdown": "touchdown",
            "1-Extra-Punkt": "extra_point",
            "2-Extra-Punkte": "extra_point",
            "Overtime": "overtime_score",
            "Safety (+1)": "safety",
            "Safety (+2)": "safety",
            "Turnover": "turnover",
            "Interception": "interception",
            "First Down": "first_down",
            "Strafe": "penalty",
            "Spielzeit": "clock",
            "Auszeit": "timeout",
            "Pass": "pass",
            "Pass unvollständig": "pass_incomplete",
            "Run": "run",
            "Sack": "sack",
            "Challenge": "challenge",
            "Feldposition": "field_position",
            "Spiel gestartet": "period_start",
            "2. Halbzeit gestartet": "period_half",
            "Overtime startet": "period_overtime",
            "Spiel beendet": "period_end",
        }

    def test_the_extra_table_only_names_events_the_legacy_map_lacks(self):
        assert set(LIVETICKER_EVENT_TYPES) == {
            "Pass",
            "Pass unvollständig",
            "Run",
            "Sack",
            "Challenge",
            "Feldposition",
            "Overtime startet",
        }
        assert not set(LIVETICKER_EVENT_TYPES) & set(LEGACY_EVENTS)

    def test_the_type_set_covers_the_scorecard_vocabulary(self):
        assert set(EVENT_TYPE_BY_NAME.values()) == {
            "touchdown",
            "extra_point",
            "overtime_score",
            "safety",
            "turnover",
            "interception",
            "first_down",
            "penalty",
            "clock",
            "timeout",
            "pass",
            "pass_incomplete",
            "run",
            "sack",
            "challenge",
            "field_position",
            "period_start",
            "period_half",
            "period_overtime",
            "period_end",
        }


class TestTeamlogSerializerMissedTry:
    """A conversion that failed is a story of its own: it says so and why."""

    def test_the_row_value_is_part_of_the_query_fields(self):
        # ``get_text`` decides "missed" from ``value``, so the service's
        # ``.values()`` has to fetch it.
        assert "value" in TeamlogSerializer.ALL_VALUE_FIELDS

    @staticmethod
    def text_for(event, player, input_value, value):
        entry = TestTeamlogSerializer.create_some_teamlog(
            event=event, player=player, input=input_value, value=value
        )
        serializer = TeamlogSerializer(instance=[entry], home_team=None, many=True)
        return serializer.data[0]["text"]

    def test_a_missed_extra_point_names_the_receiver_and_the_deflection(self):
        assert (
            self.text_for("1-Extra-Punkt", 3, "nicht verwandelt · Deflection #2", 0)
            == "1-Extra-Punkt: #3 - nicht verwandelt · Deflection #2"
        )

    def test_a_missed_extra_point_without_a_receiver_skips_the_player_slot(self):
        assert (
            self.text_for("1-Extra-Punkt", None, "nicht verwandelt · Tackle #2", 0)
            == "1-Extra-Punkt - nicht verwandelt · Tackle #2"
        )

    def test_a_missed_two_point_try_names_its_own_event(self):
        assert (
            self.text_for("2-Extra-Punkte", 7, "nicht verwandelt", 0)
            == "2-Extra-Punkte: #7 - nicht verwandelt"
        )

    def test_a_legacy_miss_without_input_still_says_nicht_verwandelt(self):
        assert (
            self.text_for("2-Extra-Punkte", None, None, 0)
            == "2-Extra-Punkte - nicht verwandelt"
        )

    def test_a_miss_without_the_prefix_still_says_nicht_verwandelt(self):
        assert (
            self.text_for("1-Extra-Punkt", 3, "Deflection #2", 0)
            == "1-Extra-Punkt: #3 - nicht verwandelt · Deflection #2"
        )

    def test_a_converted_try_is_unchanged(self):
        assert self.text_for("1-Extra-Punkt", 3, None, 1) == "1-Extra-Punkt: #3"
        assert self.text_for("2-Extra-Punkte", 7, None, 2) == "2-Extra-Punkte: #7"


class TestLivetickerSerializer:
    @staticmethod
    def create_some_liveticker(**kwargs):
        allowed_keys = [
            "scheduled",
            "scheduled_date",
            "tick_count",
            "id",
            "status",
            "standing",
            "gameStarted",
            "name_home",
            "name_away",
            "score_home",
            "score_away",
            "in_possession",
            "teamlog",
            "full_name_home",
            "full_name_away",
            "gameday",
            "gameday_name",
            "gameday_address",
            "league_name",
            "field",
            "stage",
            "logo_home",
            "logo_away",
            "fh_home",
            "sh_home",
            "fh_away",
            "sh_away",
        ]
        defaults = {
            "scheduled": datetime(2021, 12, 7, 10, 00),
            "scheduled_date": date(2021, 12, 7),
            "tick_count": 1,
            "id": 7,
            "status": "Geplant",
            "standing": "Group 1",
            "stage": "Vorrunde",
            "field": 1,
            "gameStarted": None,
            "name_home": "home",
            "full_name_home": "home team",
            "name_away": "away",
            "full_name_away": "away team",
            "score_home": 7,
            "score_away": 25,
            "in_possession": "home",
            "gameday": 3,
            "gameday_name": "Test Spieltag",
            "gameday_address": "Testfeld",
            "league_name": "some_division",
            "logo_home": None,
            "logo_away": None,
            "fh_home": 4,
            "sh_home": 3,
            "fh_away": 10,
            "sh_away": 15,
            "teamlog": [TestTeamlogSerializer.create_some_teamlog(**kwargs)],
        }

        updated_values = {key: kwargs[key] for key in allowed_keys if key in kwargs}
        defaults.update(updated_values)
        return defaults

    def test_game_with_no_team_logs(self):
        liveticker_entries = [
            TestLivetickerSerializer.create_some_liveticker(teamlog=[])
        ]
        serializer = LivetickerSerializer(instance=liveticker_entries, many=True)
        assert dict(serializer.data[0]) == {
            "gameId": 7,
            "status": "Geplant",
            "standing": "Group 1",
            "stage": "Vorrunde",
            "field": 1,
            "league": "some_division",
            "gameday": {
                "id": 3,
                "name": "Test Spieltag",
                "address": "Testfeld",
            },
            "time": "10:00",
            "scheduled_at": "2021-12-07T10:00:00+01:00",
            "tick_count": 1,
            "home": {
                "name": "home",
                "full_name": "home team",
                "score": 7,
                "isInPossession": True,
                "logo": None,
                "fh": 4,
                "sh": 3,
            },
            "away": {
                "name": "away",
                "full_name": "away team",
                "score": 25,
                "isInPossession": False,
                "logo": None,
                "fh": 10,
                "sh": 15,
            },
            "ticks": [],
        }

    def test_home_name_uses_the_short_name_and_keeps_the_description(self):
        liveticker_entries = [
            TestLivetickerSerializer.create_some_liveticker(
                name_home="Wall",
                full_name_home="Walldorf Wanderers",
                name_away="Firecats",
                full_name_away="Düsseldorf Firecats",
            )
        ]
        serializer = LivetickerSerializer(instance=liveticker_entries, many=True)
        assert serializer.data[0]["home"]["name"] == "Wall"
        assert serializer.data[0]["home"]["full_name"] == "Walldorf Wanderers"
        assert serializer.data[0]["away"]["name"] == "Firecats"
        assert serializer.data[0]["away"]["full_name"] == "Düsseldorf Firecats"

    def test_game_with_game_started_time(self):
        ref_now = datetime(2022, 1, 7, 12, 0, 0, tzinfo=UTC)
        game_started = datetime(2022, 1, 7, 7, 7, 7, tzinfo=UTC)
        liveticker_entries = [
            TestLivetickerSerializer.create_some_liveticker(gameStarted=game_started)
        ]
        serializer = LivetickerSerializer(
            instance=liveticker_entries, many=True, ref_now=ref_now
        )
        assert serializer.data[0]["time"] == "2022-01-07T07:07:07+00:00"

    def test_game_started_near_utc_midnight_uses_previous_day(self):
        # A tick/game recorded at 23:50 UTC just before the DST-end instant
        # must be attributed to the previous day, not to "today" — otherwise
        # the frontend resolves the wrong DST offset (off by a full hour).
        ref_now = datetime(2026, 10, 25, 0, 5, 0, tzinfo=UTC)
        game_started = datetime(2026, 10, 24, 23, 50, 0, tzinfo=UTC)
        liveticker_entries = [
            TestLivetickerSerializer.create_some_liveticker(gameStarted=game_started)
        ]
        serializer = LivetickerSerializer(
            instance=liveticker_entries, many=True, ref_now=ref_now
        )
        assert serializer.data[0]["time"] == "2026-10-24T23:50:00+00:00"


class TestTeamlogSerializerPlayByPlay:
    """The play rows carry their detail into the ticker text."""

    @staticmethod
    def text_for(event, player, input_value):
        entry = TestTeamlogSerializer.create_some_teamlog(
            event=event, player=player, input=input_value
        )
        serializer = TeamlogSerializer(instance=[entry], home_team=None, many=True)
        return serializer.data[0]["text"]

    def test_a_pass_shows_the_receiver_and_the_play_detail(self):
        assert (
            self.text_for("Pass", 7, "8 Yards · QB #12")
            == "Pass: #7 - 8 Yards · QB #12"
        )

    def test_an_incomplete_pass_keeps_its_name(self):
        assert (
            self.text_for("Pass unvollständig", None, "QB #12")
            == "Pass unvollständig - QB #12"
        )

    def test_a_run_and_a_sack_show_their_yards(self):
        assert self.text_for("Run", 23, "14 Yards") == "Run: #23 - 14 Yards"
        assert self.text_for("Sack", 12, "5 Yards Verlust") == (
            "Sack: #12 - 5 Yards Verlust"
        )

    def test_a_touchdown_with_yards_keeps_the_scorer(self):
        assert self.text_for("Touchdown", 7, "8 Yards") == ("Touchdown: #7 - 8 Yards")
