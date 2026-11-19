export type Side = "home" | "away" | null;

export interface Team {
  name: string;
  full_name: string;
  score: number | null;
  isInPossession: boolean;
  logo: string | null;
  fh: number | null;
  sh: number | null;
}

export interface Tick {
  text: string;
  team: Side;
  time: string;
}

export interface Gameday {
  id: number;
  name: string;
  address: string;
}

export interface Game {
  gameId: number;
  status: string;
  standing: string;
  stage: string;
  field: number;
  league: string;
  gameday: Gameday;
  time: string;
  home: Team;
  away: Team;
  ticks: Tick[];
}
