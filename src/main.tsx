import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { createAppRuntime } from "./runtime/AppRuntime";
import { RuntimeProvider } from "./runtime/context";

// One runtime per window, constructed outside React so it exists before the
// first render - widget persistence Suspends during render, so anything built in
// an effect would be too late.
const runtime = createAppRuntime();

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <RuntimeProvider runtime={runtime}>
      <App />
    </RuntimeProvider>
  </React.StrictMode>,
);
