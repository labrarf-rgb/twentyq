// Square-wave blips synthesized with Web Audio. No audio files. The context is created
// on the first user gesture (browsers refuse it earlier).
import { readStore, writeStore } from "@/lib/storage";

export type SfxName = "press" | "question" | "guess" | "win" | "stumped" | "wrong";

/** [frequency Hz, duration ms]; frequency 0 is a rest. */
const SOUNDS: Record<SfxName, [number, number][]> = {
  press: [[880, 25]],
  question: [[660, 60], [990, 60]],
  guess: [[523, 70], [659, 70], [784, 90]],
  win: [[523, 110], [659, 110], [784, 110], [1047, 110], [1319, 260]],
  stumped: [[392, 220], [349, 220], [294, 380]],
  wrong: [[180, 120]],
};

const GAIN = 0.05;
const MUTE_KEY = "twentyq.muted";

let ctx: AudioContext | null = null;
let muted = readStore(MUTE_KEY) === "1";

export function isMuted(): boolean {
  return muted;
}

export function setMuted(m: boolean): void {
  muted = m;
  writeStore(MUTE_KEY, m ? "1" : "0");
}

function context(): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (!ctx) {
    const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return null;
    try {
      ctx = new AC();
    } catch {
      return null;
    }
  }
  if (ctx.state === "suspended") void ctx.resume();
  return ctx;
}

export function play(name: SfxName): void {
  if (muted) return;
  const c = context();
  if (!c) return;
  let t = c.currentTime + 0.005;
  for (const [freq, ms] of SOUNDS[name]) {
    const dur = ms / 1000;
    if (freq > 0) {
      const osc = c.createOscillator();
      const g = c.createGain();
      osc.type = "square";
      osc.frequency.value = freq;
      // short ramps keep the edges from clicking
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(GAIN, t + 0.004);
      g.gain.setValueAtTime(GAIN, t + Math.max(0.004, dur - 0.008));
      g.gain.linearRampToValueAtTime(0, t + dur);
      osc.connect(g).connect(c.destination);
      osc.start(t);
      osc.stop(t + dur + 0.01);
    }
    t += dur;
  }
}
