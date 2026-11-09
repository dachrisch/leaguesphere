import "@testing-library/jest-dom/vitest";

// jsdom has no matchMedia; the app asks it for the desktop keyboard shortcuts
// and the wide layout. Tests that need a specific answer stub it themselves.
if (typeof window.matchMedia !== "function") {
  window.matchMedia = (query: string) =>
    ({
      matches: false,
      media: query,
      onchange: null,
      addListener: () => undefined,
      removeListener: () => undefined,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
      dispatchEvent: () => false,
    }) as MediaQueryList;
}
