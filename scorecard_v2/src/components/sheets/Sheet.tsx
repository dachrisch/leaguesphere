import {
  useEffect,
  useId,
  useRef,
  type KeyboardEvent,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";

import { ApiError } from "../../api/client";

/**
 * Focusable descendants in DOM order. `[tabindex="-1"]` is excluded on
 * purpose: the sheet container itself is focusable that way, and Tab from it
 * should reach the first real control, not loop back to the container.
 */
const FOCUSABLE = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  '[tabindex]:not([tabindex="-1"])',
].join(", ");

/**
 * The server `detail` when there is one, the caller's fallback otherwise.
 *
 * Sheets keep their own error line while they stay open, so every one of them
 * needs the same unwrapping of {@link ApiError}.
 */
export function errorMessage(error: unknown, fallback: string): string {
  if (
    error instanceof ApiError &&
    typeof error.detail === "string" &&
    error.detail.trim() !== ""
  ) {
    return error.detail;
  }
  return fallback;
}

export interface SheetProps {
  /** Sheet heading; also the dialog's accessible name. */
  title: string;
  /** Close request — scrim, the close button and Escape all end up here. */
  onClose: () => void;
  /** Failure shown above the footer; the sheet stays open until it is fixed. */
  error?: string | null;
  /** Sticky footer, one full-width primary action per sheet. */
  footer?: ReactNode;
  children: ReactNode;
}

/**
 * Bottom sheet: a modal dialog anchored to the bottom of the phone.
 *
 * Portalled to `document.body` so the app shell's `overflow: clip` cannot cut
 * it and no ancestor stacking context can hide it. Focus moves into the sheet
 * on open (the dialog itself, which announces its title) and returns to the
 * element that opened it — an official who cancels lands back on the tile they
 * tapped. Escape, a tap on the scrim and the close button all close it; the
 * sheets that write are the only ones that can keep it open.
 */
export default function Sheet({
  title,
  onClose,
  error = null,
  footer,
  children,
}: SheetProps) {
  const titleId = useId();
  const sheet = useRef<HTMLDivElement>(null);
  const restoreTo = useRef<HTMLElement | null>(null);

  useEffect(() => {
    const active = document.activeElement;
    restoreTo.current = active instanceof HTMLElement ? active : null;
    sheet.current?.focus();
    return () => {
      const target = restoreTo.current;
      if (
        target !== null &&
        target !== document.body &&
        target.isConnected
      ) {
        target.focus();
      }
    };
  }, []);

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>): void => {
    if (event.key === "Escape") {
      event.stopPropagation();
      onClose();
      return;
    }
    if (event.key !== "Tab") {
      return;
    }
    const nodes = sheet.current?.querySelectorAll<HTMLElement>(FOCUSABLE);
    if (nodes === undefined || nodes.length === 0) {
      event.preventDefault();
      return;
    }
    const first = nodes[0];
    const last = nodes[nodes.length - 1];
    const active = document.activeElement;
    if (event.shiftKey && (active === first || active === sheet.current)) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && active === last) {
      event.preventDefault();
      first.focus();
    }
  };

  return createPortal(
    <div
      className="sheetoverlay"
      onClick={(event) => {
        // Only the scrim itself: a click inside the sheet bubbles up here too.
        if (event.target === event.currentTarget) {
          onClose();
        }
      }}
    >
      <div
        aria-labelledby={titleId}
        aria-modal="true"
        className="sheet"
        onKeyDown={onKeyDown}
        ref={sheet}
        role="dialog"
        tabIndex={-1}
      >
        <div className="sheethead">
          <h2 className="sheettitle" id={titleId}>
            {title}
          </h2>
          <button className="sheetclose" onClick={onClose} type="button">
            Schließen
          </button>
        </div>
        <div className="sheetbody">
          {children}
          {error === null ? null : (
            <p className="sheeterror" role="alert">
              {error}
            </p>
          )}
        </div>
        {footer === undefined ? null : (
          <div className="sheetfoot">{footer}</div>
        )}
      </div>
    </div>,
    document.body,
  );
}
