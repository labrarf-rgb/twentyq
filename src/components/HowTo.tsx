import { useEffect, useRef, useState } from "react";
import { clearLog, exportJson, loadLog } from "@/lib/gameLog";

export function HowTo({ open, onClose }: { open: boolean; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);

  const [games, setGames] = useState(0);
  const [confirm, setConfirm] = useState(false);
  const [forgot, setForgot] = useState(false);
  useEffect(() => {
    if (open) {
      setGames(loadLog().length);
      setConfirm(false);
      setForgot(false);
    }
  }, [open]);

  const exportGames = () => {
    const url = URL.createObjectURL(new Blob([exportJson()], { type: "application/json" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = "twentyq-games.json";
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  return (
    <dialog ref={ref} className="sheet" onClose={onClose} onClick={(e) => e.target === ref.current && onClose()} aria-labelledby="how-title">
      <div className="sheet-body">
        <p className="eyebrow">How to play</p>
        <h2 id="how-title">Think of something. I'll try to guess it.</h2>
        <ul>
          <li>Think of an object, an animal, or a plant.</li>
          <li>Answer honestly. I get twenty questions, plus five more if I need them.</li>
          <li>
            <strong>Sometimes</strong> means partly, or it depends.
          </li>
          <li>
            <strong>Unknown</strong> means you don't know, or the question doesn't apply.
          </li>
          <li>When I guess, YES means I'm right and NO means I'm not.</li>
          <li>If I'm stumped, you can tell me what you were thinking of. I learn from the games you finish, and what I learn stays on this device.</li>
          <li>I start by asking whether it is an animal, a vegetable or a mineral. Those count as questions too. YES settles it, NO or Sometimes moves on, and if all three are NO I treat it as something else:</li>
        </ul>
        <dl>
          <dt className="eyebrow">Animal</dt>
          <dd>Any animal, or something mostly made from one (leather, wool, egg).</dd>
          <dt className="eyebrow">Vegetable</dt>
          <dd>A plant, or something made from plants (fruit, bread, wood, paper, cotton).</dd>
          <dt className="eyebrow">Mineral</dt>
          <dd>Non-living, and not from a plant or animal (metal, stone, glass, plastic).</dd>
          <dt className="eyebrow">Other</dt>
          <dd>Places, weather, ideas, and things that don't fit cleanly.</dd>
        </dl>
        <p className="keys">
          Keys: <kbd>U</kbd> <kbd>N</kbd> <kbd>Y</kbd> <kbd>S</kbd> match the buttons left to right,{" "}
          <kbd>Backspace</kbd> or <kbd>Z</kbd> to undo, <kbd>G</kbd> for a new game, <kbd>M</kbd> for sound.
        </p>
        <section className="mine" aria-labelledby="mine-title">
          <p className="eyebrow" id="mine-title">
            Your games
          </p>
          <p className="keys">{games === 0 ? "I haven't learned from any games yet." : `I've learned from ${games} ${games === 1 ? "game" : "games"} on this device.`}</p>
          <div className="mine-actions">
            <button type="button" className="link" onClick={exportGames}>
              Export my games
            </button>
            {!confirm && !forgot && (
              <button type="button" className="link" onClick={() => setConfirm(true)}>
                Forget what I&apos;ve learned
              </button>
            )}
          </div>
          {confirm && (
            <div role="alert">
              <p className="keys">Forget everything I&apos;ve learned from your games? Your stats stay.</p>
              <div className="mine-actions">
                <button
                  type="button"
                  className="link"
                  onClick={() => {
                    clearLog();
                    setGames(0);
                    setConfirm(false);
                    setForgot(true);
                  }}
                >
                  Yes, forget
                </button>
                <button type="button" className="link" onClick={() => setConfirm(false)}>
                  Keep it
                </button>
              </div>
            </div>
          )}
          {forgot && (
            <p className="keys" role="status">
              Forgotten. I'll start fresh from what I came with.
            </p>
          )}
        </section>
        <p className="keys">
          Everything runs on this page. No account, no network. Your stats and the games I learn from are saved on this device only.{" "}
          <a href={`${import.meta.env.BASE_URL}privacy.html`}>Privacy</a>
        </p>
        <button type="button" className="btn" onClick={onClose}>
          Close
        </button>
      </div>
    </dialog>
  );
}
