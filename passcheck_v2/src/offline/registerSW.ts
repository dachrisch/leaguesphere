export function registerServiceWorker(): void {
  if (!("serviceWorker" in navigator)) return;
  window.addEventListener("load", () => {
    navigator.serviceWorker
      .register("/passcheck/v2/sw.js", { scope: "/passcheck/v2/" })
      .catch(() => undefined);
  });
}
