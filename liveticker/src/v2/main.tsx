import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import "@fontsource/inter/400.css";
import "@fontsource/inter/500.css";
import "@fontsource/inter/600.css";
import "@fontsource/barlow-condensed/500.css";
import "@fontsource/barlow-condensed/600.css";
import "@fontsource/barlow-condensed/700.css";

import App from "./App";
import { LivetickerProvider } from "./context/LivetickerContext";
import "./styles.css";

const element = document.getElementById("liveticker-v2-app");
if (!element) {
  throw new Error("Missing #liveticker-v2-app");
}

createRoot(element).render(
  <StrictMode>
    <LivetickerProvider>
      <App />
    </LivetickerProvider>
  </StrictMode>,
);
