import { useState } from "react";

export function ShareButton() {
  const [status, setStatus] = useState("");
  const url = typeof window === "undefined" ? "" : window.location.href;

  const copy = async (): Promise<boolean> => {
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
    if (navigator.share) {
      try {
        await navigator.share({ title: "Liveticker", url });
        setStatus("Geteilt");
        return;
      } catch (reason) {
        if (reason instanceof DOMException && reason.name === "AbortError") {
          return;
        }
      }
    }
    setStatus((await copy()) ? "Link kopiert" : "Teilen nicht verfügbar");
  };

  return (
    <div className="lt-share">
      <button type="button" className="lt-share-button" onClick={() => void share()}>
        Ticker teilen
      </button>
      <p className="lt-share-status" role="status" aria-live="polite">
        {status}
      </p>
    </div>
  );
}
