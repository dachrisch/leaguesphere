import pandas as pd

from gamedays.service.gameday_settings import (
    GAMEDAY_DATE,
    GAMEDAY_ID,
    GAMEINFO,
    PA,
    PF,
    SCHEDULED,
    TEAM_ID,
)
from league_table.models import LeagueSeasonConfig

# Generic (mode-agnostic) column names for the per-team "accounted vs. total"
# summary, so callers don't need to branch on which unit (gamedays or games)
# a mode caps.
UNITS_COUNTED = "units_counted"
UNITS_TOTAL = "units_total"


class GameCappingEngine:
    """Caps a per-team-per-game dataframe down to each team's best N gamedays
    or games, per the league's `table_mode`. The default mode is a no-op —
    this is what guarantees the default table is unaffected by this feature.

    Only the returned (capped) dataframe is meant to feed the standings
    aggregation (`TeamStatsEngine`/`LeagueRankingEngine`); tiebreaking must
    keep using the original, uncapped dataframe (see league_table_service.py).
    """

    def __init__(self, table_mode: str, top_n: int | None):
        self.table_mode = table_mode
        self.top_n = top_n

    def cap(self, games_df: pd.DataFrame) -> tuple[pd.DataFrame, pd.DataFrame | None]:
        if self.table_mode == LeagueSeasonConfig.TABLE_MODE_DEFAULT or games_df.empty:
            return games_df, None

        # Teams without any (finished) game are represented by a synthetic
        # placeholder row with no gameinfo/gameday linkage (see
        # `LeagueTableService._init_df_with_default_values`). They have
        # nothing to cap and must always be kept as-is.
        played_mask = games_df[GAMEINFO].notna()
        no_games_df = games_df[~played_mask]
        played_df = games_df[played_mask]

        if played_df.empty:
            return games_df, None

        if self.table_mode == LeagueSeasonConfig.TABLE_MODE_TOP_N_GAMEDAYS:
            capped_played, summary = self._cap_by_gameday(played_df)
        elif self.table_mode == LeagueSeasonConfig.TABLE_MODE_TOP_N_GAMES:
            capped_played, summary = self._cap_by_game(played_df)
        else:
            raise ValueError(f"Unknown table_mode: {self.table_mode}")

        capped = pd.concat([capped_played, no_games_df], ignore_index=True)
        summary = self._with_zero_rows_for(summary, no_games_df)
        return capped, summary

    def _cap_by_gameday(self, played_df: pd.DataFrame):
        wins = (played_df[PF].fillna(0) > played_df[PA].fillna(0)).astype(int)
        per_gameday = (
            played_df.assign(_wins=wins)
            .groupby([TEAM_ID, GAMEDAY_ID], as_index=False)
            .agg(
                _wins=("_wins", "sum"),
                **{
                    PF: (PF, "sum"),
                    PA: (PA, "sum"),
                    GAMEDAY_DATE: (GAMEDAY_DATE, "first"),
                },
            )
        )
        per_gameday = per_gameday.sort_values(
            by=["_wins", PF, PA, GAMEDAY_DATE],
            ascending=[False, False, True, True],
        )
        kept = per_gameday.groupby(TEAM_ID, group_keys=False).head(self.top_n)

        capped = played_df.merge(
            kept[[TEAM_ID, GAMEDAY_ID]], on=[TEAM_ID, GAMEDAY_ID], how="inner"
        )
        summary = self._summary(
            total_keys=per_gameday, counted_keys=kept, key_column=GAMEDAY_ID
        )
        return capped, summary

    def _cap_by_game(self, played_df: pd.DataFrame):
        sorted_games = played_df.sort_values(
            by=[PF, PA, GAMEDAY_DATE, SCHEDULED],
            ascending=[False, True, True, True],
        )
        kept = sorted_games.groupby(TEAM_ID, group_keys=False).head(self.top_n)

        capped = played_df.merge(
            kept[[TEAM_ID, GAMEINFO]], on=[TEAM_ID, GAMEINFO], how="inner"
        )
        summary = self._summary(
            total_keys=played_df, counted_keys=kept, key_column=GAMEINFO
        )
        return capped, summary

    @staticmethod
    def _summary(
        *, total_keys: pd.DataFrame, counted_keys: pd.DataFrame, key_column: str
    ):
        total = total_keys.groupby(TEAM_ID)[key_column].nunique().rename(UNITS_TOTAL)
        counted = (
            counted_keys.groupby(TEAM_ID)[key_column].nunique().rename(UNITS_COUNTED)
        )
        summary = pd.concat([counted, total], axis=1).reset_index()
        summary[UNITS_COUNTED] = summary[UNITS_COUNTED].fillna(0).astype(int)
        summary[UNITS_TOTAL] = summary[UNITS_TOTAL].fillna(0).astype(int)
        return summary

    @staticmethod
    def _with_zero_rows_for(
        summary: pd.DataFrame, no_games_df: pd.DataFrame
    ) -> pd.DataFrame:
        if no_games_df.empty:
            return summary
        zero_rows = pd.DataFrame(
            {
                TEAM_ID: no_games_df[TEAM_ID],
                UNITS_COUNTED: 0,
                UNITS_TOTAL: 0,
            }
        )
        return pd.concat([summary, zero_rows], ignore_index=True).drop_duplicates(
            subset=[TEAM_ID]
        )
