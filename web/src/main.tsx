import { desktop } from "./desktop";
import "./index.css";
import "./overlay.css";
import React, { Suspense } from "react";
import ReactDOM from "react-dom/client";
import { HashRouter } from "react-router-dom";

if (!desktop) throw new Error("Start the standalone app with npm start.");

// Restore preferences before importing atoms that initialize from localStorage.
if (!localStorage.getItem("desktop-storage-migrated")) {
  const previous = await desktop.previousStorage();
  for (const [key, value] of Object.entries(previous)) {
    if (typeof value === "string" && localStorage.getItem(key) === null)
      localStorage.setItem(key, value);
  }
  localStorage.setItem("desktop-storage-migrated", "1");
}
const { App } = await import("./containers");

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <HashRouter>
      <Suspense>
        <App />
      </Suspense>
    </HashRouter>
  </React.StrictMode>,
);
