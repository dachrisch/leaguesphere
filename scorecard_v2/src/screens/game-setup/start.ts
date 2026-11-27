import { formatGameTime } from "../GameList";
import type { StartCrewLine } from "../../components/sheets/StartConfirmation";
import type { CrewSlot } from "./crew";

/** The start bar's label: the same five states the screen rendered before. */
export function startLabel(
  readOnly: boolean,
  offline: boolean,
  saving: boolean,
  hasSetup: boolean,
  scheduled: string,
): string {
  if (readOnly) {
    return "Nur lesen";
  } else if (offline) {
    return "Start nur online";
  } else if (saving) {
    return "Startet …";
  } else if (hasSetup) {
    return "Fortsetzen";
  } else {
    return `Spiel starten · ${formatGameTime(scheduled)}`;
  }
}

interface CrewProgressArgs {
  requiredSlots: CrewSlot[];
  requiredFilled: number;
  licenceIssues: { name: string; role: string }[];
  slots: CrewSlot[];
  crewLines: StartCrewLine[];
  crewOpen: boolean;
  displayName: (slot: CrewSlot) => string | null;
}

/** Completeness chip, fold state, names and the counter of the crew section. */
export function crewProgress({
  requiredSlots,
  requiredFilled,
  licenceIssues,
  slots,
  crewLines,
  crewOpen,
  displayName,
}: CrewProgressArgs) {
  /**
   * A crew with every required slot staffed, every licence valid and nothing
   * to clean up needs no attention: it folds into one row. Anything off keeps
   * the rows open, so the problem is never hidden behind "ändern".
   */
  const crewComplete =
    requiredSlots.length > 0 &&
    requiredFilled === requiredSlots.length &&
    licenceIssues.length === 0 &&
    !slots.some((slot) => slot.duplicate || !slot.known) &&
    !crewLines.some((line) => line.freetext);
  const crewFolded = crewComplete && !crewOpen;
  const crewNames = requiredSlots
    .map((slot) => displayName(slot))
    .filter((value): value is string => value !== null && value.trim() !== "");
  const counter =
    requiredSlots.length === 0
      ? "keine Pflichtposition"
      : `${requiredFilled}/${requiredSlots.length} besetzt`;
  return { crewComplete, crewFolded, crewNames, counter };
}

interface StartBannerArgs {
  readOnly: boolean;
  error: string | null;
  offline: boolean;
  ready: boolean;
  blockers: string[];
}

/** Banner, sticky-bar reason and the sheet's "Noch offen" line. */
export function startState({
  readOnly,
  error,
  offline,
  ready,
  blockers,
}: StartBannerArgs) {
  // The banner and the start bar must say the same thing: a complete setup is
  // only "ready" when the bar is not disabled by the device lock or the
  // missing connection. Otherwise the banner names that reason instead of
  // claiming green. Missing input still comes from the same blockers array the
  // confirmation sheet uses.
  const banner = readOnly
    ? {
        tone: "miss" as const,
        title: "Nur lesen",
        lines: [error ?? "Dieses Spiel läuft auf einem anderen Gerät."],
      }
    : offline
      ? {
          tone: "miss" as const,
          title: "Start nur online",
          lines: ["Das Spiel kann nur mit Verbindung gestartet werden."],
        }
      : ready
        ? {
            tone: "ok" as const,
            title: "Bereit zum Starten",
            lines: ["Alle Pflichtangaben sind gesetzt."],
          }
        : {
            tone: "miss" as const,
            title: "Angaben fehlen",
            lines: blockers,
          };

  // The banner can scroll under the sticky start bar, so the bar repeats the
  // first open item: the reason the start is refused is never out of view.
  const openItems = !readOnly && !offline ? blockers : [];
  const startWhy =
    openItems.length === 0
      ? null
      : `Noch offen: ${openItems[0]}${
          openItems.length > 1 ? ` (+${openItems.length - 1} weitere)` : ""
        }`;
  return { banner, openItems, startWhy };
}

/**
 * The confirmation sheet and the banner share this one readiness verdict.
 * One source of truth for "may this start?": both read `startBlockers`, so
 * they cannot drift apart.
 */
export function startReady(blockers: string[]): boolean {
  return blockers.length === 0;
}
