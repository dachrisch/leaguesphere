import type { Game } from "../types";

export const game: Game = {
  gameId: 1,
  status: "1. Halbzeit",
  standing: "Gruppe 1",
  stage: "Vorrunde",
  field: 1,
  league: "Testliga",
  gameday: { id: 2, name: "Testtag", address: "Testfeld" },
  time: "2026-08-15T11:30:00+00:00",
  home: {
    name: "Walldorf Wanderers",
    full_name: "Walldorf Wanderers",
    score: 7,
    isInPossession: true,
    logo: null,
    fh: 7,
    sh: 0,
  },
  away: {
    name: "Düsseldorf Firecats",
    full_name: "Düsseldorf Firecats",
    score: 6,
    isInPossession: false,
    logo: null,
    fh: 6,
    sh: 0,
  },
  ticks: [
    {
      text: "Touchdown: #7 - 45 Yards",
      team: "home",
      time: "2026-08-15T12:05:00+00:00",
    },
  ],
};
