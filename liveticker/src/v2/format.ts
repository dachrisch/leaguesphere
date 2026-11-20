const TIME_ONLY = /^\d{2}:\d{2}$/;

export function formatClock(value: string | null): string {
  if (!value) return "—";
  if (TIME_ONLY.test(value)) return value;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleTimeString("de-DE", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

const BERLIN = "Europe/Berlin";

export function formatBerlinClock(value: string | null): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("de-DE", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: BERLIN,
  }).format(date);
}

export function formatBerlinDate(value: string | null): string {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("de-DE", {
    weekday: "short",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    timeZone: BERLIN,
  }).format(date);
}

const wordsOf = (value: string): string[] =>
  value.trim().split(/\s+/).filter(Boolean);

const firstTwo = (value: string): string =>
  value.slice(0, 2).toLocaleUpperCase("de-DE");

function initialsFor(words: string[]): string {
  if (words.length === 0) return "?";
  const last = words[words.length - 1];
  if (last.length >= 2) return firstTwo(last);
  return firstTwo(words.map((word) => word[0]).join(""));
}

/**
 * Two-letter badges from the words that tell the teams apart: a shared prefix
 * ("Demo Wolves" / "Demo Eagles") is skipped, otherwise the last word wins.
 */
export function teamBadges(
  homeName: string,
  awayName: string,
): { home: string; away: string } {
  const homeWords = wordsOf(homeName);
  const awayWords = wordsOf(awayName);
  let prefix = 0;
  while (
    prefix < homeWords.length &&
    prefix < awayWords.length &&
    homeWords[prefix].toLocaleLowerCase("de-DE") ===
      awayWords[prefix].toLocaleLowerCase("de-DE")
  ) {
    prefix += 1;
  }
  const homeDistinct = homeWords.slice(prefix);
  const awayDistinct = awayWords.slice(prefix);
  let home = initialsFor(homeDistinct.length > 0 ? homeDistinct : homeWords);
  let away = initialsFor(awayDistinct.length > 0 ? awayDistinct : awayWords);
  if (home === away) {
    home = initialsFor(homeWords);
    away = initialsFor(awayWords);
  }
  if (home === away) {
    const extra = (awayWords[awayWords.length - 1] ?? "X").slice(2, 3) || "X";
    away = firstTwo(`${away.slice(0, 1)}${extra}`);
  }
  return { home, away };
}

/** The shortest useful team name for a chip: its distinctive last word. */
export function shortTeamName(name: string): string {
  const words = wordsOf(name);
  return words.length > 0 ? words[words.length - 1] : name;
}

export function statusLabel(status: string): string {
  if (status === "1. Halbzeit") return "1. HZ";
  if (status === "2. Halbzeit") return "2. HZ";
  if (status === "beendet") return "Endstand";
  return status || "Geplant";
}

export function halftimeLabel(
  home: { fh: number | null; sh: number | null },
  away: { fh: number | null; sh: number | null },
): string {
  const parts: string[] = [];
  if (home.fh !== null || away.fh !== null) {
    parts.push(`1. HZ ${home.fh ?? "–"}:${away.fh ?? "–"}`);
  }
  if (home.sh !== null || away.sh !== null) {
    parts.push(`2. HZ ${home.sh ?? "–"}:${away.sh ?? "–"}`);
  }
  return parts.join(" · ");
}
