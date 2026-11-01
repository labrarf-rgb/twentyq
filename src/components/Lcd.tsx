import { useEffect, useState } from "react";
import { modeOf, useGame } from "@/store/game";
import { Typewriter } from "./Typewriter";

function usePrefersReducedMotion(): boolean {
  const [r, setR] = useState(() => typeof window !== "undefined" && !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches);
  useEffect(() => {
    const mq = window.matchMedia?.("(prefers-reduced-motion: reduce)");
    if (!mq) return;
    const on = () => setR(mq.matches);
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);
  return r;
}

/** The dot-matrix screen: typed messages, "I'm thinking..." and the turn counter. */
export function Lcd() {
  const screen = useGame((s) => s.screen);
  const thinking = useGame((s) => s.thinking);
  const skipTick = useGame((s) => s.skipTick);
  const lcdDone = useGame((s) => s.lcdDone);
  const view = useGame((s) => s.view);
  const mode = useGame((s) => modeOf(s));
  const confirming = useGame((s) => s.confirming);
  const reduced = usePrefersReducedMotion();

  const msg = screen.messages[screen.msgIndex];
  const turn = view?.current?.turn ?? view?.result?.turn;
  const showCounter = !confirming && mode !== "idle" && turn !== undefined;

  return (
    <div className="lcd-bezel">
      <div className="lcd" aria-hidden="true">
        {showCounter && (
          <div className="lcd-counter" aria-hidden="true">
            Q{turn}
          </div>
        )}
        {thinking ? (
          <div className="lcd-text" aria-hidden="true">
            <div className="lcd-lines">
              <div className="lcd-line">
                I&apos;m thinking<span className="dots" />
              </div>
            </div>
          </div>
        ) : (
          <Typewriter
            key={`${screen.key}:${screen.msgIndex}`}
            text={msg.text}
            skipTick={skipTick}
            reduced={reduced}
            onDone={lcdDone}
          />
        )}
      </div>
      <div className="sr-only" aria-live="polite">
        {thinking ? "" : msg.text}
      </div>
    </div>
  );
}
