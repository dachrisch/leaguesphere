import pandas as pd

from gamedays.models import Gameinfo
from gamedays.service.gameday_settings import (
    GAMEINFO_ID,
    ID_HOME,
    ID_AWAY,
    HOME,
    AWAY,
    POINTS_HOME,
    POINTS_AWAY,
    SCHEDULED,
    FIELD,
    STATUS,
    TEAM_DESCRIPTION,
    IS_HOME,
    FH,
    SH,
    PF,
)

TOURNAMENT_COLUMN_HEADERS = {
    SCHEDULED: "Zeit",
    FIELD: "Feld",
    HOME: "Heim",
    AWAY: "Gast",
    POINTS_HOME: "Pkt",
    POINTS_AWAY: "Pkt",
    STATUS: "Status",
}


class TournamentColumnService:
    @staticmethod
    def get_games_dataframe(gameinfos: list[Gameinfo]) -> pd.DataFrame:
        output_columns = [
            SCHEDULED,
            HOME,
            POINTS_HOME,
            POINTS_AWAY,
            AWAY,
            STATUS,
        ]
        if not gameinfos:
            return pd.DataFrame(columns=list(TOURNAMENT_COLUMN_HEADERS.values()))

        rows = []
        for gi in gameinfos:
            home_result = next((r for r in gi.gameresult_set.all() if r.isHome), None)
            away_result = next(
                (r for r in gi.gameresult_set.all() if not r.isHome), None
            )

            home_points = ''
            if (
                home_result
                and home_result.fh is not None
                and home_result.sh is not None
            ):
                home_points = str(home_result.fh + home_result.sh)

            away_points = ''
            if (
                away_result
                and away_result.fh is not None
                and away_result.sh is not None
            ):
                away_points = str(away_result.fh + away_result.sh)

            rows.append(
                {
                    SCHEDULED: gi.scheduled,
                    FIELD: gi.field,
                    HOME: (
                        home_result.team.description
                        if home_result and home_result.team
                        else ""
                    ),
                    AWAY: (
                        away_result.team.description
                        if away_result and away_result.team
                        else ""
                    ),
                    POINTS_HOME: home_points,
                    POINTS_AWAY: away_points,
                    STATUS: gi.status,
                }
            )

        df = pd.DataFrame(rows, columns=output_columns)
        if not df.empty:
            df[SCHEDULED] = df[SCHEDULED].apply(
                lambda t: (
                    t.strftime("%H:%M")
                    if hasattr(t, "strftime")
                    else (str(t) if t else "")
                )
            )
        return df.rename(columns=TOURNAMENT_COLUMN_HEADERS)


class TournamentService:
    RENDER_CONFIGS = {
        "index": False,
        "classes": [
            "table",
            "table-hover",
            "table-condensed",
            "table-responsive",
            "text-center",
        ],
        "border": 0,
        "justify": "left",
        "escape": False,
    }

    @staticmethod
    def build_context(tournament) -> dict:
        rows_context = []
        for row in tournament.rows.all():
            columns_context = []
            for column in row.columns.all():
                gameinfos = [cg.gameinfo for cg in column.column_games.all()]
                df = TournamentColumnService.get_games_dataframe(gameinfos)

                table_html = None
                if not df.empty:
                    table_html = df.to_html(**TournamentService.RENDER_CONFIGS)

                # Compute Bootstrap column width class based on number of columns in row
                num_columns = row.columns.count()
                if num_columns == 1:
                    col_class = "col-md-12"
                elif num_columns == 2:
                    col_class = "col-md-6"
                else:  # 3 or more
                    col_class = "col-md-4"

                columns_context.append(
                    {
                        "title": column.title,
                        "table_html": table_html,
                        "col_class": col_class,
                    }
                )
            rows_context.append({"title": row.title, "columns": columns_context})

        return {"rows": rows_context}
