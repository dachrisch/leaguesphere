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
  const openItems = !readOnly && !offline ? blockers : [];
  const startWhy =
    openItems.length === 0
      ? null
      : `Noch offen: ${openItems[0]}${
          openItems.length > 1 ? ` (+${openItems.length - 1} weitere)` : ""
        }`;
  return { banner, openItems, startWhy };
}

/** The confirmation sheet and the banner share this one readiness verdict. */
export function startReady(blockers: string[]): boolean {
  return blockers.length === 0;
}
