import { useEffect, useId, useRef, useState } from "react";

import { useCurrentUser } from "../app/currentUser";
import ThemeToggle from "./ThemeToggle";
import UserAvatar from "./UserAvatar";

interface AccountMenuProps {
  /** Ends the session; omitted where the flow has no logout action. */
  onLogout?: () => void;
}

/**
 * The top bar's only account control: the avatar opens a small menu with the
 * identity, the theme choice and **Abmelden**.
 *
 * The bar is left with back · sync badge · avatar, so the controls that used to
 * crowd it (theme icon, the word "Abmelden") now have room to be readable at
 * 320px. The menu is a non-modal dialog: focus moves onto it when it opens and
 * back to the avatar on Escape or an explicit dismissal, but Tab is not trapped
 * — it is a menu, not a task. A pointer down anywhere outside closes it.
 */
export default function AccountMenu({ onLogout }: AccountMenuProps) {
  const user = useCurrentUser();
  const username = user?.username.trim() ?? "";
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  const titleId = useId();

  useEffect(() => {
    if (!open) {
      return;
    }
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key !== "Escape") {
        return;
      }
      event.stopPropagation();
      setOpen(false);
      trigger.current?.focus();
    };
    const onPointerDown = (event: PointerEvent): void => {
      const target = event.target;
      if (target instanceof Node && !root.current?.contains(target)) {
        setOpen(false);
        // Dismissing with a tap on empty space puts focus back on the avatar;
        // a tap on another control still lets that control take focus.
        trigger.current?.focus();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    document.addEventListener("pointerdown", onPointerDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("pointerdown", onPointerDown);
    };
  }, [open]);

  useEffect(() => {
    if (open) {
      menu.current?.focus();
    }
  }, [open]);

  return (
    <div className="account" ref={root}>
      <button
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-label="Konto"
        className="appbar-btn account-trigger"
        onClick={() => setOpen((current) => !current)}
        ref={trigger}
        title="Konto"
        type="button"
      >
        <UserAvatar />
      </button>

      {open ? (
        <div
          aria-labelledby={titleId}
          aria-modal="false"
          className="accountmenu"
          ref={menu}
          role="dialog"
          tabIndex={-1}
        >
          <p className="accounthead" id={titleId}>
            Konto
          </p>
          <p className="accountname">
            {username === ""
              ? "Nicht angemeldet"
              : `Angemeldet als ${username}`}
          </p>
          <p className="accountlabel">Design</p>
          <ThemeToggle />
          {onLogout === undefined ? null : (
            <button
              className="accountlogout"
              onClick={() => {
                setOpen(false);
                onLogout();
              }}
              type="button"
            >
              Abmelden
            </button>
          )}
        </div>
      ) : null}
    </div>
  );
}
