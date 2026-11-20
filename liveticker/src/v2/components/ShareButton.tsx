import { useEffect, useState } from "react";

import type { Game } from "../types";
import { tickerPath } from "../urlState";

interface ShareButtonProps {
  game?: Game | null;
  variant?: "text" | "icon";
}

export function ShareButton({ game = null, variant = "text" }: ShareButtonProps) {
  const [status, setStatus] = useState("");
  const [toast, setToast] = useState("");
  const isIcon = variant === "icon";

  useEffect(() => {
    if (!toast) return undefined;
    const timer = window.setTimeout(() => setToast(""), 2500);
    return () => window.clearTimeout(timer);
  }, [toast]);

  const feedback = (message: string) => {
    if (isIcon) {
      setToast(message);
    } else {
      setStatus(message);
    }
  };

  const deepLink = (): string => {
    if (game) {
      return (
        window.location.origin +
        tickerPath({ gameday: game.gameday.id, gameId: game.gameId })
      );
    }
    // No game: the current page is already a path; never append a query.
    return window.location.origin + window.location.pathname;
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
        if (isIcon) {
          setToast("");
        } else {
          setStatus("Geteilt");
        }
        return;
      } catch (reason) {
        if (reason instanceof DOMException && reason.name === "AbortError") {
          return;
        }
      }
    }
    feedback((await copy(url)) ? "Link kopiert" : "Teilen fehlgeschlagen");
  };

  return (
    <div className={isIcon ? "lt-share lt-share-icon" : "lt-share"}>
      {isIcon && toast && (
        <span className="lt-share-toast" role="status" aria-live="polite">
          {toast}
        </span>
      )}
      <button
        type="button"
        className="lt-share-button"
        aria-label="Ticker teilen"
        title="Ticker teilen"
        onClick={() => void share()}
      >
        {isIcon ? (
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
      {!isIcon && (
        <p className="lt-share-status" role="status" aria-live="polite">
          {status}
        </p>
      )}
    </div>
  );
}
