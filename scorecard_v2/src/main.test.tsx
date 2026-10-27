import "@testing-library/jest-dom/vitest";
import { act, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { registerServiceWorker } = vi.hoisted(() => ({
  registerServiceWorker: vi.fn(),
}));

/** Every root `main.tsx` creates, so the test can unmount it again. */
const { roots } = vi.hoisted(() => ({
  roots: [] as { unmount: () => void }[],
}));

// jsdom has no service worker; the mock keeps the mount test from trying.
vi.mock("./serviceWorker", () => ({ registerServiceWorker }));

// `main.tsx` mounts into the real DOM at import time and never unmounts. Left
// running, the app writes state after the test file's jsdom is gone, React then
// renders without a `window` and the whole run turns red at random.
vi.mock("react-dom/client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react-dom/client")>();
  return {
    ...actual,
    createRoot: (container: Element | DocumentFragment) => {
      const root = actual.createRoot(container);
      roots.push(root);
      return root;
    },
  };
});

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

beforeEach(() => {
  vi.resetModules();
  document.body.innerHTML = '<div id="scorecard-v2-app"></div>';
});

afterEach(async () => {
  await act(async () => {
    for (const root of roots.splice(0)) {
      root.unmount();
    }
  });
});

describe("main", () => {
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
