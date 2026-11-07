import { useId, useMemo, useState, type CSSProperties } from "react";
import { resolveLog } from "@/engine";
import { loadLog } from "@/lib/gameLog";
import { cleanName, filterTyping, NAME_MAX, resolveTyped, suggest } from "@/lib/teach";
import type { Rect } from "@/lib/placement";
import { kbBase, useGame } from "@/store/game";

/** True on a stumped end screen whose game is still in the log: the box has something to ask. */
export function useTeachActive(): boolean {
  return useGame((s) => s.view?.result?.outcome === "stumped" && s.loggedTs !== null);
}

/** Where the box sits: a free corner of the page (never over the device), or docked into the layout. */
export type TeachMode = { kind: "overlay"; rect: Rect } | { kind: "dock" };

/**
 * v9 (SPECS 11.3): after a stumped game, outside the device and never covering any part of it, a small
 * box asks what the player was thinking of. It never blocks play: YES on the device still starts a new
 * game, and ignoring the box records nothing.
 */
export function TeachPanel({ mode }: { mode: TeachMode }) {
  const active = useTeachActive();
  const taught = useGame((s) => s.taught);
  const loggedTs = useGame((s) => s.loggedTs);
  if (!active) return null;
  const style =
    mode.kind === "overlay" ? { left: mode.rect.left, top: mode.rect.top, width: mode.rect.width } : undefined;
  const cls = `teach-panel ${mode.kind === "overlay" ? "overlay" : "docked"}`;
  return taught ? (
    <div className={cls} style={style} role="status">
      <p className="teach-thanks">Thanks. I&apos;ll remember that.</p>
    </div>
  ) : (
    <TeachForm key={loggedTs} cls={cls} style={style} />
  );
}

function TeachForm({ cls, style }: { cls: string; style?: CSSProperties }) {
  const teach = useGame((s) => s.teach);
  const [text, setText] = useState("");
  const labelId = useId();
  // Names I can offer: the KB, then anything learned so far, read fresh from the log.
  const book = useMemo(() => ({ kb: kbBase, learned: resolveLog(kbBase, loadLog()).learned }), []);
  const picks = useMemo(() => suggest(book, text), [book, text]);
  const ok = cleanName(text) !== null;

  const submit = () => {
    if (!ok) return;
    teach(resolveTyped(book, text));
  };

  return (
    <form
      className={cls}
      style={style}
      aria-labelledby={labelId}
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
    >
      {picks.length > 0 && (
        <ul className="teach-picks" aria-label="Suggestions">
          {picks.map((p) => (
            <li key={p.label}>
              <button type="button" className="chip" onClick={() => teach(p.actual)}>
                {p.label}
              </button>
            </li>
          ))}
        </ul>
      )}
      <label id={labelId} htmlFor={`${labelId}-in`} className="teach-label">
        What were you thinking of?
      </label>
      <div className="teach-row">
        <input
          id={`${labelId}-in`}
          className="teach-input"
          type="text"
          value={text}
          maxLength={NAME_MAX}
          placeholder="a dragon"
          aria-describedby={`${labelId}-hint`}
          autoComplete="off"
          autoCapitalize="off"
          spellCheck={false}
          enterKeyHint="send"
          onChange={(e) => setText(filterTyping(e.target.value))}
          onKeyDown={(e) => e.key === "Escape" && (e.target as HTMLInputElement).blur()}
        />
        <button type="submit" className="btn teach-btn" disabled={!ok}>
          Teach me
        </button>
      </div>
      <p id={`${labelId}-hint`} className="teach-hint">
        Add a, an or the if it needs one.
      </p>
    </form>
  );
}
