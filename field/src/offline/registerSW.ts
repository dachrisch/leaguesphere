export function registerServiceWorker(): void {
  if (!("serviceWorker" in navigator)) return;
  window.addEventListener("load", () => {
    navigator.serviceWorker
      .register("/field/sw.js", { scope: "/field/" })
      .catch(() => undefined);
  });
}
