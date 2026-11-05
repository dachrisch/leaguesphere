/**
 * The yards field shared by the play, touchdown and first-down sheets.
 *
 * A play gains or loses at most two digits (0–99). A leading minus marks a
 * loss (a short pass the receiver carries backwards); the payload stores the
 * signed value, so a later statistics pass can simply add the plays up.
 */

/** `"8"` → `8`, `"-5"` → `-5`, `""`/`"-"` → `null`. */
export function yardsValue(raw: string): number | null {
  const value = raw.trim();
  const negative = value.startsWith("-");
  const digits = value.replace(/\D/g, "").slice(0, 2);
  if (digits === "") {
    return null;
  }
  return negative ? -Number(digits) : Number(digits);
}

/** The visible text of a gained or lost distance. */
export function yardsText(yards: number, { loss = false } = {}): string {
  const distance = Math.abs(yards);
  return loss || yards < 0 ? `${distance} Yards Verlust` : `${distance} Yards`;
}
