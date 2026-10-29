import { useCurrentUser } from "../app/currentUser";
import { User } from "./icons";
import { initialsOf } from "./initials";

/**
 * The signed-in official as a 28px disc with their initials, or the account
 * glyph when the device boots offline without a user.
 *
 * Decorative on purpose: it sits inside the labelled account-menu trigger, so
 * putting "Angemeldet als …" on the disc as well would announce it twice. The
 * `title` keeps the hover hint.
 */
export default function UserAvatar() {
  const user = useCurrentUser();
  const username = user?.username.trim() ?? "";
  const initials = initialsOf(username);
  const title = username === "" ? "Konto" : `Angemeldet als ${username}`;

  return (
    <span aria-hidden="true" className="avatar" title={title}>
      {initials === "" ? (
        <User className="avatar-icon" size={16} />
      ) : (
        initials
      )}
    </span>
  );
}
