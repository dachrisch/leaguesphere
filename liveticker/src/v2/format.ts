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

export function eventCode(text: string): string {
  const lower = text.toLowerCase();
  if (lower.startsWith("touchdown")) return "TD";
  if (lower.includes("extra-punkt") || lower.includes("extrapunkt")) return "XP";
  if (lower.startsWith("run") || lower.startsWith("lauf")) return "LA";
  if (lower.startsWith("strafe")) return "ST";
  if (lower.startsWith("auszeit")) return "AZ";
  if (lower.startsWith("spielzeit") || lower.includes("halbzeit gestartet")) return "HZ";
  if (lower.startsWith("spiel gestartet") || lower.startsWith("anpfiff")) return "AN";
  return "•";
}

export function germanEventText(text: string): string {
  return text
    .replace(/^Run\b/, "Lauf")
    .replace(/^1-Extra-Punkt/, "Extrapunkt")
    .replace(/^2-Extra-Punkte/, "2 Extrapunkte");
}
