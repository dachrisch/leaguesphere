/**
 * The yards field shared by the play, touchdown and first-down sheets.
 *
 * A play gains or loses at most two digits (0–99) plus one decimal place: half
 * yards are real on this field (a half-distance penalty produces them), and
 * the official writes them with a comma ("7,5"). The payload stores the signed
 * value, so a later statistics pass can simply add the plays up.
 */

/**
 * `"8"` → `8`, `"7,5"` → `7.5`, `"-1,5"` → `-1.5`, `",5"` → `0.5`,
 * `""`/`"-"`/`"1a2"`/`"7,55"` → `null`.
 *
 * The separator is read, never stripped: dropping it turned 7,5 into 75 (field
 * report 2026-11-18). One decimal place is the domain's precision, and more
 * than two integer digits is a typo the sheet flags instead of guessing.
 */
export function yardsValue(raw: string): number | null {
  const match = /^(-?)(\d{0,2})(?:[.,](\d?))?$/.exec(raw.trim());
  if (match === null) {
    return null;
  }
  const [, sign = "", whole = "", fraction] = match;
  if (whole === "" && (fraction === undefined || fraction === "")) {
    return null;
  }
  const value = Number(`${whole === "" ? "0" : whole}.${fraction ?? "0"}`);
  if (!Number.isFinite(value)) {
    return null;
  }
  return sign === "-" ? -value : value;
}

/** One decimal at most, in the German comma notation (`7.5` → `"7,5"`). */
export function yardsNumber(value: number): string {
  const rounded = Math.round(Math.abs(value) * 10) / 10;
  return String(rounded).replace(".", ",");
}

/** The visible text of a gained or lost distance. */
export function yardsText(yards: number, { loss = false } = {}): string {
  return loss || yards < 0
    ? `${yardsNumber(yards)} Yards Verlust`
    : `${yardsNumber(yards)} Yards`;
}
