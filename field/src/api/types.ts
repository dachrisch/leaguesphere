export type ApiTeam = {
  id: number;
  name: string;
  isChecked: boolean;
};

export type Game = {
  gameday_id: number;
  field: number;
  scheduled: string;
  home: ApiTeam;
  away: ApiTeam;
};

export type GamedayRef = {
  id: number;
  name: string;
  league__name?: string;
};

export type GamesResponse = {
  officialsTeamName: string;
  games: Game[];
  gamedays: GamedayRef[];
};

export type RosterEntry = {
  id: number;
  jersey_number: number;
  first_name: string;
  last_name: string;
  pass_number: number;
  isSelected: boolean;
  validationError?: string;
  joined_on?: string;
  left_on?: string | null;
};

export type TeamValidator = {
  max_subs_in_other_leagues?: number;
  minimum_player_strength?: number;
  maximum_player_strength?: number | null;
};

export type RosterTeam = {
  name: string;
  roster: RosterEntry[];
  validator: TeamValidator;
};

export type RosterResponse = {
  is_user_or_staff: boolean;
  all_leagues: { gamedays__league: number; gamedays__league__name?: string }[];
  team: RosterTeam;
  team_id: number;
  related_teams: { team__description: string; team__id: number }[];
  years: number[];
  official_name: string;
  note: string | null;
  additionalTeams: RosterTeam[];
};

export type RosterWriteEntry = {
  id: number;
  jersey_number: number;
};

export type SaveRosterPayload = {
  official_name: string;
  note: string | null;
  roster: RosterWriteEntry[];
  client_id?: string;
  device_id?: string;
};
