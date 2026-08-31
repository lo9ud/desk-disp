import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { createAppRuntime } from "./runtime/AppRuntime";
import { RuntimeProvider } from "./runtime/context";
import { UiController } from "./ui/UiController";
import { UiProvider } from "./ui/context";

// One runtime per window, constructed outside React so it exists before the
// first render - widget persistence Suspends during render, so anything built in
// an effect would be too late.
const runtime = createAppRuntime();
const ui = new UiController();

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <RuntimeProvider runtime={runtime}>
      <UiProvider controller={ui}>
        <App />
      </UiProvider>
    </RuntimeProvider>
  </React.StrictMode>,
);
