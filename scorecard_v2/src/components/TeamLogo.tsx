/**
 * A team's logo, or the initials disc when it has none.
 *
 * The directory is optional decoration: the image only appears when the team
 * name is in the lookup (see `api/teams.ts`), and a file the server can no
 * longer serve falls back to the initials instead of showing a broken image —
 * the team directory does not check the file's existence, only the snapshot
 * dump does.
 *
 * The image is `alt=""` on purpose: the team name is always the adjacent text,
 * so a name in `alt` would be read twice.
 *
 * `className` carries the size/shape: the list disc by default,
 * `teamlogo-match` in the preparation card, `teamlogo-crest` on the board.
 */
import { useState } from "react";

import { teamKey } from "../api/teams";
import { useTeamLogos } from "../app/teamLogos";
import { initials } from "./initials";

interface TeamLogoProps {
  /** `Team.name` or `Team.description`; the lookup knows both. */
  name: string | null;
  /** Extra class for the caller's size/shape (e.g. `teamlogo-match`). */
  className?: string;
}

/**
 * The logo URL for a name, plus the guard that drops an image the browser
 * cannot load, so a stale `logo` path falls back to the initials.
 */
function useTeamLogo(name: string | null): {
  src: string | null;
  onError: () => void;
} {
  const logos = useTeamLogos();
  const [broken, setBroken] = useState<string | null>(null);
  const logo = name === null ? "" : (logos.get(teamKey(name)) ?? "");
  return {
    src: logo !== "" && logo !== broken ? logo : null,
    onError: () => setBroken(logo),
  };
}

export default function TeamLogo({ name, className }: TeamLogoProps) {
  const { src, onError } = useTeamLogo(name);
  const classes =
    className === undefined ? "teamlogo" : `teamlogo ${className}`;

  if (src !== null) {
    return (
      <img
        alt=""
        className={`${classes} teamlogo-img`}
        onError={onError}
        src={src}
      />
    );
  }
  return (
    <span aria-hidden="true" className={classes}>
      {initials(name)}
    </span>
  );
}
