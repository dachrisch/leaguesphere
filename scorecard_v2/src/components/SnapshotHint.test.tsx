import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import SnapshotHint, { snapshotLabel } from "./SnapshotHint";

describe("snapshotLabel", () => {
  it("names the moment the snapshot was stored, in local time", () => {
    // Local time on purpose: the official compares it with their own clock.
    const stored = new Date(2026, 9, 26, 14, 5, 0).getTime();

    expect(snapshotLabel(stored)).toBe("Zwischengespeichert · 14:05");
  });
});

describe("SnapshotHint", () => {
  it("renders nothing while the screen shows a fresh answer", () => {
    const { container } = render(<SnapshotHint updatedAt={null} />);

    expect(container).toBeEmptyDOMElement();
  });

  it("marks stored data so it is not mistaken for live data", () => {
    render(<SnapshotHint updatedAt={new Date(2026, 9, 26, 9, 0, 0).getTime()} />);

    expect(
      screen.getByText("Zwischengespeichert · 09:00"),
    ).toBeInTheDocument();
  });
});
