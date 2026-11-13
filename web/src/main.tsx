import { App } from "./containers";
import "./index.css";
import "./overlay.css";
import React, { Suspense } from "react";
import ReactDOM from "react-dom/client";
import { HashRouter } from "react-router-dom";

if (window.exileOverlay) document.documentElement.dataset.overlay = "";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <HashRouter>
      <Suspense>
        <App />
      </Suspense>
    </HashRouter>
  </React.StrictMode>,
);
