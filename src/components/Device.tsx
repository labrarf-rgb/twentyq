import type { CSSProperties } from "react";
import { useGame, type Slot } from "@/store/game";
import { usePrefs } from "@/store/prefs";
import { Lcd } from "./Lcd";

// Printed on the shell: the buttons and their labels never change, whatever the game is doing.
const LABELS = ["UNKNOWN", "NO", "YES", "SOMETIMES"];
const KEYS = ["U", "N", "Y", "S"];

/** Centre of each answer button as a percentage of the shell (SPECS section 7). */
const ARC: { x: number; y: number }[] = [
  { x: 21.5, y: 62 },
  { x: 40.5, y: 66 },
  { x: 59.5, y: 66 },
  { x: 78.5, y: 62 },
];

const at = (x: number, y: number): CSSProperties => ({ "--x": `${x}%`, "--y": `${y}%` }) as CSSProperties;

export function Device() {
  const press = useGame((s) => s.press);
  const undo = useGame((s) => s.undo);
  const newGame = useGame((s) => s.newGame);
  const flash = useGame((s) => s.flash);
  const toggleMute = usePrefs((s) => s.toggleMute);
  const lit = (c: string) => (flash === c ? " is-pressed" : "");

  return (
    <div className="device" role="group" aria-label="Twenty Q handheld">
      <div className="ridge ridge-1" aria-hidden="true" />
      <div className="ridge ridge-2" aria-hidden="true" />
      <div className="wordmark">Twenty Q</div>
      <Lcd />

      {ARC.map((p, i) => (
        <div className="slot" style={at(p.x, p.y)} key={i}>
          <span className="eyebrow slot-label" aria-hidden="true">
            {LABELS[i]}
          </span>
          <button
            type="button"
            className={`cap${lit(String(i))}`}
            onClick={() => press(i as Slot)}
            aria-label={LABELS[i][0] + LABELS[i].slice(1).toLowerCase()}
            aria-keyshortcuts={KEYS[i]}
          />
        </div>
      ))}

      <button type="button" className={`oval${lit("undo")}`} style={at(50, 84)} onClick={undo} aria-keyshortcuts="Backspace Z">
        <span className="eyebrow">Undo</span>
      </button>

      <div className="slot small" style={at(30, 77.5)}>
        <button type="button" className={`cap${lit("new")}`} onClick={newGame} aria-label="New game" aria-keyshortcuts="G" />
        <span className="eyebrow tiny" aria-hidden="true">
          New game
        </span>
      </div>
      <div className="slot small" style={at(70, 77.5)}>
        <button
          type="button"
          className={`cap${lit("sound")}`}
          onClick={() => {
            useGame.getState().flashControl("sound");
            toggleMute();
          }}
          aria-label="Sound"
          aria-keyshortcuts="M"
        />
        <span className="eyebrow tiny" aria-hidden="true">
          Sound
        </span>
      </div>
    </div>
  );
}
