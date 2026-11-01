/**
 * The LCD font size is "the size at which exactly 24 characters fill a line", so it needs the
 * font's real advance width (SPECS section 7). DotGothic16's Latin glyphs are all 0.5 em today;
 * measure rather than assume, and publish it as --adv for the CSS.
 */
const SAMPLE = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789 .,?!'-";

export async function publishLcdAdvance(): Promise<void> {
  try {
    await document.fonts.load('100px "DotGothic16"');
    const ctx = document.createElement("canvas").getContext("2d");
    if (!ctx) return;
    ctx.font = '100px "DotGothic16"';
    // the widest sample glyph, so 24 of any characters fit
    const adv = Math.max(...[...SAMPLE].map((c) => ctx.measureText(c).width)) / 100;
    if (adv > 0.3 && adv < 1.2) document.documentElement.style.setProperty("--adv", String(adv));
  } catch {
    /* keep the CSS default of 0.5 */
  }
}
