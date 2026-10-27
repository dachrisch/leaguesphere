import "@testing-library/jest-dom/vitest";
import { screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { registerServiceWorker } = vi.hoisted(() => ({
  registerServiceWorker: vi.fn(),
}));

// jsdom has no service worker; the mock keeps the mount test from trying.
vi.mock("./serviceWorker", () => ({ registerServiceWorker }));

vi.mock("./api/client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./api/client")>();
  return {
    ...actual,
    apiGet: vi.fn((path: string) =>
      path === "/api/gameday/list/"
        ? Promise.resolve([])
        : Promise.resolve({ id: 1, username: "crew" }),
    ),
  };
});

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

  it("refuses to mount into a page without the container", async () => {
    document.body.innerHTML = "";

    await expect(import("./main")).rejects.toThrow(
      "Scorecard v2: #scorecard-v2-app is missing",
    );
  });

  it("registers the service worker", async () => {
    await import("./main");

    expect(registerServiceWorker).toHaveBeenCalled();
  });
});
