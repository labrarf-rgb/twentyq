import { recapRows } from "@/lib/messages";
import type { Rect } from "@/lib/placement";
import { ckb, useGame } from "@/store/game";

/** True once there is at least one turn to show. */
export function useHasRecap(): boolean {
  return useGame((s) => (s.view?.entries.length ?? 0) > 0);
}

export function RecapToggle({ open, onToggle }: { open: boolean; onToggle: () => void }) {
  return (
    <button type="button" className="link" aria-expanded={open} onClick={onToggle}>
      {open ? "Hide the questions" : "Show the questions"}
    </button>
  );
}

/** The recap in its panel: a free corner of the page, or docked into the layout. Scrolls inside itself. */
export function RecapPanel({ rect }: { rect?: Rect }) {
  const style = rect ? { left: rect.left, top: rect.top, width: rect.width, maxHeight: rect.height } : undefined;
  return (
    <div className={`recap-panel ${rect ? "overlay" : "docked"}`} style={style}>
      <RecapList />
    </div>
  );
}

/** "Show the questions": every turn so far with the answer given. Scrolls inside itself. */
export function RecapList() {
  const view = useGame((s) => s.view);
  if (!view || view.entries.length === 0) return null;
  const rows = recapRows(ckb, view);
  return (
    <ol className="recap-list" aria-label="Questions so far">
      {rows.map((r) => (
        <li key={r.turn}>
          <span className="eyebrow">Q{r.turn}</span>
          <span className="recap-q">{r.text}</span>
          <span className="recap-a">{r.answer}</span>
        </li>
      ))}
    </ol>
  );
}
