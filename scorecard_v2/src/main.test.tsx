import { screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

describe("main", () => {
  beforeEach(() => {
    vi.resetModules();
    document.body.innerHTML = '<div id="scorecard-v2-app"></div>';
  });

  it("mounts the app into the Django shell container", async () => {
    await import("./main");

    expect(
      await screen.findByRole("heading", { name: "Meine Spieltage" }),
    ).toBeInTheDocument();
  });
});
