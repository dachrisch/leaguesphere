import { useState } from "react";

import type { Game } from "../types";

interface ShareButtonProps {
  game?: Game | null;
  variant?: "text" | "icon";
}

export function ShareButton({ game = null, variant = "text" }: ShareButtonProps) {
  const [status, setStatus] = useState("");

  const deepLink = (): string => {
    const url = new URL(window.location.href);
    if (game) {
      url.searchParams.set("game", String(game.gameId));
    } else {
      url.searchParams.delete("game");
    }
    return url.toString();
  };

  const title = game
    ? `${game.home.name || game.home.full_name} – ${
        game.away.name || game.away.full_name
      } · Liveticker`
    : "Liveticker";

  const copy = async (url: string): Promise<boolean> => {
    try {
      await navigator.clipboard.writeText(url);
      return true;
    } catch {
      const area = document.createElement("textarea");
      area.value = url;
      document.body.appendChild(area);
      area.select();
      const ok = document.execCommand("copy");
      area.remove();
      return ok;
    }
  };

  const share = async () => {
    const url = deepLink();
    if (navigator.share) {
      try {
        await navigator.share({ title, url });
        setStatus("Geteilt");
        return;
      } catch (reason) {
        if (reason instanceof DOMException && reason.name === "AbortError") {
          return;
        }
      }
    }
    setStatus((await copy(url)) ? "Link kopiert" : "Teilen nicht verfügbar");
  };

  return (
    <div className={variant === "icon" ? "lt-share lt-share-icon" : "lt-share"}>
      <button
        type="button"
        className="lt-share-button"
        aria-label="Ticker teilen"
        title="Ticker teilen"
        onClick={() => void share()}
      >
        {variant === "icon" ? (
          <svg
            className="lt-share-glyph"
            viewBox="0 0 24 24"
            aria-hidden="true"
            focusable="false"
          >
            <path
              d="M12 3v12m0-12 4 4m-4-4L8 7M5 12v7a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-7"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        ) : (
          "Ticker teilen"
        )}
      </button>
      <p className="lt-share-status" role="status" aria-live="polite">
        {status}
      </p>
    </div>
  );
}
