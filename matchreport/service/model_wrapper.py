import pandas as pd
from django.db.models import OuterRef, Subquery

from gamedays.models import Gameinfo, GameSetup, Person, Gameresult, GameOfficial, TeamLog
from officials.models import OfficialLicenseHistory
from passcheck.models import PasscheckVerification, PlayerlistGameday

PLAYER_PASSCHECK_COLUMN_MAPPING = {
    "gameday_jersey": "Trikotnr.",
    "playerlist__team__description": "Spieler Team",
    "playerlist__player__pass_number": "Passnummer",
    "playerlist__player__person__first_name": "Vorname",
    "playerlist__player__person__last_name": "Nachname",
    "playerlist__player__person__year_of_birth": "Geburtsdatum",
    "playerlist__player__person__sex": "Geschlecht",
}


class MachtreportModelWrapper:

    def __init__(self, pk):
        gameinfo = Gameinfo.objects.filter(gameday_id=pk)
        if not gameinfo.exists():
            raise Gameinfo.DoesNotExist
        self.gameday = gameinfo.first().gameday
        self._gameinfo: pd.DataFrame = pd.DataFrame(gameinfo.values(
            # select the fields which should be in the dataframe
            *(
                    [f.name for f in Gameinfo._meta.local_fields]
                    + ["officials__name"]
            )
        )
        )
        if self._gameinfo.empty:
            raise Gameinfo.DoesNotExist

        self.passcheck_player_details_df = self._get_gameday_passcheck_details()

    def get_staff_passcheck_details(self):
        column_mapping = {
            "created_at": "Zeitpunkt",
            "official_name": "Schiedsrichter",
            "user__username": "Account",
            "team__name": "Team",
            "note": "Notiz",
        }

        passchecks = pd.DataFrame(
            PasscheckVerification.objects.filter(gameday_id=self.gameday.pk).values(
                *column_mapping.keys()
            )
        )

        if passchecks.empty:
            return pd.DataFrame([], columns=column_mapping.values())

        passchecks["created_at"] = passchecks.created_at.dt.strftime(
            "%Y-%m-%d %H:%M:%S"
        )
        passchecks["note"] = passchecks.note.apply(lambda x: x.replace("\n", "</br>"))

        return passchecks.rename(columns=column_mapping)

    def get_gameday_passcheck_team_players_dict(self) -> dict:
        output_dict = {}

        for team_name, df in self.passcheck_player_details_df.groupby("playerlist__team__description"):
            output_dict[team_name] = {
                "num_players": len(df),
                "player_table": df.rename(columns=PLAYER_PASSCHECK_COLUMN_MAPPING),
            }

        return output_dict

    def _get_gameday_passcheck_details(self):


        pass_check_players = pd.DataFrame(
            PlayerlistGameday.objects.filter(gameday_id=self.gameday.pk)
            .values(
                *PLAYER_PASSCHECK_COLUMN_MAPPING.keys()
            )
        )
        if pass_check_players.empty:
            # For youth leagues there are no pass checks therefore we can't return anything here.
            return pd.DataFrame([], columns=list(PLAYER_PASSCHECK_COLUMN_MAPPING.keys()))

        sex_mapping_dict = {k: v for (k, v) in Person.SEX_CHOICES}

        pass_check_players.playerlist__player__person__sex = pass_check_players.playerlist__player__person__sex.apply(lambda x: sex_mapping_dict.get(x, "NA"))

        return pass_check_players

    def _get_staff_game_end_notes(self, gameinfo: str):
        return (
            GameSetup.objects.filter(gameinfo=gameinfo)
            .values(
                *[
                    "gameinfo__officials__name",
                    "homeCaptain",
                    "awayCaptain",
                    "note",
                ]
            )
            .first()
        )

    def _get_game_result(self, gameinfo: str):
        game_end_info = pd.DataFrame(
            Gameresult.objects.filter(gameinfo=gameinfo)
            .values(
                *[
                    "gameinfo_id",
                    "fh",
                    "sh",
                    "isHome",
                    "team__description",
                    "gameinfo__status",
                    "gameinfo__officials__name",
                    "gameinfo__field",
                    "gameinfo__scheduled"
                ]
            )
        )

        data = {
            "home": {},
            "away": {}
        }

        for prefix, isHome in [("home", True), ("away", False)]:
            data[prefix]["points_scored"] = game_end_info[game_end_info["isHome"] == isHome][["fh", "sh"]].sum(axis=1).values[0]
            data[prefix]["team_name"] = game_end_info[game_end_info["isHome"] == isHome]["team__description"].values[0]
            data["officials"] = game_end_info[game_end_info["isHome"] == isHome]["gameinfo__officials__name"].values[0]
            data["game_status"] = game_end_info[game_end_info["isHome"] == isHome]["gameinfo__status"].values[0]
            data["field"] = game_end_info[game_end_info["isHome"] == isHome]["gameinfo__field"].values[0]
            data["scheduled"] = game_end_info[game_end_info["isHome"] == isHome]["gameinfo__scheduled"].values[0]
            data["gameinfo_id"] = game_end_info[game_end_info["isHome"] == isHome]["gameinfo_id"].values[0]
        return data

    def _get_game_teamlogs(self, gameinfo: str):
        column_mapping = {
            "team__description": "Team",
            "player": "Trikotnr.",
            "created_time": "Zeipunkt",
            "input": "Strafe",
        }

        teamlogs = pd.DataFrame(
            TeamLog.objects.filter(
                gameinfo=gameinfo,
                isDeleted=False,
                event="Strafe"
            ).values(
                *column_mapping.keys()
            )
        )

        if teamlogs.empty:
            return pd.DataFrame([], columns=list(column_mapping.values()))

        teamlogs.created_time = teamlogs.created_time.apply(lambda x: x.strftime("%H:%M:%S"))

        return teamlogs.rename(columns=column_mapping)

    def _get_game_officials_table(self, gameinfo: str):
        column_mapping = {
            "official__team__description": "Team",
            "name": "Name",
            "position": "Position",
            "latest_license": "Lizenz",
        }

        latest_license = OfficialLicenseHistory.objects.filter(
            official_id=OuterRef("official")
        ).order_by("created_at__year", "license__name") \
            .values('license__name')[:1]

        position_order = {
            "Referee": 0,
            "Down Judge": 1,
            "Field Judge": 2,
            "Side Judge": 3,
            "Scorecard Judge": 4,
        }

        officials_df = pd.DataFrame(
            GameOfficial.objects.filter(
                gameinfo=gameinfo
            ).annotate(
                latest_license=Subquery(latest_license),
            ).values(
                *column_mapping.keys()
            )
        )

        if not officials_df.empty:
            officials_df["order"] = officials_df.position.apply(position_order.get)
            officials_df.sort_values("order", ascending=True, inplace=True)
            officials_df.drop(columns=["order"], inplace=True)

        return officials_df.rename(columns=column_mapping)

    def get_gameday_match_report(self, render_config: dict):
        games = []

        no_flags_text = """<p>In diesem Spiel gab es keine Strafen</p>"""

        for gameinfo in self._gameinfo.id:
            end_notes = self._get_staff_game_end_notes(gameinfo)
            game_result = self._get_game_result(gameinfo)
            game_refs = self._get_game_officials_table(gameinfo)
            game_flags = self._get_game_teamlogs(gameinfo)

            games.append({
                **game_result,
                "end_notes": end_notes,
                "refs": game_refs.to_html(**render_config),
                "flags": game_flags.to_html(**render_config) if not game_flags.empty else no_flags_text,
                "num_flags": len(game_flags)
            })

        return games
