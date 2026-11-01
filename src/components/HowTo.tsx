import { useEffect, useRef } from "react";

export function HowTo({ open, onClose }: { open: boolean; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);

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
          <li>I start by asking what kind of thing it is, one kind at a time. YES picks it, NO moves on to the next:</li>
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
        <p className="keys">Everything runs on this page. No account, no network, nothing saved but your own stats.</p>
        <button type="button" className="btn" onClick={onClose}>
          Close
        </button>
      </div>
    </dialog>
  );
}
