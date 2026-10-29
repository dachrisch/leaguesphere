/**
 * Status vocabulary shared by the scorecard screens.
 *
 * `Gameinfo.status` is free text on the wire, so {@link gameTag} accepts any
 * string: the known started states are running, `beendet` (in any
 * capitalisation) is done, and everything else — `Geplant`, an empty value or
 * a status this build does not know — is open and stays tappable.
 */

/** Visual variant of a status tag; the classes live in ../styles/app.css. */
export type TagVariant = "live" | "done" | "open" | "soon";

/** How a game row reacts to a tap. A finished game is inert, not disabled. */
export type GameRowAction = "select" | "resume" | "none";

export interface GameTag {
  variant: TagVariant;
  label: string;
  action: GameRowAction;
}

const RUNNING = new Set(["Gestartet", "1. Halbzeit", "2. Halbzeit"]);

/**
 * Map a game status to its tag and row action.
 *
 * The finished check is case-insensitive because the status column predates
 * the current vocabulary; the default is deliberately open so an unknown value
 * can still be opened instead of disappearing.
 */
export function gameTag(status: string): GameTag {
  if (status.trim().toLowerCase() === "beendet") {
    return { variant: "done", label: "beendet", action: "none" };
  }
  if (RUNNING.has(status)) {
    return { variant: "live", label: "läuft", action: "resume" };
  }
  return { variant: "open", label: "offen", action: "select" };
}
