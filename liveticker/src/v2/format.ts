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
