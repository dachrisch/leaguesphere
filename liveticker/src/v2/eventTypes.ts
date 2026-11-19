export const BACKEND_TYPES = [
  "touchdown",
  "extra_point",
  "overtime_score",
  "safety",
  "turnover",
  "interception",
  "first_down",
  "penalty",
  "clock",
  "timeout",
  "pass",
  "pass_incomplete",
  "run",
  "sack",
  "challenge",
  "field_position",
  "period_start",
  "period_half",
  "period_overtime",
  "period_end",
  "other",
] as const;

export type BackendType = (typeof BACKEND_TYPES)[number];

export interface EventMeta {
  code: string;
  label: string | null;
}

export const EVENT_META: Record<BackendType, EventMeta> = {
  touchdown: { code: "TD", label: "Touchdown" },
  extra_point: { code: "XP", label: "Extrapunkt" },
  overtime_score: { code: "OT", label: "Overtime" },
  safety: { code: "SF", label: "Safety" },
  turnover: { code: "TO", label: "Ballabgabe" },
  interception: { code: "IN", label: "Interception" },
  first_down: { code: "FD", label: "First Down" },
  penalty: { code: "ST", label: "Strafe" },
  clock: { code: "SZ", label: "Spielzeit" },
  timeout: { code: "AZ", label: "Auszeit" },
  pass: { code: "PA", label: "Pass" },
  pass_incomplete: { code: "PA", label: "Pass unvollständig" },
  run: { code: "LA", label: "Lauf" },
  sack: { code: "SK", label: "Sack" },
  challenge: { code: "CH", label: "Challenge" },
  field_position: { code: "FP", label: "Feldposition" },
  period_start: { code: "AN", label: "Anpfiff" },
  period_half: { code: "HZ", label: "Halbzeit" },
  period_overtime: { code: "OZ", label: "Overtime-Start" },
  period_end: { code: "EN", label: "Spielende" },
  other: { code: "•", label: null },
};

export function eventMeta(type: string): EventMeta {
  return EVENT_META[type as BackendType] ?? EVENT_META.other;
}

/** The detail part of the legacy rendered tick, without guessing its type. */
export function eventDetail(text: string): string {
  const separator = text.indexOf(" - ");
  return separator === -1 ? "" : text.slice(separator + 3).trim();
}
