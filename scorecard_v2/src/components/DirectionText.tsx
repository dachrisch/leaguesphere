/** The two directions the preparation offers; the server stores `Ost`/`West`. */
export type Direction = "Ost" | "West";

/**
 * `Ost → West` with the arrow drawn as SVG.
 *
 * The self-hosted Inter/Barlow latin subsets (and some field devices) have no
 * U+2192 glyph, which renders as a tofu box. The arrow is therefore drawn, and
 * the character stays in the accessible text — the summary, the buttons and the
 * start confirmation still read "Ost → West" to screen readers.
 */
export default function DirectionText({
  from,
  to,
}: {
  from: string;
  to: string;
}) {
  return (
    <>
      {from}{" "}
      <svg
        aria-hidden="true"
        className="dirarrow"
        focusable="false"
        viewBox="0 0 16 8"
      >
        <path
          d="M0.5 4h14M11.5 1l3.5 3-3.5 3"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.4"
        />
      </svg>{" "}
      <span className="sr-only">→</span> {to}
    </>
  );
}
