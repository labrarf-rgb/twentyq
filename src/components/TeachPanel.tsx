import { useId, useMemo, useState } from "react";
import { resolveLog } from "@/engine";
import { loadLog } from "@/lib/gameLog";
import { cleanName, filterTyping, NAME_MAX, resolveTyped, suggest } from "@/lib/teach";
import { kbBase, useGame } from "@/store/game";

/**
 * v9 (SPECS 11.3): after a stumped game, below the device and never on it, a small box asks what
 * the player was thinking of. It is a page overlay (so the device never changes size) and it never
 * blocks play: YES on the device still starts a new game, and ignoring the box records nothing.
 */
export function TeachPanel() {
  const stumped = useGame((s) => s.view?.result?.outcome === "stumped");
  const taught = useGame((s) => s.taught);
  const loggedTs = useGame((s) => s.loggedTs);
  if (!stumped || loggedTs === null) return null;
  return taught ? (
    <div className="teach-panel" role="status">
      <p className="teach-thanks">Thanks. I&apos;ll remember that.</p>
    </div>
  ) : (
    <TeachForm key={loggedTs} />
  );
}

function TeachForm() {
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
      className="teach-panel"
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
    </form>
  );
}
