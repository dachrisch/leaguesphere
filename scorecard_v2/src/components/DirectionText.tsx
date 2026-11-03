/**
 * The two directions the preparation offers; the server stores `Nord`/`Süd`.
 *
 * A football field is played along its long axis, and that axis is
 * north–south — east–west runs across the pitch between the two sidelines.
 * The old app wrote `Ost`/`West`, and the older still `directionLeft`/
 * `directionRight`; both are read back onto the end zone they point at.
 */
export type Direction = "Nord" | "Süd";

/**
 * A stored direction as one of the two end zones, or `null` for "not chosen".
 *
 * The legacy mapping follows the arrow it drew: `directionLeft` (and v2's
 * `Ost`) pointed at the left end, which is `Nord` on the drawn field;
 * `directionRight` (and `West`) pointed right, which is `Süd`.
 */
export function directionFromWire(
  value: string | undefined,
): Direction | null {
  const token = (value ?? "").trim().toLowerCase();
  if (token === "") {
    return null;
  }
  if (token === "nord" || token === "ost" || token === "directionleft") {
    return "Nord";
  }
  if (token === "süd" || token === "sued" || token === "west") {
    return "Süd";
  }
  if (token === "directionright" || token === "arrow_forward") {
    return "Süd";
  }
  return null;
}

/**
 * The direction drawn as an arrow that points at the end zone being attacked:
 * `◀ Nord` on the left of the field, `Süd ▶` on the right.
 *
 * The self-hosted Inter/Barlow latin subsets (and some field devices) have no
 * arrow glyph, which renders as a tofu box — so the arrow is drawn. It is
 * decorative: the button's accessible name is the end zone it names.
 */
export default function DirectionText({ target }: { target: Direction }) {
  const arrow = (
    <svg
      aria-hidden="true"
      className="dirarrow"
      focusable="false"
      viewBox="0 0 16 8"
    >
      <path
        d={
          target === "Nord"
            ? "M15.5 4h-14M4.5 1L1 4l3.5 3"
            : "M0.5 4h14M11.5 1l3.5 3-3.5 3"
        }
        fill="none"
        stroke="currentColor"
        strokeWidth="1.4"
      />
    </svg>
  );
  return (
    <>
      {target === "Nord" ? (
        <>
          {arrow} Nord
        </>
      ) : (
        <>
          Süd {arrow}
        </>
      )}
    </>
  );
}
