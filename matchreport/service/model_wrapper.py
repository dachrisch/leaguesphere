import pandas as pd
from django.db.models import OuterRef, Subquery

from gamedays.models import (
    Gameinfo,
    GameSetup,
    Person,
    Gameresult,
    GameOfficial,
    TeamLog,
)
from officials.models import OfficialLicenseHistory
from officials.service.license_validity import validity_lower_bound
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
        gameinfo_qs = Gameinfo.objects.filter(gameday_id=pk)
        gameinfo_data = gameinfo_qs.values(
            # select the fields which should be in the dataframe
            *(
                [f.name for f in Gameinfo._meta.local_fields]
                + ["officials__name", "gameday__date"]
            )
        )
        self._gameinfo: pd.DataFrame = pd.DataFrame(gameinfo_data)
        if self._gameinfo.empty:
            raise Gameinfo.DoesNotExist

        self.gameday_pk = self._gameinfo.iloc[0]["gameday"]
        self.gameday_date = pd.Timestamp(self._gameinfo.iloc[0]["gameday__date"]).date()
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
            PasscheckVerification.objects.filter(gameday_id=self.gameday_pk).values(
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

        for team_name, df in self.passcheck_player_details_df.groupby(
            "playerlist__team__description"
        ):
            output_dict[team_name] = {
                "num_players": len(df),
                "player_table": df.rename(columns=PLAYER_PASSCHECK_COLUMN_MAPPING),
            }

        return output_dict

    def _get_gameday_passcheck_details(self):

        pass_check_players = pd.DataFrame(
            PlayerlistGameday.objects.filter(gameday_id=self.gameday_pk).values(
                *PLAYER_PASSCHECK_COLUMN_MAPPING.keys()
            )
        )
        if pass_check_players.empty:
            # For youth leagues there are no pass checks therefore we can't return anything here.
            return pd.DataFrame(
                [], columns=list(PLAYER_PASSCHECK_COLUMN_MAPPING.keys())
            )

        sex_mapping_dict = {k: v for (k, v) in Person.SEX_CHOICES}

        pass_check_players.playerlist__player__person__sex = (
            pass_check_players.playerlist__player__person__sex.apply(
                lambda x: sex_mapping_dict.get(x, "NA")
            )
        )

        return pass_check_players

    def get_gameday_passcheck_player_list(self) -> pd.DataFrame:
        return self.passcheck_player_details_df.rename(
            columns=PLAYER_PASSCHECK_COLUMN_MAPPING
        ).sort_values(["Spieler Team", "Trikotnr."])

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
            Gameresult.objects.filter(gameinfo=gameinfo).values(
                *[
                    "gameinfo_id",
                    "fh",
                    "sh",
                    "isHome",
                    "team__description",
                    "gameinfo__status",
                    "gameinfo__officials__name",
                    "gameinfo__field",
                    "gameinfo__scheduled",
                ]
            )
        )

        data = {"home": {}, "away": {}}

        for prefix, isHome in [("home", True), ("away", False)]:
            data[prefix]["points_scored"] = (
                game_end_info[game_end_info["isHome"] == isHome][["fh", "sh"]]
                .sum(axis=1)
                .values[0]
            )
            data[prefix]["team_name"] = game_end_info[
                game_end_info["isHome"] == isHome
            ]["team__description"].values[0]
            data["officials"] = game_end_info[game_end_info["isHome"] == isHome][
                "gameinfo__officials__name"
            ].values[0]
            data["game_status"] = game_end_info[game_end_info["isHome"] == isHome][
                "gameinfo__status"
            ].values[0]
            data["field"] = game_end_info[game_end_info["isHome"] == isHome][
                "gameinfo__field"
            ].values[0]
            data["scheduled"] = game_end_info[game_end_info["isHome"] == isHome][
                "gameinfo__scheduled"
            ].values[0]
            data["gameinfo_id"] = game_end_info[game_end_info["isHome"] == isHome][
                "gameinfo_id"
            ].values[0]
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
                gameinfo=gameinfo, isDeleted=False, event="Strafe"
            ).values(*column_mapping.keys())
        )

        if teamlogs.empty:
            return pd.DataFrame([], columns=list(column_mapping.values()))

        teamlogs.created_time = teamlogs.created_time.apply(
            lambda x: x.strftime("%H:%M:%S")
        )

        return teamlogs.rename(columns=column_mapping)

    def _get_game_officials_table(self, gameinfo: str):
        column_mapping = {
            "official__team__description": "Team",
            "name": "Name",
            "position": "Position",
            "latest_license": "Lizenz",
            "license_number_cell": "Lizenznummer",
        }
        # Not part of column_mapping directly - fetched alongside it but
        # consumed by _license_number_cell() to build the "Lizenznummer"
        # column, not rendered as columns of their own.
        extra_fields = ["official_id", "official__external_id"]

        # Correlated subquery so every official's license is resolved in the
        # same query as the officials table, instead of one query per
        # official (N+1). A license is valid on the gameday if the gameday
        # falls within the license validity period: training date (created_at)
        # through the same month/day one year later, as defined by
        # OfficialLicenseHistory.valid_until() - validity_lower_bound()
        # mirrors that exact calendar-year rule (shared with
        # officials/service/officials_compliance_service.py, rather than
        # each independently approximating it with a flat 365-day window,
        # which is one day off across any Feb 29 the window crosses). When
        # more than one license is valid at once, the highest-ranked one
        # wins (F1 over F2 over F3...) - never whichever was issued more
        # recently, so no date field is passed to order_by_rank() here.
        latest_license = (
            OfficialLicenseHistory.objects.filter(
                official_id=OuterRef("official"),
                created_at__lte=self.gameday_date,
                created_at__gt=validity_lower_bound(self.gameday_date),
            )
            .order_by_rank()
            .values("license__name")[:1]
        )

        position_order = {
            "Referee": 0,
            "Down Judge": 1,
            "Field Judge": 2,
            "Side Judge": 3,
            "Scorecard Judge": 4,
        }

        # Raw DB fields to select - column_mapping's "license_number_cell"
        # key is a computed column built below, not a real field, so it is
        # deliberately left out of this values() call.
        db_fields = [
            "official__team__description",
            "name",
            "position",
            "latest_license",
        ]

        officials_df = pd.DataFrame(
            GameOfficial.objects.filter(gameinfo=gameinfo)
            .annotate(
                latest_license=Subquery(latest_license),
            )
            .values(*db_fields, *extra_fields)
        )

        if not officials_df.empty:
            officials_df["order"] = officials_df.position.apply(position_order.get)
            officials_df.sort_values("order", ascending=True, inplace=True)
            officials_df.drop(columns=["order"], inplace=True)
            officials_df["license_number_cell"] = officials_df.apply(
                lambda row: self._license_number_cell(
                    row["official_id"],
                    row["official__external_id"],
                ),
                axis=1,
            )
            officials_df.drop(columns=extra_fields, inplace=True)

        return officials_df.rename(columns=column_mapping)

    @staticmethod
    def _license_number_cell(official_id, external_id):
        # The official's license number (Official.external_id - the
        # Moodle-issued id DFFL uses as the license number, already
        # hyperlinked to the Moodle profile elsewhere in
        # officials/templates/officials/license_check.html), hyperlinked
        # here to the official's profile page in this app instead, via the
        # shared officials.service.official_profile helper (also used by
        # officials/service/moodle/moodle_service.py::_get_ahref_for_profile
        # so the two links can't drift apart). Shown independently of
        # whether the official currently holds a valid F1-F4 license
        # (that's the separate "Lizenz" column) so staff can always click
        # through to an assigned official's profile.
        if pd.isna(official_id) or external_id is None or pd.isna(external_id):
            return None

        # GameOfficial.official is nullable, so a column mixing real ids
        # with missing values gets upcast by pandas to float64 (121 ->
        # 121.0) - cast back to int before reverse(), whose int converter
        # regex ([0-9]+) rejects the "121.0" string a float would produce.
        official_id = int(official_id)

        # Local import avoids a hard officials<->matchreport import-order
        # dependency at module load time.
        from django.utils.html import escape

        from officials.service.official_profile import official_profile_url

        profile_url = official_profile_url(official_id)
        # external_id is a free-text CharField (officials/models.py) with no
        # format validation, and this whole table is rendered with
        # escape=False (`.to_html()`) and output via the `safe` template
        # filter - escape it explicitly so it can never inject markup into
        # the rendered report.
        return (
            f'<a href="{profile_url}" target="_blank" title="Zum Profil des Offiziellen">'
            f"#{escape(external_id)}</a>"
        )

    def get_gameday_match_report(self, render_config: dict):
        games = []

        no_flags_text = """<p>In diesem Spiel gab es keine Strafen</p>"""

        for gameinfo in self._gameinfo.id:
            end_notes = self._get_staff_game_end_notes(gameinfo)
            game_result = self._get_game_result(gameinfo)
            game_refs = self._get_game_officials_table(gameinfo)
            game_flags = self._get_game_teamlogs(gameinfo)

            games.append(
                {
                    **game_result,
                    "end_notes": end_notes,
                    "refs": game_refs.to_html(**render_config),
                    "flags": (
                        game_flags.to_html(**render_config)
                        if not game_flags.empty
                        else no_flags_text
                    ),
                    "num_flags": len(game_flags),
                }
            )

        return games
