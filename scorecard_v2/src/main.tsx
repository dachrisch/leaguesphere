import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

// Self-hosted fonts: the field app must render without a network, so no
// Google Fonts CDN. Only the weights app.css uses are shipped, latin subset
// only — the UI is German.
import "@fontsource/barlow-condensed/latin-700.css";
import "@fontsource/barlow-condensed/latin-800.css";
import "@fontsource/inter/latin-400.css";
import "@fontsource/inter/latin-600.css";
import "@fontsource/inter/latin-700.css";

import "./styles/tokens.css";
import "./styles/app.css";
import App from "./App";
import { registerServiceWorker } from "./serviceWorker";

const container = document.getElementById("scorecard-v2-app");

if (container === null) {
  throw new Error("Scorecard v2: #scorecard-v2-app is missing");
}

createRoot(container).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

registerServiceWorker();
