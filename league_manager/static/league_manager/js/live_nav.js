/* The site header's ticker entry: LIVE / heute / Liveticker.
 *
 * The state changes slowly (a game starts, the last result lands), so one poll
 * per minute is enough, and only while the tab is visible. The server caches
 * the same answer for 30 s and the response is small. Every failure is
 * swallowed on purpose: the header keeps the server-rendered state and the
 * next tick retries.
 */
(function () {
  "use strict";

  var ENDPOINT = "/liveticker/status/";
  var REFRESH_MS = 60000;

  function paint(nav) {
    document.querySelectorAll("[data-live-nav]").forEach(function (link) {
      link.dataset.state = nav.state;
      link.href = nav.href;
      link.setAttribute("aria-label", nav.aria_label);
      var label = link.querySelector(".ls-ticker__label");
      if (label) {
        label.textContent = nav.label;
      }
    });
  }

  function refresh() {
    if (document.visibilityState !== "visible") {
      return;
    }
    fetch(ENDPOINT, { cache: "no-store", headers: { Accept: "application/json" } })
      .then(function (response) {
        if (!response.ok) {
          throw new Error("liveticker status: " + response.status);
        }
        return response.json();
      })
      .then(paint)
      .catch(function () {
        /* keep the rendered state, retry on the next tick */
      });
  }

  window.setInterval(refresh, REFRESH_MS);
})();
