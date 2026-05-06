from gamedays.models import Gameinfo, GameSetup
from gamedays.service.gameday_service import EMPTY_DATA
from matchreport.service.model_wrapper import MachtreportModelWrapper

class EmptyPasscheckDetailsTable:
    def to_html(self, *args, **kwargs):
        return "Empty Gameday Passcheck Details Table"

    def to_json(self, *args, **kwargs):
        return EMPTY_DATA


class EmptyMatchReportService:
    def get_staff_passcheck_details(self):
        return EmptyPasscheckDetailsTable()


class MatchreportService:
    @classmethod
    def create(cls, gameday_pk):
        try:
            return cls(gameday_pk)
        except Gameinfo.DoesNotExist:
            return EmptyMatchReportService()

    def __init__(self, pk):
        self.mmw = MachtreportModelWrapper(pk)
        self.gameday_pk = pk

    def get_passcheck_player_details(self, render_config):
        data = self.mmw.get_gameday_passcheck_team_players_dict()

        for key in data.keys():
            data[key]["player_table"] = data[key]["player_table"].to_html(**render_config)

        return data

    def get_staff_passcheck_details(self):
        return self.mmw.get_staff_passcheck_details()

    def get_gameday_match_reports(self, render_config):
        return self.mmw.get_gameday_match_report(render_config=render_config)

    def get_staff_game_end_notes(self, gameinfo: str):
        return self.mmw.get_staff_game_end_notes(gameinfo)

