import { useEffect, useState } from "react";
import { Device } from "./components/Device";
import { HowTo } from "./components/HowTo";
import { RecapPanel, RecapToggle, useHasRecap } from "./components/Recap";
import { TeachPanel, useTeachActive } from "./components/TeachPanel";
import { BOTTOM_FIRST, dockSide, placeOverlay, TOP_FIRST, useViewport } from "./lib/placement";
import { ThemeToggle } from "./components/ThemeToggle";
import { statsLine } from "./lib/stats";
import { useGame, type Slot } from "./store/game";
import { usePrefs } from "./store/prefs";

// The keyboard maps only to the physical buttons, left to right.
const KEYS: Record<string, Slot> = { u: 0, n: 1, y: 2, s: 3 };

// Panel sizes tried, largest first. The teach box is about 170px tall with its suggestions.
const TEACH_SIZES = [{ w: 320, h: 170 }];
const RECAP_SIZES = [
  { w: 400, h: 520 },
  { w: 340, h: 360 },
  { w: 300, h: 240 },
];

export default function App() {
  const [howOpen, setHowOpen] = useState(false);
  const [recapOpen, setRecapOpen] = useState(false);
  const [teachOpen, setTeachOpen] = useState(false); // the docked teach box, opened from the info row
  const hasRecap = useHasRecap();
  const stats = useGame((s) => s.stats);
  const muted = usePrefs((s) => s.muted);
  const teachActive = useTeachActive();
  const taught = useGame((s) => s.taught);
  const loggedTs = useGame((s) => s.loggedTs);
  const vp = useViewport();

  // SPECS 11.3: a panel sits in a free corner when there is one. Where there is none, it is docked into
  // the layout (the device shrinks while it is open) and the teach box collapses to a link in the info row.
  const teachPlace = teachActive ? placeOverlay(vp.w, vp.h, TEACH_SIZES, BOTTOM_FIRST) : null;
  const recapShown = hasRecap && recapOpen;
  const recapPlace = recapShown ? placeOverlay(vp.w, vp.h, RECAP_SIZES, TOP_FIRST, teachPlace ? [teachPlace.rect] : []) : null;
  const recapDocked = recapShown && !recapPlace;
  // The box collapses to a link when no corner is free. If the recap has to dock, the box docks with it,
  // so the two never overlap.
  const teachDocked = teachActive && (!teachPlace || recapDocked);
  const teachDockShown = teachDocked && (teachOpen || (!!teachPlace && recapDocked));
  const dockShown = recapDocked || teachDockShown;
  const side = dockSide(vp.w, vp.h, recapDocked ? 330 : 200);

  useEffect(() => setTeachOpen(false), [loggedTs]);
  useEffect(() => {
    // After "Thanks. I'll remember that." a docked box closes by itself, so the device grows back.
    if (!taught || !teachActive || !!teachPlace) return;
    const t = setTimeout(() => setTeachOpen(false), 2200);
    return () => clearTimeout(t);
  }, [taught, teachActive, teachPlace]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey || e.repeat || howOpen) return;
      // Typing in a field (the "What were you thinking of?" box) must never reach the device.
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return;
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
        <div className="info">
          <p className="stats" aria-live="polite">
            {statsLine(stats)}
          </p>
          <span className="sound-state" aria-live="polite">
            Sound {muted ? "off" : "on"}
          </span>
          <button type="button" className="link" onClick={() => setHowOpen(true)}>
            How to play
          </button>
          {hasRecap && <RecapToggle open={recapOpen} onToggle={() => setRecapOpen(!recapOpen)} />}
          {teachActive && !teachPlace && !taught && (
            <button type="button" className="link" aria-expanded={teachOpen} onClick={() => setTeachOpen(!teachOpen)}>
              What were you thinking of?
            </button>
          )}
        </div>
        <ThemeToggle />
      </header>
      <main id="device" className={`stage${dockShown && side === "side" ? " has-dock-side" : ""}${dockShown && side === "bottom" ? " has-dock-bottom" : ""}`}>
        <div className="device-wrap">
          <Device />
        </div>
        {dockShown && side === "side" && (
          <aside className="dock dock-side" aria-label="Panels">
            {recapDocked && <RecapPanel />}
            {teachDockShown && <TeachPanel mode={{ kind: "dock" }} />}
          </aside>
        )}
      </main>
      {dockShown && side === "bottom" && (
        <aside className="dock dock-bottom" aria-label="Panels">
          {recapDocked && <RecapPanel />}
          {teachDockShown && <TeachPanel mode={{ kind: "dock" }} />}
        </aside>
      )}
      {recapPlace && <RecapPanel rect={recapPlace.rect} />}
      {teachPlace && !recapDocked && <TeachPanel mode={{ kind: "overlay", rect: teachPlace.rect }} />}
      <HowTo open={howOpen} onClose={() => setHowOpen(false)} />
    </>
  );
}
