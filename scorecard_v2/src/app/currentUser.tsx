/**
 * The signed-in official, for chrome the flow does not pass props to.
 *
 * `App` owns the fetch (`loadUser`) and provides the value here; `AppHeader`
 * reads it for the avatar. The default is `null`, so a screen rendered without
 * the provider — every component test — simply shows no avatar instead of
 * needing a prop threaded through all six screens.
 */
import { createContext, useContext, type ReactNode } from "react";

import type { CurrentUser } from "./load";

const CurrentUserContext = createContext<CurrentUser | null>(null);

export function CurrentUserProvider({
  user,
  children,
}: {
  user: CurrentUser | null;
  children: ReactNode;
}) {
  return (
    <CurrentUserContext.Provider value={user}>
      {children}
    </CurrentUserContext.Provider>
  );
}

export function useCurrentUser(): CurrentUser | null {
  return useContext(CurrentUserContext);
}
