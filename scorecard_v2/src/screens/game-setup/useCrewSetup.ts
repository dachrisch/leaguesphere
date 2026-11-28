import {
  useCallback,
  useMemo,
  type Dispatch,
  type SetStateAction,
} from "react";

import type { TeamOfficial } from "../../api/types";
import type { StartCrewLine } from "../../components/sheets/StartConfirmation";
import {
  formatLicenceDate,
  licenceOfPerson,
  personName,
  rowDisplayName,
  slotHasValue,
  type CrewSlot,
  type CrewWrite,
  type Licence,
} from "./crew";

interface UseCrewSetupArgs {
  slots: CrewSlot[];
  setSlots: Dispatch<SetStateAction<CrewSlot[]>>;
  teamOfficials: TeamOfficial[];
  setDirty: Dispatch<SetStateAction<boolean>>;
}

/** Crew state and handlers extracted from the GameSetup screen verbatim. */
export function useCrewSetup({
  slots,
  setSlots,
  teamOfficials,
  setDirty,
}: UseCrewSetupArgs) {
  const teamByOfficial = useMemo(
    () => new Map(teamOfficials.map((person) => [person.id, person])),
    [teamOfficials],
  );

  const displayName = useCallback(
    (slot: CrewSlot): string | null =>
      rowDisplayName(
        { official: slot.official, name: slot.name },
        teamByOfficial,
      ),
    [teamByOfficial],
  );

  /**
   * Licence validity is the server's verdict for **today** (`is_valid` on the
   * team list), not a forecast for the gameday date. A game weeks ahead can
   * therefore show a licence as valid now even though it may lapse before
   * kickoff, and the other way round.
   */
  const licenceOf = useCallback(
    (slot: CrewSlot): Licence => {
      if (slot.official === null) {
        // An empty slot has no licence to judge: "fehlt" says what it is, a
        // missing-licence claim would be about nobody.
        return (slot.name ?? "").trim() === ""
          ? { state: "empty", label: "fehlt" }
          : { state: "missing", label: "keine Lizenz" };
      }
      // The crew read answers the licence itself (it travels with the person
      // from the picker too), so a guest official from another team and a
      // freshly created person do not fall back to "unknown". The team
      // directory stays as the fallback for an older server.
      const licence =
        slot.licence ?? licenceOfPerson(teamByOfficial.get(slot.official));
      if (licence === null) {
        return { state: "unknown", label: "Lizenz unbekannt" };
      }
      if (licence.license === null) {
        return { state: "missing", label: "keine Lizenz" };
      }
      if (licence.isValid) {
        return { state: "valid", label: `${licence.license} gültig` };
      }
      return {
        state: "expired",
        label:
          licence.validUntil === null
            ? `${licence.license} abgelaufen`
            : `${licence.license} abgelaufen seit ${formatLicenceDate(
                licence.validUntil,
              )}`,
      };
    },
    [teamByOfficial],
  );

  /**
   * One warning for the whole crew. Free-text crew rows, officials from
   * another team and unknown positions cannot be judged here, so only linked
   * team licences count.
   */
  const licenceIssues = useMemo(
    () =>
      slots
        .filter((slot) => {
          if (slot.official === null) {
            return false;
          }
          const state = licenceOf(slot).state;
          return state === "expired" || state === "missing";
        })
        .map((slot) => ({
          name: displayName(slot) ?? "Unbekannt",
          role: slot.label,
        })),
    [slots, licenceOf, displayName],
  );

  /**
   * Whether this row carries an invalid licence that the sheet will warn about.
   * The row says so inline ("Start trotzdem möglich") instead of the screen
   * printing a second, global paragraph.
   */
  const licenceWarns = useCallback(
    (slot: CrewSlot): boolean => {
      if (slot.official === null) {
        return false;
      }
      const state = licenceOf(slot).state;
      return state === "expired" || state === "missing";
    },
    [licenceOf],
  );

  /**
   * Completeness is the league's decision (`required` per slot), not a fixed
   * set of positions. Duplicate rows never count: they cannot be written.
   */
  const requiredSlots = slots.filter((slot) => slot.required);
  const requiredFilled = requiredSlots.filter(
    (slot) =>
      !slot.duplicate &&
      (slot.official !== null || (slot.name ?? "").trim() !== ""),
  ).length;

  /**
   * Presentation order, not wire order: the league's required positions first,
   * an optional slot with somebody in it next, then the optional slots still
   * waiting for a name (rendered as one compact "hinzufügen" row each). A
   * stored position the league does not configure is a data problem and stays
   * at the bottom, read-only. Each entry keeps its index into `slots` so the
   * picker edits the right row and the save keeps the server's order.
   */
  const orderedSlots = useMemo(
    () =>
      [
        ...slots.filter((slot) => slot.required),
        ...slots.filter(
          (slot) => !slot.required && slot.known && slotHasValue(slot),
        ),
        ...slots.filter(
          (slot) => !slot.required && slot.known && !slotHasValue(slot),
        ),
        ...slots.filter((slot) => !slot.known),
      ].map((slot) => ({ slot, index: slots.indexOf(slot) })),
    [slots],
  );

  const pickPerson = (index: number, person: TeamOfficial): void => {
    setSlots((current) =>
      current.map((slot, position) =>
        position === index
          ? {
              ...slot,
              official: person.id,
              name: personName(person),
              // The search result already carries the licence. Keeping it means
              // a freshly created or guest official shows the right badge even
              // though the team directory loaded before they existed (and even
              // though they belong to another team).
              licence: licenceOfPerson(person),
            }
          : slot,
      ),
    );
    setDirty(true);
  };

  /**
   * A guest official who is not in the directory: stored as a name, never as a
   * link. `PersonPicker` only offers this when nothing matched and both names
   * are present, so a resolvable person is not replaced by free text.
   */
  const enterFreeText = (index: number, name: string): void => {
    setSlots((current) =>
      current.map((slot, position) =>
        position === index
          ? { ...slot, official: null, name, licence: null }
          : slot,
      ),
    );
    setDirty(true);
  };

  const clearSlot = (index: number): void => {
    setSlots((current) =>
      current.map((slot, position) =>
        position === index
          ? { ...slot, official: null, name: null, licence: null }
          : slot,
      ),
    );
    setDirty(true);
  };


  // Duplicate rows are never written: the backend upserts by position and its
  // `get_or_create` raises when two rows share one. Unknown positions are kept
  // verbatim so they survive the save untouched.
  const crewPayload: CrewWrite[] = slots
    .filter((slot) => !slot.duplicate)
    .map((slot) => ({
      position: slot.position,
      official: slot.official,
      name:
        slot.official === null
          ? slot.name?.trim() || null
          : (displayName(slot) ?? slot.name),
    }));


  /**
   * What the confirmation restates, in the sheet's own shape.
   *
   * `filled` is the slot's own state, not the resolved display name: the team
   * list can fail, or a stored row can carry no name, and a linked official then
   * has no name while the slot is clearly staffed (the picker says "Offizieller
   * 99" and the completeness chip counts it). `editable` mirrors the picker: a
   * duplicate row or a position the league does not configure is shown but
   * cannot be fixed here, so it never becomes the reason a start is refused.
   */
  const crewLines: StartCrewLine[] = slots.map((slot) => {
    const name = displayName(slot);
    return {
      label: slot.label,
      name,
      filled: slot.official !== null || (slot.name ?? "").trim() !== "",
      freetext: slot.official === null && name !== null,
      required: slot.required,
      editable: slot.known && !slot.duplicate,
      duplicate: slot.duplicate,
    };
  });


  /** Officials used by another row, so one person cannot fill two slots. */
  const takenByOthers = (index: number): Set<number> => {
    const taken = new Set<number>();
    slots.forEach((slot, otherIndex) => {
      if (otherIndex === index) {
        return;
      }
      for (const row of slot.rows) {
        if (row.official !== null) {
          taken.add(row.official);
        }
      }
      if (slot.official !== null) {
        taken.add(slot.official);
      }
    });
    return taken;
  };

  return {
    teamByOfficial,
    displayName,
    licenceOf,
    licenceIssues,
    licenceWarns,
    requiredSlots,
    requiredFilled,
    orderedSlots,
    pickPerson,
    enterFreeText,
    clearSlot,
    crewPayload,
    crewLines,
    takenByOthers,
  };
}
