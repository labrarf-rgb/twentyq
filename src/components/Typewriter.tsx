import { useEffect, useLayoutEffect, useRef, useState } from "react";

const CHAR_MS = 25; // about 40 characters a second
const SCROLL_MS = 1200; // a new line scrolls in about this often
const VISIBLE_LINES = 3;

interface Props {
  text: string;
  /** Bumped by the store to finish typing at once. */
  skipTick: number;
  reduced: boolean;
  onDone: () => void;
}

/** Break `text` into lines the way the LCD's width wraps it, by measuring a hidden copy. */
function wrap(measure: HTMLElement, text: string): string[] {
  measure.textContent = "";
  const words = text.split(" ");
  const spans = words.map((w, i) => {
    const s = document.createElement("span");
    s.textContent = i < words.length - 1 ? w + " " : w;
    measure.appendChild(s);
    return s;
  });
  const lines: string[] = [];
  let top = Number.NaN;
  spans.forEach((s, i) => {
    if (s.offsetTop !== top) {
      top = s.offsetTop;
      lines.push("");
    }
    lines[lines.length - 1] += words[i] + (i < words.length - 1 ? " " : "");
  });
  return lines.map((l) => l.trimEnd());
}

/**
 * Types `text` onto up to three LCD lines. A longer message scrolls up a line at a time.
 * Reports `onDone` when everything has been typed. Mount it with a `key` per message.
 */
export function Typewriter({ text, skipTick, reduced, onDone }: Props) {
  const box = useRef<HTMLDivElement>(null);
  const measure = useRef<HTMLDivElement>(null);
  const [lines, setLines] = useState<string[] | null>(null);
  const [typed, setTyped] = useState(0); // characters typed, counted across all lines
  const [offset, setOffset] = useState(0); // lines scrolled off the top
  const done = useRef(onDone);
  done.current = onDone;
  const total = lines ? lines.reduce((n, l) => n + l.length, 0) : 0;
  const finishedRef = useRef(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  // Measure on mount, when the text changes, and when the LCD changes size or font.
  useLayoutEffect(() => {
    const m = measure.current;
    const b = box.current;
    if (!m || !b) return;
    const run = () => setLines((old) => {
      const next = wrap(m, text);
      return old && old.join("\n") === next.join("\n") ? old : next;
    });
    run();
    const ro = new ResizeObserver(run);
    ro.observe(b);
    void document.fonts?.ready.then(run);
    return () => ro.disconnect();
  }, [text]);

  // The typing loop.
  useEffect(() => {
    if (!lines) return;
    // Re-measured after finishing (the LCD was resized): show it all, don't retype.
    if (finishedRef.current) {
      setTyped(total);
      setOffset(Math.max(0, lines.length - VISIBLE_LINES));
      return;
    }
    let cancelled = false;
    const starts: number[] = [];
    let acc = 0;
    for (const l of lines) {
      starts.push(acc);
      acc += l.length;
    }
    const lineOf = (n: number) => {
      let i = 0;
      while (i + 1 < lines.length && n >= starts[i + 1]) i++;
      return i;
    };
    const finish = () => {
      if (finishedRef.current) return;
      finishedRef.current = true;
      done.current();
    };
    const step = (n: number) => {
      if (cancelled) return;
      if (n >= total) {
        setTyped(total);
        finish();
        return;
      }
      setTyped(n);
      const li = lineOf(n);
      const enteringLine = n === starts[li] && li >= VISIBLE_LINES;
      const wait = enteringLine ? SCROLL_MS : reduced ? 0 : CHAR_MS;
      if (enteringLine) setOffset(li - VISIBLE_LINES + 1);
      timerRef.current = setTimeout(() => step(n + 1), wait);
    };
    // Under reduced motion a short message appears whole; a long one still pages by line.
    if (reduced && lines.length <= VISIBLE_LINES) {
      setTyped(total);
      finish();
    } else step(0);
    return () => {
      cancelled = true;
      clearTimeout(timerRef.current);
    };
  }, [lines, total, reduced]);

  // A press asks us to finish now.
  const firstTick = useRef(skipTick);
  useEffect(() => {
    if (skipTick === firstTick.current || !lines) return;
    clearTimeout(timerRef.current);
    setTyped(total);
    setOffset(Math.max(0, lines.length - VISIBLE_LINES));
    if (!finishedRef.current) {
      finishedRef.current = true;
      done.current();
    }
  }, [skipTick]); // eslint-disable-line react-hooks/exhaustive-deps

  let used = 0;
  return (
    <div ref={box} className="lcd-text">
      <div ref={measure} className="lcd-measure" aria-hidden="true" />
      <div className="lcd-lines" style={{ transform: `translateY(calc(var(--lcd-line) * -${offset}))` }}>
        {(lines ?? []).map((l, i) => {
          const k = Math.max(0, Math.min(l.length, typed - used));
          used += l.length;
          return (
            <div className="lcd-line" key={i}>
              {l.slice(0, k)}
            </div>
          );
        })}
      </div>
    </div>
  );
}
