import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import {
  ArrowRight,
  Auto,
  Check,
  ChevronLeft,
  Clock,
  Flag,
  Football,
  Interception,
  Moon,
  Pause,
  PlusCircle,
  Shield,
  Stopwatch,
  Sun,
  SwapArrows,
  Undo,
  Whistle,
} from "./icons";

const ICONS = {
  ArrowRight,
  Auto,
  Check,
  ChevronLeft,
  Clock,
  Flag,
  Football,
  Interception,
  Moon,
  Pause,
  PlusCircle,
  Shield,
  Stopwatch,
  Sun,
  SwapArrows,
  Undo,
  Whistle,
};

describe("icons", () => {
  it.each(Object.entries(ICONS))(
    "%s renders a decorative, stroke-only SVG",
    (_name, Icon) => {
      const { container } = render(<Icon />);
      const svg = container.querySelector("svg");

      expect(svg).not.toBeNull();
      expect(svg).toHaveAttribute("aria-hidden", "true");
      expect(svg).toHaveAttribute("focusable", "false");
      expect(svg).toHaveAttribute("width", "20");
      expect(svg).toHaveAttribute("height", "20");
      expect(svg).toHaveAttribute("stroke", "currentColor");
      expect(svg).toHaveAttribute("fill", "none");
    },
  );

  it("accepts a size and class", () => {
    const { container } = render(<Football className="big" size={26} />);
    const svg = container.querySelector("svg");

    expect(svg).toHaveAttribute("width", "26");
    expect(svg).toHaveAttribute("height", "26");
    expect(svg).toHaveClass("big");
  });
});
