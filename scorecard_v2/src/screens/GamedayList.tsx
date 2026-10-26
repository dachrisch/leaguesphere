import type { Gameday } from "../api/types";

interface GamedayListProps {
  gamedays: Gameday[];
  onSelect: (gameday: Gameday) => void;
  todayLabel?: string;
}

type TagVariant = "live" | "done" | "open" | "soon";

interface DayTag {
  variant: TagVariant;
  label: string;
}

const DATE_FORMAT = new Intl.DateTimeFormat("de-DE", {
  weekday: "short",
  day: "2-digit",
  month: "short",
});

/** Today as `YYYY-MM-DD` in the device's timezone (matches the API dates). */
function todayIso(): string {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${now.getFullYear()}-${month}-${day}`;
}

/**
 * Render an API date (`YYYY-MM-DD`) as `Mo., 26. Okt.`. Parsed by hand so the
 * UTC midnight of `new Date("2026-10-26")` cannot slip to the previous day in
 * a negative-offset timezone; unparseable input falls back to the raw value.
 */
export function formatGamedayDate(value: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (match === null) {
    return value;
  }
  const date = new Date(
    Number(match[1]),
    Number(match[2]) - 1,
    Number(match[3]),
  );
  return DATE_FORMAT.format(date);
}

/**
 * Status tag of a gameday card.
 *
 * The gameday payload has no game counts and no per-game status, so the
 * lifecycle status is all that can honestly drive the tag: a gameday marked
 * IN_PROGRESS is running, COMPLETED is finished, a future date is upcoming and
 * anything else is open.
 */
export function gamedayTag(gameday: Gameday, today = todayIso()): DayTag {
  if (gameday.status === "IN_PROGRESS") {
    return { variant: "live", label: "läuft" };
  }
  if (gameday.status === "COMPLETED") {
    return { variant: "done", label: "fertig" };
  }
  if (gameday.date > today) {
    return { variant: "soon", label: "bald" };
  }
  return { variant: "open", label: "offen" };
}

export default function GamedayList({
  gamedays,
  onSelect,
  todayLabel,
}: GamedayListProps) {
  const first = gamedays[0];
  const sub = todayLabel
    ? `Heute · ${todayLabel}`
    : formatGamedayDate(first ? first.date : todayIso());
  const countLabel =
    gamedays.length === 1 ? "1 Spieltag" : `${gamedays.length} Spieltage`;

  return (
    <>
      <header className="app-header">
        <p className="kicker">Scorecard</p>
        <h1 className="app-title">Meine Spieltage</h1>
        <p className="app-sub">{sub}</p>
      </header>

      <main className="vscroll">
        {gamedays.length === 0 ? (
          <div className="empty-state">
            <p className="empty-title">Keine Spieltage für heute</p>
            <p className="empty-text">
              Nur Spieltage, an denen du eingeteilt bist, erscheinen hier.
            </p>
          </div>
        ) : (
          <>
            <p className="vhint">{countLabel}</p>
            <ul className="day-list">
              {gamedays.map((gameday) => {
                const tag = gamedayTag(gameday);
                return (
                  <li key={gameday.id}>
                    <button
                      className="day-card"
                      onClick={() => onSelect(gameday)}
                      type="button"
                    >
                      <span className="day-head">
                        <span className="day-name">{gameday.name}</span>
                        <span className={`tag tag-${tag.variant}`}>
                          {tag.label}
                        </span>
                      </span>
                      <span className="day-date">
                        {formatGamedayDate(gameday.date)} · {gameday.start} Uhr
                      </span>
                      {gameday.address ? (
                        <span className="day-meta">{gameday.address}</span>
                      ) : null}
                    </button>
                  </li>
                );
              })}
            </ul>
            <p className="vnote">
              Tippe auf einen Spieltag, um die Spiele zu öffnen.
            </p>
          </>
        )}
      </main>
    </>
  );
}
