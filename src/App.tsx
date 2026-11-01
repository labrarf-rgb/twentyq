import { useEffect, useState } from "react";
import { Device } from "./components/Device";
import { HowTo } from "./components/HowTo";
import { RecapList, RecapToggle, useHasRecap } from "./components/Recap";
import { ThemeToggle } from "./components/ThemeToggle";
import { statsLine } from "./lib/stats";
import { useGame, type Slot } from "./store/game";
import { usePrefs } from "./store/prefs";

// The keyboard maps only to the physical buttons, left to right.
const KEYS: Record<string, Slot> = { u: 0, n: 1, y: 2, s: 3 };

export default function App() {
  const [howOpen, setHowOpen] = useState(false);
  const [recapOpen, setRecapOpen] = useState(false);
  const hasRecap = useHasRecap();
  const stats = useGame((s) => s.stats);
  const muted = usePrefs((s) => s.muted);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey || e.repeat || howOpen) return;
      const k = e.key.toLowerCase();
      const g = useGame.getState();
      if (k === "backspace" || k === "z") {
        e.preventDefault();
        g.undo();
      } else if (k === "g") g.newGame();
      else if (k === "m") {
        g.flashControl("sound");
        usePrefs.getState().toggleMute();
      } else if (k === "escape") g.cancel();
      else if (k in KEYS) g.press(KEYS[k]);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [howOpen]);

  return (
    <>
      <a className="skip-link" href="#device">
        Skip to the game
      </a>
      <header className="topbar">
        <h1 className="eyebrow">Twenty Q</h1>
        <ThemeToggle />
      </header>
      <main id="device" className="stage">
        <div className="device-wrap">
          <Device />
        </div>
        <div className="below">
          <p className="stats" aria-live="polite">
            {statsLine(stats)}
          </p>
          <div className="links">
            <button type="button" className="link" onClick={() => setHowOpen(true)}>
              How to play
            </button>
            {hasRecap && <RecapToggle open={recapOpen} onToggle={() => setRecapOpen(!recapOpen)} />}
            <span className="sound-state" aria-live="polite">
              Sound {muted ? "off" : "on"}
            </span>
          </div>
          {hasRecap && recapOpen && <RecapList />}
        </div>
      </main>
      <footer className="foot">
        <p>Everything runs on this page. No account, no network, nothing saved but your own stats.</p>
      </footer>
      <HowTo open={howOpen} onClose={() => setHowOpen(false)} />
    </>
  );
}
