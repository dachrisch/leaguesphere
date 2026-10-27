/**
 * The team-name→logo lookup, for screens the flow does not pass props to.
 *
 * `App` owns the one load (`loadTeamLogos`) and provides the map here; the
 * score header, the game list and the preparation header read it. The default
 * is an empty map, so a screen rendered without the provider — every component
 * test — simply shows the initials circle instead of needing a prop threaded
 * through all six screens.
 */
import { createContext, useContext, type ReactNode } from "react";

import type { TeamLogos } from "../api/teams";

const EMPTY_LOGOS: TeamLogos = new Map();

const TeamLogosContext = createContext<TeamLogos>(EMPTY_LOGOS);

export function TeamLogosProvider({
  logos,
  children,
}: {
  logos: TeamLogos;
  children: ReactNode;
}) {
  return (
    <TeamLogosContext.Provider value={logos}>
      {children}
    </TeamLogosContext.Provider>
  );
}

export function useTeamLogos(): TeamLogos {
  return useContext(TeamLogosContext);
}
