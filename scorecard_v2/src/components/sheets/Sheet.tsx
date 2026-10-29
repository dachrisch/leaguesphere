import {
  useEffect,
  useId,
  useRef,
  type KeyboardEvent,
  type PointerEvent,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";

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

export interface SheetProps {
  /** Sheet heading; also the dialog's accessible name. */
  title: string;
  /** Close request — scrim, the close button and Escape all end up here. */
  onClose: () => void;
  /**
   * A write is in flight. Dismissing the sheet now would hide a failure and
   * invite a duplicate score, so Escape, the scrim and the close button are
   * all inert until the write settles.
   */
  busy?: boolean;
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
 * tapped. Escape, a tap on the scrim and the close button all close it, except
 * while {@link SheetProps.busy | busy}.
 *
 * The background cannot scroll while the sheet is open: the app shell is a
 * fixed-height column with its own scrollers, but iOS still moves the page
 * behind a fixed overlay without an explicit lock.
 */
export default function Sheet({
  title,
  onClose,
  busy = false,
  error = null,
  footer,
  children,
}: SheetProps) {
  const titleId = useId();
  const sheet = useRef<HTMLDivElement>(null);
  const restoreTo = useRef<HTMLElement | null>(null);
  /** Element the pointer went down on; a drag must not close the sheet. */
  const pressedOn = useRef<EventTarget | null>(null);

  useEffect(() => {
    const active = document.activeElement;
    restoreTo.current = active instanceof HTMLElement ? active : null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    sheet.current?.focus();
    return () => {
      document.body.style.overflow = previousOverflow;
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
      if (!busy) {
        onClose();
      }
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

  const onScrimPointerDown = (event: PointerEvent<HTMLDivElement>): void => {
    pressedOn.current = event.target;
  };

  const onScrimPointerUp = (event: PointerEvent<HTMLDivElement>): void => {
    // Both ends on the scrim itself: a press started inside the sheet and
    // released outside (or a drag across it) is not a dismissal.
    const startedHere = pressedOn.current === event.currentTarget;
    pressedOn.current = null;
    if (!busy && startedHere && event.target === event.currentTarget) {
      onClose();
    }
  };

  return createPortal(
    <div
      className="sheetoverlay"
      onPointerDown={onScrimPointerDown}
      onPointerUp={onScrimPointerUp}
    >
      <div
        aria-busy={busy}
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
          <button
            aria-disabled={busy}
            className="sheetclose"
            onClick={busy ? undefined : onClose}
            type="button"
          >
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
