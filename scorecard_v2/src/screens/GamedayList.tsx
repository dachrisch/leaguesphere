import type { Gameday } from "../api/types";
import Screen from "../components/Screen";
import type { TagVariant } from "../components/tag";

interface GamedayListProps {
  gamedays: Gameday[];
  onSelect: (gameday: Gameday) => void;
  /** ISO `YYYY-MM-DD`; defaults to the device's today. */
  today?: string;
}

export interface DayTag {
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
 * a negative-offset timezone. Impossible calendar dates (e.g. `2026-02-31`)
 * and unexpected formats fall back to the raw value.
 */
export function formatGamedayDate(value: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (match === null) {
    return value;
  }
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(year, month - 1, day);
  if (
    date.getFullYear() !== year ||
    date.getMonth() !== month - 1 ||
    date.getDate() !== day
  ) {
    return value;
  }
  return DATE_FORMAT.format(date);
}

/**
 * Status tag of a gameday card.
 *
 * The gameday payload has no game counts and no per-game status, so the
 * lifecycle status is all that can honestly drive the tag: a gameday marked
 * IN_PROGRESS is running, COMPLETED is finished, a future date is upcoming and
 * anything else is open. `soon` only shows up for demo/staging data — the
 * server filters the list to today, but a fixture payload can carry a later
 * date.
 */
export function gamedayTag(gameday: Gameday, today: string): DayTag {
  if (gameday.status === "IN_PROGRESS") {
    return { variant: "live", label: "läuft" };
  }
  if (gameday.status === "COMPLETED") {
    return { variant: "done", label: "beendet" };
  }
  if (gameday.date > today) {
    return { variant: "soon", label: "bald" };
  }
  return { variant: "open", label: "offen" };
}

export default function GamedayList({
  gamedays,
  onSelect,
  today,
}: GamedayListProps) {
  // One clock read per render: the header, the tags and the "today" default
  // must agree even if the render straddles midnight.
  const todayDate = today ?? todayIso();
  const sub = `Heute · ${formatGamedayDate(todayDate)}`;
  const countLabel =
    gamedays.length === 1 ? "1 Spieltag" : `${gamedays.length} Spieltage`;

  return (
    <Screen kicker="Scorecard" sub={sub} title="Meine Spieltage">
      {gamedays.length === 0 ? (
        <div className="empty-state" role="status">
          <h2 className="empty-title">Keine Spieltage für heute</h2>
          <p className="empty-text">
            Nur Spieltage, an denen du eingeteilt bist, erscheinen hier.
          </p>
        </div>
      ) : (
        <>
          <p className="vhint">{countLabel}</p>
          <ul className="day-list">
            {gamedays.map((gameday) => {
              const tag = gamedayTag(gameday, todayDate);
              return (
                <li key={gameday.id}>
                  <button
                    aria-label={`${gameday.name}, ${formatGamedayDate(gameday.date)}, ${gameday.league_display}, ${tag.label}`}
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
                    <span className="day-meta">
                      {formatGamedayDate(gameday.date)} · {gameday.start} Uhr ·{" "}
                      {gameday.league_display}
                    </span>
                    {gameday.address ? (
                      <span className="day-address">{gameday.address}</span>
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
    </Screen>
  );
}
