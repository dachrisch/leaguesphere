import { useCurrentUser } from "../app/currentUser";
import { initialsOf } from "./initials";

/**
 * The signed-in official, as a 28px circle with their initials.
 *
 * Display only — it reads the current user from the context, so the header
 * stays prop-free on all six screens. Without a user it renders nothing: a
 * shared device that boots offline shows the bar without a face, not an empty
 * circle.
 */
export default function UserAvatar() {
  const user = useCurrentUser();
  const username = user?.username.trim() ?? "";
  const initials = initialsOf(username);

  if (initials === "") {
    return null;
  }

  const label = `Angemeldet als ${username}`;

  return (
    <span aria-label={label} className="avatar" role="img" title={label}>
      {initials}
    </span>
  );
}
