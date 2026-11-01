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
import { useGame } from "./store/game";

// Dev only: lets a browser console (or an automated play-through) read the game state.
if (import.meta.env.DEV) (window as unknown as { __tq: typeof useGame }).__tq = useGame;

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
