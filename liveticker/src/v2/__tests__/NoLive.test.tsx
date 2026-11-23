import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { NoLive } from "../components/NoLive";
import { game } from "./fixture";

const next = {
  ...game,
  status: "Geplant",
  scheduled_at: "2026-05-10T13:30:00+02:00",
};

const at = (iso: string) => new Date(iso);

const renderAt = (now: Date) =>
  render(<NoLive next={next} now={now} />).container;

describe("NoLive", () => {
  it("shows the Berlin clock instead of far-off minutes", () => {
    expect(
      renderAt(at("2026-05-10T08:55:00+02:00")).querySelector(".lt-countdown"),
    ).toHaveTextContent("13:30");
  });

  it("counts the minutes when kickoff is within 90 minutes", () => {
    expect(
      renderAt(at("2026-05-10T13:10:00+02:00")).querySelector(".lt-countdown"),
    ).toHaveTextContent("in 20 Min");
  });

  it("reads one minute just after kickoff instead of zero", () => {
    expect(
      renderAt(at("2026-05-10T13:33:00+02:00")).querySelector(".lt-countdown"),
    ).toHaveTextContent("in 1 Min");
  });

  it("marks the game late after five minutes with no countdown", () => {
    const container = renderAt(at("2026-05-10T13:35:00+02:00"));

    expect(container.querySelector(".lt-countdown")).toBeNull();
    expect(container.querySelector(".lt-delayed-badge")).toHaveTextContent(
      "verspätet",
    );
  });
});
