import { useEffect } from "react";

interface TrackingShortcutHandlers {
  onTouchdown: () => void;
  onAction: (index: number) => void;
  onSwitchPossession: () => void;
  onUndo: () => void;
  readOnly: boolean;
  sheetOpen: boolean;
}

function editing(element: Element | null): boolean {
  return (
    element !== null &&
    element.closest('input, textarea, select, [contenteditable="true"]') !== null
  );
}

/** Desktop keys for the tracking cockpit; buttons remain the accessible path. */
export function useTrackingShortcuts({
  onTouchdown,
  onAction,
  onSwitchPossession,
  onUndo,
  readOnly,
  sheetOpen,
}: TrackingShortcutHandlers): void {
  useEffect(() => {
    if (readOnly || sheetOpen) {
      return;
    }

    const onKeyDown = (event: KeyboardEvent): void => {
      if (
        event.defaultPrevented ||
        event.repeat ||
        !window.matchMedia("(min-width: 1280px)").matches ||
        document.querySelector('[role="dialog"]') !== null
      ) {
        return;
      }
      const target = event.target instanceof Element ? event.target : null;
      if (editing(target) || editing(document.activeElement)) {
        return;
      }

      const key = event.key.toLowerCase();
      let handled = true;
      if ((event.ctrlKey || event.metaKey) && key === "z" && !event.shiftKey) {
        onUndo();
      } else if (event.ctrlKey || event.metaKey || event.altKey) {
        return;
      } else if (key === "t") {
        onTouchdown();
      } else if (key === "b") {
        onSwitchPossession();
      } else if (/^[1-8]$/.test(key)) {
        onAction(Number(key) - 1);
      } else {
        handled = false;
      }

      if (handled) {
        event.preventDefault();
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [
    onAction,
    onSwitchPossession,
    onTouchdown,
    onUndo,
    readOnly,
    sheetOpen,
  ]);
}
