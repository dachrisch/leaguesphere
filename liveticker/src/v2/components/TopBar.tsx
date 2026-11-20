import type { Game } from "../types";
import { ShareButton } from "./ShareButton";

interface TopBarProps {
  league: string;
  gamedayName: string;
  liveCount: number;
  shareGame: Game | null;
}

/** One compact line: league · gameday, live count, share. */
export function TopBar({
  league,
  gamedayName,
  liveCount,
  shareGame,
}: TopBarProps) {
  return (
    <header className="lt-topbar">
      <div className="lt-topbar-id">
        <span className="lt-topbar-league">{league || "Liveticker"}</span>
        <span className="lt-topbar-sep" aria-hidden="true">
          ·
        </span>
        <h2 className="lt-topbar-title">{gamedayName || "Liveticker"}</h2>
      </div>
      {liveCount > 0 && (
        <span className="lt-live-count">
          <span className="lt-live-dot" aria-hidden="true" />
          {liveCount} LIVE
        </span>
      )}
      <ShareButton game={shareGame} variant="icon" />
    </header>
  );
}
