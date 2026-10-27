/**
 * Initials for the header avatar.
 *
 * LeagueSphere has no avatar a field official could upload, so the circle shows
 * what the username already carries: `scorecard-test` → `ST`, `max` → `M`.
 * Dots, dashes, underscores and whitespace separate the parts, which keeps
 * e-mail-shaped logins readable.
 *
 * An empty name has no initials: the caller renders nothing instead of an empty
 * circle, so a boot without a user (offline, shared device) stays clean.
 */
const PART_SEPARATOR = /[._\-\s]+/;

export function initialsOf(username: string | null | undefined): string {
  const parts = (username ?? "")
    .trim()
    .split(PART_SEPARATOR)
    .filter((part) => part !== "");

  if (parts.length === 0) {
    return "";
  }
  if (parts.length === 1) {
    // One word carries one letter; two words carry one letter each.
    return parts[0].slice(0, 1).toUpperCase();
  }
  return (parts[0][0] + parts[1][0]).toUpperCase();
}
