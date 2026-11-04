/**
 * The yards field shared by the play, touchdown and first-down sheets.
 *
 * A play gains at most two digits (0–99), and a loss is entered as a positive
 * number: the sheet's label says which way it counts, the payload stores it
 * signed so a later statistics pass can simply add the plays up.
 */

/** `"8"` → `8`, `""` → `null`; everything but the first two digits is dropped. */
export function yardsValue(raw: string): number | null {
  const digits = raw.replace(/\D/g, "").slice(0, 2);
  return digits === "" ? null : Number(digits);
}

/** The visible text of a gained or lost distance. */
export function yardsText(yards: number, { loss = false } = {}): string {
  const distance = Math.abs(yards);
  return loss || yards < 0 ? `${distance} Yards Verlust` : `${distance} Yards`;
}
