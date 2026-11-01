import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "@fontsource/dotgothic16/latin-400.css";
import "@fontsource/spectral/latin-300.css";
import "@fontsource/spectral/latin-400.css";
import "@fontsource/hanken-grotesk/latin-400.css";
import "@fontsource/hanken-grotesk/latin-500.css";
import "@fontsource/hanken-grotesk/latin-600.css";
import "./index.css";
import App from "./App";
import { publishLcdAdvance } from "./lib/lcdFont";
import * as messages from "./lib/messages";
import { replay } from "./engine";
import { ckb, useGame } from "./store/game";

void publishLcdAdvance();

// Dev only: lets a browser console (or an automated play-through) read the game state.
if (import.meta.env.DEV) {
  Object.assign(window, { __tq: useGame, __tqDev: { ckb, replay, messages } });
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
