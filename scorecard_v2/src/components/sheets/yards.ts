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

/**
 * Whether a typed distance fits the spot the ball is on, in the sheet's words.
 *
 * `advance` clamps a spot to the field, so a gain running past the opponent's
 * goal line used to be stored as the shorter play — a different play than the
 * one the official saw (field report 2026-11-18). The distance to a goal line
 * is still allowed: it is a touchdown, and the other way round a safety.
 * Without a known spot (no drive) there is nothing to check.
 */
export function yardsRangeError(
  yards: number,
  { ballOn, fieldLength }: { ballOn: number | null; fieldLength: number },
): string | null {
  if (ballOn === null || !Number.isFinite(yards)) {
    return null;
  }
  if (yards > 0 && yards > fieldLength - ballOn) {
    return `Der Raumgewinn reicht über die Endzone hinaus (höchstens ${yardsNumber(
      fieldLength - ballOn,
    )} Yards).`;
  }
  if (yards < 0 && Math.abs(yards) > ballOn) {
    return `Der Raumverlust reicht in die eigene Endzone (höchstens ${yardsNumber(
      ballOn,
    )} Yards).`;
  }
  return null;
}
