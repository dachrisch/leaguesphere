/**
 * The team-name→logo lookup, for screens the flow does not pass props to.
 *
 * `App` owns the one load (`loadTeamLogos`) and provides the map here; the
 * score header, the game list and the preparation header read it. There is no
 * empty default: a screen rendered outside the provider is a wiring bug, and
 * {@link useTeamLogos} says so instead of silently drawing initials everywhere.
 * Screen tests wrap their render in {@link TeamLogosProvider} (an empty map is
 * a valid value for "the directory has no logos").
 */
import { createContext, useContext, type ReactNode } from "react";

import type { TeamLogos } from "../api/teams";

const TeamLogosContext = createContext<TeamLogos | null>(null);

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
  const logos = useContext(TeamLogosContext);
  if (logos === null) {
    throw new Error(
      "useTeamLogos(): no <TeamLogosProvider> mounted. App provides the " +
        "directory once at boot; a screen rendered on its own needs a " +
        "provider with a map (use an empty one for tests).",
    );
  }
  return logos;
}
