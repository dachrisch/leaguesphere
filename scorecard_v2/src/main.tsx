import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import App from "./App";

const container = document.getElementById("scorecard-v2-app");

if (container === null) {
  throw new Error("Scorecard v2: #scorecard-v2-app is missing");
}

createRoot(container).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
