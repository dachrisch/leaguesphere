import type { ComponentType } from "react";

import {
  ArrowRight,
  Football,
  Pause,
  Shield,
  SwapArrows,
  Whistle,
  type IconProps,
} from "../icons";
import Sheet from "./Sheet";

/** The entries the board keeps out of the six primary tiles. */
export type MorePick =
  | "first"
  | "turnover"
  | "challenge"
  | "fieldpos"
  | "safety"
  | "overtime"
  | "touchdown";

const ITEMS: {
  pick: MorePick;
  label: string;
  Icon: ComponentType<IconProps>;
}[] = [
  { pick: "turnover", label: "Turnover", Icon: SwapArrows },
  { pick: "first", label: "1st Down", Icon: ArrowRight },
  { pick: "safety", label: "Safety", Icon: Shield },
  { pick: "overtime", label: "Overtime", Icon: Pause },
  { pick: "challenge", label: "Challenge", Icon: Whistle },
  { pick: "fieldpos", label: "Feldposition", Icon: Football },
  { pick: "touchdown", label: "Touchdown (Kurzform)", Icon: Football },
];

/**
 * **Mehr**: the entries that are not one of the six primary tiles.
 *
 * The board keeps Pass/Run/Sack/Interception/Strafe/Spielzeit one tap away;
 * a turnover, a first down by hand, a challenge, a safety, overtime, the spot
 * and the short-form touchdown live here, one extra tap deep. Each row opens
 * the same sheet the old tile did.
 */
export default function MoreMenuSheet({
  disabled = false,
  onClose,
  onPick,
}: {
  disabled?: boolean;
  onClose: () => void;
  onPick: (pick: MorePick) => void;
}) {
  return (
    <Sheet onClose={onClose} title="Mehr">
      <p className="sheetnote">
        Weitere Einträge. Pass, Run, Sack, Interception, Strafe und Spielzeit
        stehen direkt auf dem Spielfeld.
      </p>
      <div className="action-grid">
        {ITEMS.map(({ pick, label, Icon }) => (
          <button
            className="action"
            disabled={disabled}
            key={pick}
            onClick={() => onPick(pick)}
            type="button"
          >
            <Icon className="action-icon" size={20} />
            <span>{label}</span>
          </button>
        ))}
      </div>
    </Sheet>
  );
}
