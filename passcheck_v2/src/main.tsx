import React from "react";
import ReactDOM from "react-dom/client";

import App from "./App";
import "./App.css";
import { registerServiceWorker } from "./offline/registerSW";
import { flushOutbox } from "./offline/sync";

if (import.meta.env.PROD) {
  registerServiceWorker();
}
window.addEventListener("online", () => {
  void flushOutbox();
});
void flushOutbox();

ReactDOM.createRoot(document.getElementById("passcheck-v2")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
