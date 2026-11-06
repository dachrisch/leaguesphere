/** The short German noun for one queued op, shared by the badge and the list. */
import type { OpKind } from "./types";

const LABELS: Record<OpKind, string> = {
  event: "Eintrag",
  delete: "Rückgängig",
  correction: "Rückgängig",
  possession: "Ballbesitz",
  halftime: "Halbzeit",
};

export function opLabel(kind: OpKind): string {
  return LABELS[kind] ?? kind;
}
