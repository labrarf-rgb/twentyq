import { recapRows } from "@/lib/messages";
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
