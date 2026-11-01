import { useEffect, useState } from "react";
import { Device } from "./components/Device";
import { HowTo } from "./components/HowTo";
import { Recap } from "./components/Recap";
import { ThemeToggle } from "./components/ThemeToggle";
import { statsLine } from "./lib/stats";
import { modeOf, useGame, type Slot } from "./store/game";
import { usePrefs } from "./store/prefs";

const QUESTION_KEYS: Record<string, Slot> = { u: 0, n: 1, y: 2, s: 3 };
const CATEGORY_KEYS: Record<string, Slot> = { a: 0, v: 1, i: 2, o: 3, "1": 0, "2": 1, "3": 2, "4": 3 };

export default function App() {
  const [howOpen, setHowOpen] = useState(false);
  const stats = useGame((s) => s.stats);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey || e.repeat || howOpen) return;
      const k = e.key.toLowerCase();
      const g = useGame.getState();
      if (k === "backspace" || k === "z") {
        e.preventDefault();
        g.undo();
      } else if (k === "g") g.newGame();
      else if (k === "m") usePrefs.getState().toggleMute();
      else if (k === "escape") g.cancel();
      else {
        // The category question has its own letters; the answer letters stay off there.
        const cat = modeOf(g) === "category" && !g.confirming;
        const map = cat ? CATEGORY_KEYS : QUESTION_KEYS;
        if (k in map) g.press(map[k]);
      }
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
        <Device />
        <div className="below">
          <p className="stats" aria-live="polite">
            {statsLine(stats)}
          </p>
          <div className="links">
            <button type="button" className="link" onClick={() => setHowOpen(true)}>
              How to play
            </button>
          </div>
          <Recap />
        </div>
      </main>
      <footer className="foot">
        <p>Everything runs on this page. No account, no network, nothing saved but your own stats.</p>
      </footer>
      <HowTo open={howOpen} onClose={() => setHowOpen(false)} />
    </>
  );
}
