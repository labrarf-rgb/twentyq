import type { CSSProperties } from "react";
import { enabledSlots, modeOf, useGame, type Slot } from "@/store/game";
import { usePrefs } from "@/store/prefs";
import { Lcd } from "./Lcd";

const QUESTION_LABELS = ["UNKNOWN", "NO", "YES", "SOMETIMES"];
const CATEGORY_LABELS = ["ANIMAL", "VEGETABLE", "MINERAL", "OTHER"];
const QUESTION_KEYS = ["U", "N", "Y", "S"];
const CATEGORY_KEYS = ["A", "V", "I", "O"];

/** Centre of each answer button as a percentage of the shell, and its label's tilt. */
const ARC: { x: number; y: number; tilt: number }[] = [
  { x: 22, y: 66.5, tilt: 9 },
  { x: 40.5, y: 71, tilt: 3 },
  { x: 59.5, y: 71, tilt: -3 },
  { x: 78, y: 66.5, tilt: -9 },
];

const at = (x: number, y: number): CSSProperties => ({ "--x": `${x}%`, "--y": `${y}%` }) as CSSProperties;

export function Device() {
  const state = useGame();
  const { press, undo, newGame, flash, history, started } = state;
  const muted = usePrefs((s) => s.muted);
  const toggleMute = usePrefs((s) => s.toggleMute);
  const mode = modeOf(state);
  const enabled = enabledSlots(state);
  const category = mode === "category" && !state.confirming;
  const labels = category ? CATEGORY_LABELS : QUESTION_LABELS;
  const keys = category ? CATEGORY_KEYS : QUESTION_KEYS;
  const canUndo = started && history.length > 0 && !state.confirming;

  return (
    <div className="device" role="group" aria-label="Twenty Q handheld">
      <div className="ridge ridge-1" aria-hidden="true" />
      <div className="ridge ridge-2" aria-hidden="true" />
      <div className="wordmark">Twenty Q</div>
      <Lcd />

      {ARC.map((p, i) => (
        <div className="slot" style={at(p.x, p.y)} key={i}>
          <span className="eyebrow slot-label" style={{ transform: `translateX(-50%) rotate(${p.tilt}deg)` }} aria-hidden="true">
            {labels[i]}
          </span>
          <button
            type="button"
            className={`cap${flash === i ? " is-pressed" : ""}`}
            disabled={!enabled[i]}
            onClick={() => press(i as Slot)}
            aria-label={labels[i][0] + labels[i].slice(1).toLowerCase()}
            aria-keyshortcuts={keys[i]}
          />
        </div>
      ))}

      <button type="button" className="oval" style={at(50, 88.5)} disabled={!canUndo} onClick={undo} aria-keyshortcuts="Backspace Z">
        <span className="eyebrow">Undo</span>
      </button>

      <div className="slot small" style={at(28, 83.5)}>
        <button type="button" className="cap" onClick={newGame} aria-label="New game" aria-keyshortcuts="G" />
        <span className="eyebrow tiny" aria-hidden="true">
          New game
        </span>
      </div>
      <div className="slot small" style={at(72, 83.5)}>
        <button
          type="button"
          className={`cap${muted ? "" : " is-lit"}`}
          onClick={toggleMute}
          aria-label="Sound"
          aria-pressed={!muted}
          aria-keyshortcuts="M"
        />
        <span className="eyebrow tiny" aria-hidden="true">
          Sound
        </span>
      </div>
    </div>
  );
}
