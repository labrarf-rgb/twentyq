import { useState } from "react";
import { recapRows } from "@/lib/messages";
import { ckb, useGame } from "@/store/game";

/** "Show the questions": every turn so far with the answer given. Lives below the device. */
export function Recap() {
  const view = useGame((s) => s.view);
  const [open, setOpen] = useState(false);
  if (!view || view.entries.length === 0) return null;
  const rows = recapRows(ckb, view);
  return (
    <section className="recap" aria-label="Questions so far">
      <button type="button" className="link" aria-expanded={open} onClick={() => setOpen(!open)}>
        {open ? "Hide the questions" : "Show the questions"}
      </button>
      {open && (
        <ol className="recap-list">
          {rows.map((r) => (
            <li key={r.turn}>
              <span className="eyebrow">Q{r.turn}</span>
              <span className="recap-q">{r.text}</span>
              <span className="recap-a">{r.answer}</span>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
