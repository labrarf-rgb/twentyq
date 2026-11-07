// Where a page panel (the recap, the "What were you thinking of?" box) may sit without covering any part of
// the device (SPECS 11.3). The device is a circle of diameter D in the middle of the stage, so a panel fits
// in a free corner or band only if its rectangle stays clear of that circle. When nothing fits (short
// landscape windows such as 800x600) the caller docks the panel into the layout instead, and the device
// shrinks to make room while it is open. This mirrors the CSS: D = min(94% of the stage width, stage height
// less 32px, 800px), a 48px header, and on narrow screens a fixed 48px info row.
import { useEffect, useState } from "react";

export interface Rect {
  left: number;
  top: number;
  width: number;
  height: number;
}
export interface Size {
  w: number;
  h: number;
}
export type Corner = "br" | "bl" | "tr" | "tl" | "bottom" | "top";

export const HEADER = 48;
export const INFO_ROW = 48;
export const NARROW_BELOW = 600;
const MARGIN = 12;
const GAP = 8; // clear space between a panel and the shell's edge

export function useViewport(): { w: number; h: number } {
  const read = () => ({ w: typeof window === "undefined" ? 1024 : window.innerWidth, h: typeof window === "undefined" ? 768 : window.innerHeight });
  const [vp, setVp] = useState(read);
  useEffect(() => {
    const on = () => setVp(read());
    window.addEventListener("resize", on);
    return () => window.removeEventListener("resize", on);
  }, []);
  return vp;
}

/** The shell as a circle, for a window of vw x vh with nothing docked. */
export function shell(vw: number, vh: number) {
  const below = vw < NARROW_BELOW ? INFO_ROW : 0;
  const areaH = vh - HEADER - below;
  const d = Math.min(0.94 * vw, areaH - 32, 800);
  return { cx: vw / 2, cy: HEADER + areaH / 2, r: Math.max(0, d / 2) };
}

function hitsCircle(r: Rect, c: { cx: number; cy: number; r: number }, gap: number): boolean {
  const nx = Math.max(r.left, Math.min(c.cx, r.left + r.width));
  const ny = Math.max(r.top, Math.min(c.cy, r.top + r.height));
  return Math.hypot(nx - c.cx, ny - c.cy) < c.r + gap;
}
function hitsRect(a: Rect, b: Rect): boolean {
  return a.left < b.left + b.width && b.left < a.left + a.width && a.top < b.top + b.height && b.top < a.top + a.height;
}

export const BOTTOM_FIRST: Corner[] = ["br", "bl", "tr", "tl", "bottom", "top"];
export const TOP_FIRST: Corner[] = ["tr", "tl", "br", "bl", "top", "bottom"];

/** The first rectangle (largest size first, preferred corner first) that is clear of the shell and of `avoid`. */
export function placeOverlay(vw: number, vh: number, sizes: Size[], prefer: Corner[], avoid: Rect[] = []): { rect: Rect; corner: Corner } | null {
  const c = shell(vw, vh);
  const bottomInset = MARGIN + (vw < NARROW_BELOW ? INFO_ROW : 0);
  const topInset = HEADER + 4;
  for (const s of sizes) {
    const w = Math.min(s.w, vw - 2 * MARGIN);
    const h = s.h;
    if (topInset + h > vh - bottomInset) continue;
    for (const corner of prefer) {
      const bottom = corner === "br" || corner === "bl" || corner === "bottom";
      const left = corner === "bl" || corner === "tl" ? MARGIN : corner === "bottom" || corner === "top" ? (vw - w) / 2 : vw - MARGIN - w;
      const top = bottom ? vh - bottomInset - h : topInset;
      const rect = { left, top, width: w, height: h };
      if (hitsCircle(rect, c, GAP) || avoid.some((a) => hitsRect(rect, a))) continue;
      return { rect, corner };
    }
  }
  return null;
}

/** Docked panels go beside the device or under it, whichever leaves the device larger. `dockH` is the panel's height. */
export const DOCK_SIDE_W = 344;
export function dockSide(vw: number, vh: number, dockH: number): "side" | "bottom" {
  if (vw < NARROW_BELOW) return "bottom";
  const areaH = vh - HEADER;
  const beside = Math.min(0.94 * (vw - DOCK_SIDE_W), areaH - 32, 800);
  const under = Math.min(0.94 * vw, areaH - dockH - 32, 800);
  return beside > under ? "side" : "bottom";
}
