import logging
import numpy as np
import pandas as pd
from pandas import DataFrame

from gamedays.models import Gameinfo, Gameresult, TeamLog
from gamedays.service.gameday_settings import STANDING, TEAM_NAME, POINTS, POINTS_HOME, POINTS_AWAY, PA, PF, GROUP1, \
    GAMEINFO_ID, DIFF, SCHEDULED, FIELD, OFFICIALS_NAME, STAGE, HOME, AWAY, ID_AWAY, ID_HOME, ID_Y, QUALIIFY_ROUND, \
    STATUS, SH, FH, FINISHED, GAME_FINISHED, DFFL, IN_POSSESSION, IS_HOME


class DfflPoints(object):

    @classmethod
    def for_number_teams(cls, number_of_teams):
        dffl_points = [0] * number_of_teams
        if number_of_teams == 3:
            dffl_points = [6, 4, 2]
        if number_of_teams == 4:
            dffl_points = [8, 6, 4, 2]
        if number_of_teams == 5:
            dffl_points = [10, 8, 6, 4, 2]
        if number_of_teams == 6:
            dffl_points = [11, 9, 7, 5, 3, 2]
        if number_of_teams == 7:
            dffl_points = [12, 10, 8, 6, 4, 3, 2]
        if number_of_teams == 8:
            dffl_points = [13, 11, 9, 7, 5, 4, 3, 2]
        if number_of_teams == 9:
            dffl_points = [14, 12, 10, 8, 6, 5, 4, 3, 2]
        return dffl_points


class GamedayModelWrapper:

    def __init__(self, pk, additional_columns=[]):
        self._gameinfo: DataFrame = pd.DataFrame(Gameinfo.objects.filter(gameday_id=pk).values(
            # select the fields which should be in the dataframe
            *([f.name for f in Gameinfo._meta.local_fields] + ['officials__name'] + additional_columns)))
        if self._gameinfo.empty:
            raise Gameinfo.DoesNotExist

        gameresult = pd.DataFrame(
            Gameresult.objects.filter(gameinfo_id__in=self._gameinfo['id']).order_by('-' + IS_HOME).values(
                *([f.name for f in Gameresult._meta.local_fields] + [TEAM_NAME])))
        games_with_result = pd.merge(self._gameinfo, gameresult, left_on='id', right_on=GAMEINFO_ID)
        games_with_result[IN_POSSESSION] = games_with_result[IN_POSSESSION].astype(str)
        games_with_result = games_with_result.convert_dtypes()
        games_with_result = games_with_result.astype({FH: 'Int64', SH: 'Int64', PA: 'Int64'})
        games_with_result[PF] = games_with_result[FH] + games_with_result[SH]
        games_with_result[DIFF] = games_with_result[PF] - games_with_result[PA]
        tmp = games_with_result.fillna({PF: 0, PA: 0, FH: 0, SH: 0})
        tmp[POINTS] = np.where(
            tmp[STATUS] == FINISHED,
            np.where(tmp[PF] == tmp[PA], 1, np.where(tmp[PF] > tmp[PA], 2, 0)),
            0,
        )
        games_with_result[POINTS] = tmp[POINTS]
        self._games_with_result: DataFrame = games_with_result

    def _resolve_schedule_placeholders(self, schedule_df):
        """
        Resolve null HOME/AWAY team names in schedule DataFrame.
        Uses two-tier strategy:
        1. Designer data resolution (dynamic, based on game results) - NEW system
        2. Template slot resolution (static references) - OLD system
        3. "TBD" fallback
        """
        if schedule_df.empty:
            return schedule_df

        # Check if we have any null team names to resolve
        has_null_home = schedule_df[HOME].isna().any()
        has_null_away = schedule_df[AWAY].isna().any()

        if not has_null_home and not has_null_away:
            return schedule_df

        # Try designer-based resolution first (for gamedays with designer_data)
        gameday_id = self._gameinfo['gameday'].iloc[0]
        from gamedays.models import Gameday
        gameday = Gameday.objects.filter(pk=gameday_id).first()

        designer_resolved = {}  # Map: gameinfo_id -> {'home': name, 'away': name}

        if gameday and gameday.designer_data:
            designer_resolved = self._resolve_from_designer_data(gameday)

        # Apply resolutions to DataFrame
        for idx, row in schedule_df.iterrows():
            gameinfo_id = row['id']

            # Resolve HOME team
            if pd.isna(row[HOME]):
                if gameinfo_id in designer_resolved and designer_resolved[gameinfo_id].get('home'):
                    schedule_df.at[idx, HOME] = designer_resolved[gameinfo_id]['home']
                else:
                    # Fallback to template slot resolution
                    from gamedays.service.schedule_resolution_service import GamedayScheduleResolutionService
                    placeholder = GamedayScheduleResolutionService.get_game_placeholder(gameinfo_id, is_home=True)
                    schedule_df.at[idx, HOME] = placeholder

            # Resolve AWAY team
            if pd.isna(row[AWAY]):
                if gameinfo_id in designer_resolved and designer_resolved[gameinfo_id].get('away'):
                    schedule_df.at[idx, AWAY] = designer_resolved[gameinfo_id]['away']
                else:
                    # Fallback to template slot resolution
                    from gamedays.service.schedule_resolution_service import GamedayScheduleResolutionService
                    placeholder = GamedayScheduleResolutionService.get_game_placeholder(gameinfo_id, is_home=False)
                    schedule_df.at[idx, AWAY] = placeholder

        return schedule_df

    def _resolve_from_designer_data(self, gameday):
        """
        Resolve team names from designer_data dynamic references.
        Extracts from gameday.designer_data and resolves winner/loser references.

        For completed games: Returns actual team name (e.g., "Team 1")
        For incomplete games: Returns formatted reference (e.g., "Winner of A Game 1")

        Returns: dict mapping gameinfo_id -> {'home': team_name, 'away': team_name}
        """
        resolved = {}

        try:
            data = gameday.designer_data or {}
            nodes = data.get("nodes", [])

            # Build map of standing -> gameinfo_id for quick lookup
            standing_to_gameinfo = {}
            for _, gi_row in self._gameinfo.iterrows():
                standing_to_gameinfo[gi_row['standing']] = gi_row['id']

            # Resolve each game node with dynamic references
            for node in nodes:
                if node.get("type") != "game":
                    continue

                node_data = node.get("data", {})
                standing = node_data.get("standing")

                if not standing or standing not in standing_to_gameinfo:
                    continue

                gameinfo_id = standing_to_gameinfo[standing]
                resolved[gameinfo_id] = {}

                # Resolve home team (static or dynamic)
                home_team_id = node_data.get("homeTeamId")
                home_ref = node_data.get("homeTeamDynamic")

                if home_team_id:
                    # Static team assignment (already resolved)
                    pass
                elif home_ref:
                    # Dynamic reference (winner/loser of another game)
                    home_team = self._resolve_team_reference(home_ref, gameday)
                    if home_team:
                        # Game is completed - use actual team name
                        resolved[gameinfo_id]['home'] = home_team
                    else:
                        # Game not completed - format the reference for display
                        resolved[gameinfo_id]['home'] = self._format_team_reference(home_ref)

                # Resolve away team (static or dynamic)
                away_team_id = node_data.get("awayTeamId")
                away_ref = node_data.get("awayTeamDynamic")

                if away_team_id:
                    # Static team assignment (already resolved)
                    pass
                elif away_ref:
                    # Dynamic reference (winner/loser of another game)
                    away_team = self._resolve_team_reference(away_ref, gameday)
                    if away_team:
                        # Game is completed - use actual team name
                        resolved[gameinfo_id]['away'] = away_team
                    else:
                        # Game not completed - format the reference for display
                        resolved[gameinfo_id]['away'] = self._format_team_reference(away_ref)

            return resolved
        except Exception as e:
            # Log error but don't crash - graceful degradation
            logger = logging.getLogger(__name__)
            logger.warning(f"Error resolving designer data: {str(e)}")
            return {}

    def _format_team_reference(self, ref):
        """
        Format a dynamic team reference for display when the game is not yet completed.

        Args:
            ref: dict with 'matchName' and 'type' ('winner' or 'loser')

        Returns: formatted string like "Winner of A Game 1" or "Loser of B Game 2"
        """
        if not ref or not isinstance(ref, dict):
            return "TBD"

        match_name = ref.get("matchName", "")
        ref_type = ref.get("type", "")

        if not match_name or not ref_type:
            return "TBD"

        if ref_type == "winner":
            return f"Winner of {match_name}"
        elif ref_type == "loser":
            return f"Loser of {match_name}"
        else:
            return "TBD"

    def _resolve_team_reference(self, ref, gameday):
        """
        Resolve a dynamic team reference (winner/loser) to actual team name.

        Args:
            ref: dict with 'matchName' and 'type' ('winner' or 'loser')
            gameday: Gameday instance

        Returns: team name string or None if unresolved
        """
        try:
            if not ref or not isinstance(ref, dict):
                return None

            target_match = ref.get("matchName")  # e.g., "A Game 1"
            ref_type = ref.get("type")  # 'winner' or 'loser'

            if not target_match or not ref_type:
                return None

            # Find the target game by standing
            target_game = Gameinfo.objects.filter(
                gameday=gameday,
                standing=target_match
            ).first()

            # Can only resolve if game is completed
            if not target_game or target_game.status != Gameinfo.STATUS_COMPLETED:
                return None

            # Get both teams' results
            home_res = Gameresult.objects.filter(gameinfo=target_game, isHome=True).first()
            away_res = Gameresult.objects.filter(gameinfo=target_game, isHome=False).first()

            if not home_res or not away_res:
                return None

            # Calculate scores
            home_score = (home_res.fh or 0) + (home_res.sh or 0)
            away_score = (away_res.fh or 0) + (away_res.sh or 0)

            # Handle tie
            if home_score == away_score:
                return "Tie"

            # Determine winner/loser
            winner = home_res if home_score > away_score else away_res
            loser = away_res if home_score > away_score else home_res

            resolved_team = winner if ref_type == "winner" else loser

            # Return team name (or None if team is also a placeholder)
            if not resolved_team or not resolved_team.team:
                return None

            return resolved_team.team.name
        except Exception as e:
            logger = logging.getLogger(__name__)
            logger.warning(f"Error resolving team reference {ref}: {str(e)}")
            return None

    def _resolve_schedule_placeholders(self, schedule_df):
        """
        Resolve null HOME/AWAY team names in schedule DataFrame.
        Uses two-tier strategy:
        1. Designer data resolution (dynamic, based on game results) - NEW system
        2. Template slot resolution (static references) - OLD system
        3. "TBD" fallback
        """
        if schedule_df.empty:
            return schedule_df

        # Check if we have any null team names to resolve
        has_null_home = schedule_df[HOME].isna().any()
        has_null_away = schedule_df[AWAY].isna().any()

        if not has_null_home and not has_null_away:
            return schedule_df

        # Try designer-based resolution first (for gamedays with designer_data)
        gameday_id = self._gameinfo['gameday'].iloc[0]
        from gamedays.models import Gameday
        gameday = Gameday.objects.filter(pk=gameday_id).first()

        designer_resolved = {}  # Map: gameinfo_id -> {'home': name, 'away': name}

        if gameday and gameday.designer_data:
            designer_resolved = self._resolve_from_designer_data(gameday)

        # Apply resolutions to DataFrame
        for idx, row in schedule_df.iterrows():
            gameinfo_id = row['id']

            # Resolve HOME team
            if pd.isna(row[HOME]):
                if gameinfo_id in designer_resolved and designer_resolved[gameinfo_id].get('home'):
                    schedule_df.at[idx, HOME] = designer_resolved[gameinfo_id]['home']
                else:
                    # Fallback to template slot resolution
                    from gamedays.service.schedule_resolution_service import GamedayScheduleResolutionService
                    placeholder = GamedayScheduleResolutionService.get_game_placeholder(gameinfo_id, is_home=True)
                    schedule_df.at[idx, HOME] = placeholder

            # Resolve AWAY team
            if pd.isna(row[AWAY]):
                if gameinfo_id in designer_resolved and designer_resolved[gameinfo_id].get('away'):
                    schedule_df.at[idx, AWAY] = designer_resolved[gameinfo_id]['away']
                else:
                    # Fallback to template slot resolution
                    from gamedays.service.schedule_resolution_service import GamedayScheduleResolutionService
                    placeholder = GamedayScheduleResolutionService.get_game_placeholder(gameinfo_id, is_home=False)
                    schedule_df.at[idx, AWAY] = placeholder

        return schedule_df

    def _resolve_from_designer_data(self, gameday):
        """
        Resolve team names from designer_data dynamic references.
        Extracts from gameday.designer_data and resolves winner/loser references.

        For completed games: Returns actual team name (e.g., "Team 1")
        For incomplete games: Returns formatted reference (e.g., "Winner of A Game 1")

        Returns: dict mapping gameinfo_id -> {'home': team_name, 'away': team_name}
        """
        resolved = {}

        try:
            data = gameday.designer_data or {}
            nodes = data.get("nodes", [])

            # Build map of standing -> gameinfo_id for quick lookup
            standing_to_gameinfo = {}
            for _, gi_row in self._gameinfo.iterrows():
                standing_to_gameinfo[gi_row['standing']] = gi_row['id']

            # Resolve each game node with dynamic references
            for node in nodes:
                if node.get("type") != "game":
                    continue

                node_data = node.get("data", {})
                standing = node_data.get("standing")

                if not standing or standing not in standing_to_gameinfo:
                    continue

                gameinfo_id = standing_to_gameinfo[standing]
                resolved[gameinfo_id] = {}

                # Resolve home team (static or dynamic)
                home_team_id = node_data.get("homeTeamId")
                home_ref = node_data.get("homeTeamDynamic")

                if home_team_id:
                    # Static team assignment (already resolved)
                    pass
                elif home_ref:
                    # Dynamic reference (winner/loser of another game)
                    home_team = self._resolve_team_reference(home_ref, gameday)
                    if home_team:
                        # Game is completed - use actual team name
                        resolved[gameinfo_id]['home'] = home_team
                    else:
                        # Game not completed - format the reference for display
                        resolved[gameinfo_id]['home'] = self._format_team_reference(home_ref)

                # Resolve away team (static or dynamic)
                away_team_id = node_data.get("awayTeamId")
                away_ref = node_data.get("awayTeamDynamic")

                if away_team_id:
                    # Static team assignment (already resolved)
                    pass
                elif away_ref:
                    # Dynamic reference (winner/loser of another game)
                    away_team = self._resolve_team_reference(away_ref, gameday)
                    if away_team:
                        # Game is completed - use actual team name
                        resolved[gameinfo_id]['away'] = away_team
                    else:
                        # Game not completed - format the reference for display
                        resolved[gameinfo_id]['away'] = self._format_team_reference(away_ref)

            return resolved
        except Exception as e:
            # Log error but don't crash - graceful degradation
            logger = logging.getLogger(__name__)
            logger.warning(f"Error resolving designer data: {str(e)}")
            return {}

    def _format_team_reference(self, ref):
        """
        Format a dynamic team reference for display when the game is not yet completed.

        Args:
            ref: dict with 'matchName' and 'type' ('winner' or 'loser')

        Returns: formatted string like "Winner of A Game 1" or "Loser of B Game 2"
        """
        if not ref or not isinstance(ref, dict):
            return "TBD"

        match_name = ref.get("matchName", "")
        ref_type = ref.get("type", "")

        if not match_name or not ref_type:
            return "TBD"

        if ref_type == "winner":
            return f"Winner of {match_name}"
        elif ref_type == "loser":
            return f"Loser of {match_name}"
        else:
            return "TBD"

    def _resolve_team_reference(self, ref, gameday):
        """
        Resolve a dynamic team reference (winner/loser) to actual team name.

        Args:
            ref: dict with 'matchName' and 'type' ('winner' or 'loser')
            gameday: Gameday instance

        Returns: team name string or None if unresolved
        """
        try:
            if not ref or not isinstance(ref, dict):
                return None

            target_match = ref.get("matchName")  # e.g., "A Game 1"
            ref_type = ref.get("type")  # 'winner' or 'loser'

            if not target_match or not ref_type:
                return None

            # Find the target game by standing
            target_game = Gameinfo.objects.filter(
                gameday=gameday,
                standing=target_match
            ).first()

            # Can only resolve if game is completed
            if not target_game or target_game.status != Gameinfo.STATUS_COMPLETED:
                return None

            # Get both teams' results
            home_res = Gameresult.objects.filter(gameinfo=target_game, isHome=True).first()
            away_res = Gameresult.objects.filter(gameinfo=target_game, isHome=False).first()

            if not home_res or not away_res:
                return None

            # Calculate scores
            home_score = (home_res.fh or 0) + (home_res.sh or 0)
            away_score = (away_res.fh or 0) + (away_res.sh or 0)

            # Handle tie
            if home_score == away_score:
                return "Tie"

            # Determine winner/loser
            winner = home_res if home_score > away_score else away_res
            loser = away_res if home_score > away_score else home_res

            resolved_team = winner if ref_type == "winner" else loser

            # Return team name (or None if team is also a placeholder)
            if not resolved_team or not resolved_team.team:
                return None

            return resolved_team.team.name
        except Exception as e:
            logger = logging.getLogger(__name__)
            logger.warning(f"Error resolving team reference {ref}: {str(e)}")
            return None

    def has_finalround(self):
        return QUALIIFY_ROUND in self._gameinfo[STAGE].values

    def get_schedule(self):
        schedule = self._get_schedule()
        schedule = schedule.sort_values(by=[SCHEDULED, FIELD])
        return schedule

    def get_qualify_table(self):
        if not self.has_finalround():
            return ''
        qualify_round = self._get_table()
        return qualify_round

    def get_final_table(self):
        if self._gameinfo[self._gameinfo[STATUS] != FINISHED].empty is False:
            return pd.DataFrame()
        final_table = self._games_with_result.groupby([TEAM_NAME], as_index=False)
        final_table = final_table.agg({POINTS: 'sum', PF: 'sum', PA: 'sum', DIFF: 'sum'})
        final_table = final_table.sort_values(by=[POINTS, DIFF, PF, PA], ascending=False)

        if self.has_finalround():
            if self._games_with_result.nunique()[TEAM_NAME] == 7:
                standing = ['P1', 'P3']
                qualify_table = self._get_table()
                schedule = self._get_schedule()
                group1 = qualify_table[qualify_table[STANDING] == GROUP1]
                third = group1.iloc[2][TEAM_NAME]
                fourth = group1.iloc[3][TEAM_NAME]
                third_vs_fourth_group1 = schedule[
                    (schedule[HOME] == third) & (schedule[AWAY] == fourth)]
                if third_vs_fourth_group1.empty is True:
                    third_vs_fourth_group1 = schedule[
                        (schedule[AWAY] == third) & (schedule[HOME] == fourth)]
                p5 = schedule[(schedule[STANDING] == 'P5-1') | (schedule[STANDING] == 'P5-2')]
                games_for_fith_place = pd.concat([third_vs_fourth_group1, p5])
                table_fith_place = self._games_with_result[
                    self._games_with_result[GAMEINFO_ID].isin(games_for_fith_place[GAMEINFO_ID].values)]
                table_fith_place = table_fith_place.groupby([TEAM_NAME], as_index=False)
                table_fith_place = table_fith_place.agg({PF: 'sum', POINTS: 'sum', PA: 'sum', DIFF: 'sum'})
                table_fith_place = table_fith_place.sort_values(by=[POINTS, DIFF, PF, PA], ascending=False)
                final_standing = self._get_standing_list(standing) + table_fith_place[TEAM_NAME].to_list()
            elif self._games_with_result.nunique()[TEAM_NAME] == 11:
                standing = ['P1', 'P3', 'P5']
                p7 = self.get_team_aggregate_by(aggregate_standings=['P7'], aggregate_place=1, place=1)
                p8 = self.get_team_aggregate_by(aggregate_standings=['P7'], aggregate_place=2, place=1)
                p9 = self.get_team_aggregate_by(aggregate_standings=['P7'], aggregate_place=3, place=1)
                final_standing = self._get_standing_list(standing) + [p7, p8, p9] + self._get_standing_list(['P10'])
            else:
                standing = ['P1', 'P3', 'P5', 'P7']
                final_standing = self._get_standing_list(standing)
            final_table.set_index(TEAM_NAME, inplace=True)
            final_table = final_table.reindex(final_standing).reset_index()
        final_table[DFFL] = DfflPoints.for_number_teams(final_table.shape[0])
        return final_table

    def get_offense_player_statistics_table(self):
        scoring_events = [
            "Touchdown",
            "1-Extra-Punkt",
            "2-Extra-Punkte"
        ]

        output_columns = ["Platz", "Spieler"] + scoring_events + ["Punkte"]

        events = pd.DataFrame(TeamLog.objects \
            .filter(gameinfo__in=self._gameinfo['id'], isDeleted=False, event__in=scoring_events) \
            .exclude(team=None) \
            .exclude(player=None) \
            .values(TEAM_NAME, "event", "player", "value"))

        if events.empty:
            return pd.DataFrame(columns=output_columns)

        events["player"] = events.apply(lambda x: f"{x.team__name} #{x.player}", axis=1)

        table = pd.crosstab(events['player'], events['event'], values=events.event, aggfunc='count').fillna(0).astype(int)

        for missing_event in set(scoring_events) - set(table.columns):
            table[missing_event] = 0

        points = events \
            .groupby("player") \
            .value.sum()

        table = table \
            .merge(left_index=True, right=points, right_index=True) \
            .reset_index() \
            .sort_values(by="value", ascending=False)

        table["Platz"] = table.value.rank(method="min", ascending=False).astype(int)

        table = table.rename(columns={
            "player": "Spieler",
            "value": "Punkte"
        })[output_columns]

        return table.head(10)

    def get_defense_statistic_table(self):
        ints = self._get_player_events_table(event_name="Interception", event_plural_name="Interceptions") \
            .reset_index(drop=True) \
            .astype(str)
        safeties = self._get_player_events_table(event_name="Safety (+2)", event_plural_name="Safety (+2)", ) \
            .reset_index(drop=True) \
            .astype(str)

        result = ints.merge(safeties, how="outer", left_index=True, right_index=True) \
            .fillna('') \
            .rename(columns={
                "Platz_x": "Platz",
                "Platz_y": "Platz",
                "Spieler_x": "Spieler",
                "Spieler_y": "Spieler"
            })

        return result

    def _get_player_events_table(self, event_name: str, event_plural_name: str):
        output_columns = ["Platz", "Spieler", event_plural_name]
        events = pd.DataFrame(TeamLog.objects \
                              .filter(gameinfo__in=self._gameinfo['id'], isDeleted=False, event=event_name) \
                              .exclude(team=None) \
                              .exclude(player=None) \
                              .values(TEAM_NAME, "event", "player"))

        if events.empty:
            return pd.DataFrame(columns=output_columns)

        events["player"] = events.apply(lambda x: f"{x.team__name} #{x.player}", axis=1)
        events = events.groupby("player", as_index=False) \
            .event.count() \
            .sort_values(by="event", ascending=False)

        events["Platz"] = events.event.rank(method="min", ascending=False).astype(int)
        return events[["Platz", "player", "event"]].rename(
            columns={"player": "Spieler", "event": event_plural_name}).head()

    def _get_standing_list(self, standings):
        final_standing = self._games_with_result.groupby([STANDING, TEAM_NAME], as_index=False)
        final_standing = final_standing.agg({POINTS: 'sum', PF: 'sum', PA: 'sum', DIFF: 'sum'})
        final_standing = final_standing.sort_values(by=[STANDING, POINTS, DIFF, PF, PA], ascending=False)
        # final_standing = final_standing.sort_values(by=STANDING)
        final_team_list = []
        for current_standing in standings:
            current_standing_table = final_standing[final_standing[STANDING] == current_standing]
            if current_standing_table.shape[0] == 2:
                final_team_list = final_team_list + current_standing_table[TEAM_NAME].to_list()
            else:
                current_standing_table = current_standing_table.groupby([TEAM_NAME], as_index=False)
                current_standing_table = current_standing_table.agg({POINTS: 'sum', PF: 'sum', PA: 'sum', DIFF: 'sum'})
                current_standing_table = current_standing_table.sort_values(by=[POINTS, DIFF, PF, PA], ascending=False)
                final_team_list = final_team_list + current_standing_table[TEAM_NAME].to_list()

        return final_team_list

    def _get_schedule(self):
        home_teams = self._games_with_result.groupby(GAMEINFO_ID).nth(0).reset_index()
        away_teams = self._games_with_result.groupby(GAMEINFO_ID).nth(1).reset_index()
        home_teams = home_teams.rename(columns={TEAM_NAME: HOME, PF: POINTS_HOME, ID_Y: ID_HOME})
        away_teams = away_teams.rename(columns={TEAM_NAME: AWAY, PF: POINTS_AWAY, ID_Y: ID_AWAY})
        away_teams = away_teams[[ID_AWAY, POINTS_AWAY, AWAY]]
        qualify_round = pd.concat([home_teams, away_teams], axis=1).sort_values(by=[FIELD, SCHEDULED])
        qualify_round = qualify_round[[GAMEINFO_ID, ID_HOME, HOME, POINTS_HOME, POINTS_AWAY, AWAY, ID_AWAY]]

        schedule = self._gameinfo.merge(qualify_round, how='left', right_on=GAMEINFO_ID, left_on='id')
        schedule = schedule.fillna({ID_HOME: '', ID_AWAY: ''}).astype({ID_HOME: 'string', ID_AWAY: 'string'})
        return schedule

    def _get_table(self):
        qualify_round = self._games_with_result[self._games_with_result[STAGE] == QUALIIFY_ROUND]
        qualify_round = qualify_round.groupby([STANDING, TEAM_NAME], as_index=False)
        qualify_round = qualify_round.agg({POINTS: 'sum', PF: 'sum', PA: 'sum', DIFF: 'sum'})
        qualify_round = qualify_round.sort_values(by=[POINTS, DIFF, PF, PA], ascending=False)
        qualify_round = qualify_round.sort_values(by=STANDING)
        return qualify_round

    def get_qualify_team_by(self, place, standing):
        qualify_round = self._get_table()
        nth_standing = qualify_round.groupby(STANDING).nth(place - 1)
        return nth_standing[nth_standing[STANDING] == standing][TEAM_NAME].iloc[0]

    def get_team_by_points(self, place, standing, points):
        teams = self._get_teams_by(standing, points)
        return teams.iloc[place - 1][TEAM_NAME]

    def get_team_by(self, place, standing, points=None):
        if points is None:
            return self.get_qualify_team_by(place, standing)
        return self.get_team_by_points(place, standing, points)

    def _has_standing(self, check):
        return self._gameinfo[self._gameinfo[STAGE].isin([check])].empty

    def is_finished(self, check):
        if self._has_standing(check):
            return len(self._gameinfo[(self._gameinfo[STANDING] == check) & (self._gameinfo[STATUS] == FINISHED)]) \
                == len(self._gameinfo[(self._gameinfo[STANDING] == check)])

        return len(self._gameinfo[(self._gameinfo[STAGE] == check) & (self._gameinfo[STATUS] == FINISHED)]) == len(
            self._gameinfo[(self._gameinfo[STAGE] == check)])

    def get_games_to_whistle(self, team):
        games_to_whistle = self._get_schedule()

        # Resolve placeholder team names
        games_to_whistle = self._resolve_schedule_placeholders(games_to_whistle)

        games_to_whistle = games_to_whistle.sort_values(by=[SCHEDULED, FIELD])
        if not team:
            return games_to_whistle[games_to_whistle[GAME_FINISHED].isna()]
        return games_to_whistle[
            (games_to_whistle[OFFICIALS_NAME].str.contains(team)) & (games_to_whistle[GAME_FINISHED].isna())]

    def get_team_by_qualify_for(self, place, index):
        qualify_standing_by_place = self._get_table().groupby(STANDING).nth(place - 1).sort_values(
            by=[POINTS, DIFF, PF, PA], ascending=False)
        return qualify_standing_by_place.iloc[index][TEAM_NAME]

    def get_team_aggregate_by(self, aggregate_standings, aggregate_place, place):
        return self._games_with_result[self._games_with_result[STANDING].isin(aggregate_standings)].groupby(
            [STANDING, TEAM_NAME], as_index=False).agg({POINTS: 'sum', PF: 'sum', PA: 'sum', DIFF: 'sum'}).sort_values(
            by=[POINTS, DIFF, PF, PA], ascending=False).sort_values(by=STANDING).groupby(STANDING).nth(
            aggregate_place - 1).sort_values(by=[POINTS, DIFF, PF, PA], ascending=False).iloc[place - 1][TEAM_NAME]

    def get_teams_by(self, standing, points):
        teams = self._get_teams_by(standing, points)
        return list(teams[TEAM_NAME])

    def _get_teams_by(self, standing, points):
        results_with_standing = self._games_with_result[self._games_with_result[STANDING] == standing]
        results_with_standing_and_according_points = results_with_standing[results_with_standing[POINTS] == points]
        return results_with_standing_and_according_points
