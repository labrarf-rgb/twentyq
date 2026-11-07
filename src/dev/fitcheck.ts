// Dev-only fit check: loads the real app in an iframe at each required viewport, pushes every
// string the LCD can show into the real LCD, and asserts the SPECS section 7 rules.
/* eslint-disable @typescript-eslint/no-explicit-any */

const REQUIRED: [number, number][] = [
  [320, 560],
  [375, 667],
  [390, 844],
  [768, 1024],
  [1024, 768],
  [1280, 620],
  [1440, 900],
  [800, 600], // v9: short landscape windows, where the panels have no free corner
  [900, 500],
];
// ?sizes=320x300,500x500 tries other viewports; ?break=1 injects an oversized LCD font to prove the check can fail.
const params = new URLSearchParams(location.search);
const SIZES: [number, number][] = params.get("sizes")
  ? params.get("sizes")!.split(",").map((s) => s.split("x").map(Number) as [number, number])
  : REQUIRED;
const SAFE = 0.44;
const EPS = 0.75; // px of rounding slack

const tick = () =>
  new Promise<void>((r) => {
    const c = new MessageChannel();
    c.port1.onmessage = () => r();
    c.port2.postMessage(0);
  });
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

interface Failure {
  what: string;
  detail: string;
}
interface SizeResult {
  size: string;
  pass: boolean;
  deviceD: number;
  expectedD: number;
  fontPx: number;
  strings: number;
  maxLines: number;
  failures: Failure[];
}

/** Farthest distance from (cx, cy) to any point of a (rounded) rectangle. */
function farthest(rect: DOMRect, radius: number, cx: number, cy: number): number {
  const r = Math.min(radius, rect.width / 2, rect.height / 2);
  const dx = Math.max(Math.abs(rect.left - cx), Math.abs(rect.right - cx));
  const dy = Math.max(Math.abs(rect.top - cy), Math.abs(rect.bottom - cy));
  return Math.hypot(dx - r, dy - r) + r;
}

function radiusOf(win: any, el: Element, rect: DOMRect): number {
  const v = win.getComputedStyle(el).borderTopLeftRadius as string;
  if (v.endsWith("%")) return (parseFloat(v) / 100) * rect.width;
  return parseFloat(v) || 0;
}

function textRect(win: any, el: Element): DOMRect {
  const range = win.document.createRange();
  range.selectNodeContents(el);
  return range.getBoundingClientRect();
}

async function runSize(w: number, h: number): Promise<SizeResult> {
  const failures: Failure[] = [];
  const fail = (what: string, detail: string) => {
    if (failures.length < 12) failures.push({ what, detail });
  };
  const frame = document.createElement("iframe");
  frame.style.cssText = `position:fixed;left:0;top:0;width:${w}px;height:${h}px;border:0;opacity:0;pointer-events:none`;
  frame.src = "/";
  document.body.appendChild(frame);
  await new Promise((r) => (frame.onload = r));
  const win = frame.contentWindow as any;
  for (let i = 0; i < 100 && !(win.__tq && win.__tqDev); i++) await wait(50);
  await win.document.fonts.ready;
  if (params.get("break")) {
    const st = win.document.createElement("style");
    st.textContent = ".lcd { font-size: 8cqw !important; } .device { --d: min(92cqw, 100cqh, 700px) !important; }";
    win.document.head.appendChild(st);
  }
  await wait(250); // let --adv publish and layout settle
  const doc = win.document as Document;
  const st = win.__tq;
  const dev = win.__tqDev;
  const { ckb, messages, compileKB } = dev;
  const kb = ckb.kb;

  // ---- page rules
  const pageRules = (label: string) => {
    const de = doc.documentElement;
    if (de.scrollHeight > win.innerHeight + 1) fail("page scrolls vertically", `${label}: ${de.scrollHeight} > ${win.innerHeight}`);
    if (de.scrollWidth > win.innerWidth + 1) fail("page scrolls horizontally", `${label}: ${de.scrollWidth} > ${win.innerWidth}`);
    const body = doc.body;
    if (body.scrollHeight > win.innerHeight + 1) fail("body scrolls", `${label}: ${body.scrollHeight} > ${win.innerHeight}`);
  };
  pageRules("idle");

  const device = doc.querySelector(".device") as HTMLElement;
  const dr = device.getBoundingClientRect();
  const D = dr.width;
  if (Math.abs(dr.width - dr.height) > 1) fail("device not square", `${dr.width}x${dr.height}`);
  // v5: D = min(94vw, height - header - below-row - 32px, 800px); below-row only exists under 600px wide
  const header = doc.querySelector(".topbar") as HTMLElement;
  const info = doc.querySelector(".info") as HTMLElement;
  const narrow = w < 600;
  const headerH = header.getBoundingClientRect().height;
  const belowH = narrow ? info.getBoundingClientRect().height : 0;
  const expectedD = Math.min(0.94 * w, h - headerH - belowH - 32, 800);
  if (headerH > 48.5) fail("header taller than 48px", `${headerH}`);
  if (narrow && belowH > 48.5) fail("info row taller than 48px", `${belowH}`);
  if (Math.abs(D - expectedD) > 1.5) fail("D does not match the v5 formula", `D=${D.toFixed(1)} expected ${expectedD.toFixed(1)}`);
  if (header.scrollWidth > header.clientWidth + 1) fail("header overflows sideways", `${header.scrollWidth} > ${header.clientWidth}`);
  if (info.scrollHeight > info.clientHeight + 1 || info.scrollWidth > info.clientWidth + 1) fail("info block clipped", `${info.scrollWidth}x${info.scrollHeight} in ${info.clientWidth}x${info.clientHeight}`);
  if (!narrow && info.getBoundingClientRect().bottom > header.getBoundingClientRect().bottom + 0.5) fail("info leaves the header", "");
  if (doc.querySelector(".foot")) fail("page footer still present", "");
  const infoR = info.getBoundingClientRect();
  if (narrow && (infoR.left < -0.5 || infoR.right > w + 0.5 || infoR.bottom > h + 0.5)) fail("info row outside viewport", JSON.stringify(infoR));
  if (dr.top < -0.5 || dr.bottom > h + 0.5 || dr.left < -0.5 || dr.right > w + 0.5) fail("device outside viewport", JSON.stringify(dr));
  if (dr.top < headerH - 0.5 || (narrow && dr.bottom > h - belowH + 0.5)) fail("device overlaps the header or info row", JSON.stringify(dr));
  const cx = dr.left + D / 2;
  const cy = dr.top + D / 2;

  // ---- safe circle (0.44 D) for every control, label, the bezel and the wordmark
  const items: [string, Element, "box" | "text"][] = [];
  items.push(["wordmark", doc.querySelector(".wordmark")!, "text"]);
  items.push(["lcd bezel", doc.querySelector(".lcd-bezel")!, "box"]);
  doc.querySelectorAll(".slot .cap").forEach((e, i) => items.push([`button ${i}`, e, "box"]));
  doc.querySelectorAll(".slot-label, .eyebrow.tiny").forEach((e) => items.push([`label ${e.textContent}`, e, "text"]));
  items.push(["undo", doc.querySelector(".oval")!, "box"]);
  for (const [name, el, kind] of items) {
    const rect = kind === "text" ? textRect(win, el) : el.getBoundingClientRect();
    const rad = kind === "text" ? 0 : radiusOf(win, el, rect);
    const far = farthest(rect, rad, cx, cy);
    if (far > SAFE * D + EPS) fail("outside safe circle", `${name}: ${(far / D).toFixed(4)} D > ${SAFE}`);
  }
  // nothing may overlap the labels' neighbours: buttons vs each other
  const caps = [...doc.querySelectorAll(".slot .cap, .oval")].map((e) => e.getBoundingClientRect());
  for (let i = 0; i < caps.length; i++)
    for (let j = i + 1; j < caps.length; j++) {
      const a = caps[i];
      const b = caps[j];
      if (a.left < b.right - 1 && b.left < a.right - 1 && a.top < b.bottom - 1 && b.top < a.bottom - 1) {
        // bounding boxes of round buttons may overlap at corners; test real centre distance for circles
        const ra = Math.min(a.width, a.height) / 2;
        const rb = Math.min(b.width, b.height) / 2;
        const d = Math.hypot(a.left + a.width / 2 - (b.left + b.width / 2), a.top + a.height / 2 - (b.top + b.height / 2));
        const oval = a.width !== a.height || b.width !== b.height;
        if (!oval && d < ra + rb - 1) fail("buttons overlap", `${i}/${j}`);
        if (oval) fail("button overlaps UNDO", `${i}/${j}`);
      }
    }

  // ---- LCD strings
  const strings: { text: string; long?: boolean }[] = [];
  const add = (t: string, long = false) => strings.push({ text: t, long });
  const fakeView = (current: any, result: any = null, runnerUps: number[] = []) => ({
    current,
    result,
    entries: [],
    weights: new Float64Array(ckb.N).fill(1),
    guessed: new Set(),
    runnerUps,
  });
  kb.questions.forEach((q: any) => add(q.text));
  for (let step = 0; step < 3; step++) for (const m of messages.messagesFor(ckb, fakeView({ turn: step + 1, kind: "category", cat: step }))) add(m.text);
  for (let i = 0; i < kb.things.length; i++) {
    for (const turn of [12, 21]) for (const m of messages.messagesFor(ckb, fakeView({ turn, kind: "guess", thing: i }))) add(m.text);
  }
  // v9: the longest names a player may teach (24 characters, no word over 23) in the guess line and the
  // runner-up line. These are the shapes that wrap worst: one 23-letter word, 12 + 11, and a 3-line shape.
  const learnedNames = ["W".repeat(23), "Wwwwwwwwwwww Wwwwwwwwwww", "a b c d e f g h i j k lm", "Ww-ww'ww-ww'ww-ww'ww-ww", "M".repeat(11) + " " + "M".repeat(12)];
  const lkb = compileKB(
    kb,
    learnedNames.map((name) => ({ ts: 1, kbVersion: "t", outcome: "stumped", turn: 25, turns: [], actual: { name } })),
  );
  learnedNames.forEach((_n, j) => {
    for (const turn of [12, 21]) for (const m of messages.messagesFor(lkb, fakeView({ turn, kind: "guess", thing: lkb.nKb + j }))) add(m.text);
  });
  const learned3 = [0, 1, 2].map((j) => lkb.nKb + j);
  for (const m of messages.messagesFor(lkb, fakeView(null, { outcome: "stumped", turn: 25 }, learned3))) add(m.text, true);
  add(messages.IDLE_MESSAGE.text);
  add(messages.CONFIRM_MESSAGE.text);
  add("I'm thinking...");
  for (const turn of [8, 9, 20, 25]) for (const m of messages.messagesFor(ckb, fakeView(null, { outcome: "win", turn }))) add(m.text);
  // the longest possible runner-up line: the three longest names
  const byLen = kb.things.map((_t: any, i: number) => [i, messages.listPhrases(ckb, [i]).length] as [number, number]).sort((a: any, b: any) => b[1] - a[1]);
  const longest3 = byLen.slice(0, 3).map((x: any) => x[0]);
  for (const m of messages.messagesFor(ckb, fakeView(null, { outcome: "stumped", turn: 25 }, longest3))) add(m.text, true);
  const uniq = new Map<string, { text: string; long?: boolean }>();
  strings.forEach((s) => uniq.set(s.text, s));

  let n = 0;
  let maxLines = 0;
  let fontPx = 0;
  const viewForCounter = fakeView({ turn: 25, kind: "guess", thing: 0 });
  for (const { text, long } of uniq.values()) {
    n++;
    st.setState({
      started: true,
      view: viewForCounter,
      thinking: false,
      confirming: false,
      screen: { key: 1_000_000 + n, messages: [{ text }], msgIndex: 0, typingDone: false },
    });
    let lines: Element[] = [];
    for (let i = 0; i < 200; i++) {
      await tick();
      lines = [...doc.querySelectorAll(".lcd-line")];
      if (lines.length > 0) break;
    }
    st.setState({ skipTick: st.getState().skipTick + 1 }); // finish typing at once
    await tick();
    await tick();
    lines = [...doc.querySelectorAll(".lcd-line")];
    const lcd = doc.querySelector(".lcd") as HTMLElement;
    const box = doc.querySelector(".lcd-text") as HTMLElement;
    const counter = doc.querySelector(".lcd-counter") as HTMLElement;
    const lcdRect = lcd.getBoundingClientRect();
    const boxRect = box.getBoundingClientRect();
    fontPx = parseFloat(win.getComputedStyle(lcd).fontSize);
    maxLines = Math.max(maxLines, lines.length);
    const typed = lines.map((l) => l.textContent).join(" ");
    if (typed.replace(/\s+/g, " ").trim() !== text.replace(/\s+/g, " ").trim()) fail("text not fully shown", `"${text}" -> "${typed}"`);
    if (!long && lines.length > 3) fail("more than 3 lines", `${lines.length} lines: "${text}"`);
    for (const l of lines) {
      const tr = textRect(win, l);
      if (tr.width > boxRect.width + EPS) fail("line too wide", `${tr.width.toFixed(1)} > ${boxRect.width.toFixed(1)}: "${l.textContent}"`);
    }
    // the visible window: lines inside the text box (the last three when it scrolls)
    const visible = lines.filter((l) => {
      const r = l.getBoundingClientRect();
      return r.bottom > boxRect.top + 1 && r.top < boxRect.bottom - 1;
    });
    for (const l of visible) {
      const r = l.getBoundingClientRect();
      if (r.top < boxRect.top - EPS || r.bottom > boxRect.bottom + EPS) fail("line clipped vertically", `"${l.textContent}"`);
    }
    if (boxRect.bottom > lcdRect.bottom + EPS) fail("text box leaves the LCD", text);
    if (boxRect.left < lcdRect.left - EPS || boxRect.right > lcdRect.right + EPS) fail("text box leaves the LCD sideways", text);
    if (counter) {
      const cr = counter.getBoundingClientRect();
      if (cr.bottom > boxRect.top + EPS) fail("counter overlaps text", `${cr.bottom.toFixed(1)} > ${boxRect.top.toFixed(1)}`);
      if (cr.right > lcdRect.right + EPS) fail("counter leaves the LCD", text);
    }
    // 24 characters must fit across one line at this font size
    const chars24 = 24 * parseFloat(win.getComputedStyle(lcd).fontSize) * 0.5;
    if (chars24 > boxRect.width + EPS) fail("24 characters do not fit a line", `${chars24.toFixed(1)} > ${boxRect.width.toFixed(1)}`);
  }

  // ---- panels (SPECS 11.3): the recap and the "What were you thinking of?" box must never cover any part
  // of the device (shell, LCD, buttons, UNDO, NEW GAME, SOUND, labels, wordmark), in any state. Each sits in a
  // free corner of the page (an overlay: D unchanged) or, where there is none, is docked into the layout
  // (D shrinks to the space left, by the same formula). The box collapses to a link in the info row first.
  const hit = (a: DOMRect, b: DOMRect) => a.left < b.right - 0.5 && b.left < a.right - 0.5 && a.top < b.bottom - 0.5 && b.top < a.bottom - 0.5;
  const nearestToCircle = (r: DOMRect, cx2: number, cy2: number) => Math.hypot(Math.max(r.left, Math.min(cx2, r.right)) - cx2, Math.max(r.top, Math.min(cy2, r.bottom)) - cy2);
  const linkNamed = (re: RegExp) => [...doc.querySelectorAll(".link")].find((b) => re.test(b.textContent || "")) as HTMLElement | undefined;
  const settle = async () => {
    await tick();
    await wait(80);
  };
  const assertPanel = (label: string, panel: HTMLElement) => {
    pageRules(label);
    const dev3 = doc.querySelector(".device") as HTMLElement;
    const d3r = dev3.getBoundingClientRect();
    const pr = panel.getBoundingClientRect();
    const docked = panel.classList.contains("docked");
    const wrapR = (doc.querySelector(".device-wrap") as HTMLElement).getBoundingClientRect();
    if (!docked && Math.abs(d3r.width - D) > 0.5) fail("an overlay panel changed D", `${label}: ${D.toFixed(1)} -> ${d3r.width.toFixed(1)}`);
    if (docked) {
      const expect3 = Math.min(0.94 * wrapR.width, wrapR.height - 32, 800);
      if (Math.abs(d3r.width - expect3) > 1.5) fail("docked: D does not match the formula", `${label}: ${d3r.width.toFixed(1)} vs ${expect3.toFixed(1)}`);
      if (d3r.width < 180) fail("docked: the device got too small", `${label}: ${d3r.width.toFixed(1)}`);
    }
    if (pr.left < -0.5 || pr.top < -0.5 || pr.right > w + 0.5 || pr.bottom > h + 0.5) fail("panel outside viewport", `${label}: ${JSON.stringify(pr)}`);
    const hdr = doc.querySelector(".topbar")!.getBoundingClientRect();
    if (pr.top < hdr.bottom - 0.5) fail("panel covers the header", label);
    if (narrow && hit(pr, info.getBoundingClientRect())) fail("panel covers the info row", label);
    // the shell itself: the panel stays clear of the circle, not just of the controls
    if (nearestToCircle(pr, d3r.left + d3r.width / 2, d3r.top + d3r.height / 2) < d3r.width / 2 - 0.5) fail("panel overlaps the shell", `${label}: ${JSON.stringify(pr)}`);
    const covered: [string, Element, boolean][] = [["lcd bezel", doc.querySelector(".lcd-bezel")!, false], ["undo", doc.querySelector(".oval")!, false], ["wordmark", doc.querySelector(".wordmark")!, true]];
    doc.querySelectorAll(".slot .cap").forEach((e, i) => covered.push([`button ${i}`, e, false]));
    doc.querySelectorAll(".slot-label, .eyebrow.tiny").forEach((e) => covered.push([`label ${e.textContent}`, e, true]));
    for (const [name, el, text] of covered) if (hit(pr, text ? textRect(win, el) : el.getBoundingClientRect())) fail("panel covers a device element", `${label}: ${name}`);
    if (panel.scrollWidth > panel.clientWidth + 1 && !panel.classList.contains("recap-panel")) fail("panel clips sideways", label);
  };
  const setInput = (el: HTMLInputElement, v: string) => {
    const setter = Object.getOwnPropertyDescriptor((win as any).HTMLInputElement.prototype, "value")!.set!;
    setter.call(el, v);
    el.dispatchEvent(new (win as any).Event("input", { bubbles: true }));
  };
  const closedChecks = (label: string) => {
    pageRules(label);
    const dd = (doc.querySelector(".device") as HTMLElement).getBoundingClientRect();
    if (Math.abs(dd.width - D) > 0.5) fail("D changed with every panel closed", `${label}: ${D.toFixed(1)} -> ${dd.width.toFixed(1)}`);
    if (info.scrollHeight > info.clientHeight + 1 || info.scrollWidth > info.clientWidth + 1) fail("info block clipped", `${label}: ${info.scrollWidth}x${info.scrollHeight} in ${info.clientWidth}x${info.clientHeight}`);
    if (header.scrollWidth > header.clientWidth + 1) fail("header overflows sideways", label);
    const ir = info.getBoundingClientRect();
    if (ir.height > 48.5) fail("info taller than 48px", `${label}: ${ir.height}`);
  };

  // a finished 25-turn game that was stumped
  const s2 = dev.replay(ckb, 1, ["skip"]);
  while (s2.current) s2.apply(s2.current.kind === "guess" ? "wrong" : "skip");
  st.setState({ started: true, history: s2.entries.map((e: any) => e.answer), view: s2.view(), thinking: false, loggedTs: null, taught: false });
  await settle();
  closedChecks("stumped, no teach box yet");
  const recapToggle = linkNamed(/Show the questions/);
  if (!recapToggle) fail("recap toggle missing", "");
  else {
    recapToggle.click();
    await settle();
    const rp = doc.querySelector(".recap-panel") as HTMLElement | null;
    if (!rp) fail("recap panel missing", "");
    else {
      assertPanel("recap open", rp);
      if (!doc.querySelector(".recap-list")) fail("recap list missing", "");
    }
    recapToggle.click();
    await settle();
    if (doc.querySelector(".recap-panel")) fail("recap panel did not close", "");
    closedChecks("recap closed again");
  }

  // the teach box: collapsed or in a free corner, then open with 5 suggestions, then thanks
  st.setState({ loggedTs: 1, taught: false });
  await settle();
  let box = doc.querySelector(".teach-panel") as HTMLElement | null;
  const teachLink = linkNamed(/What were you thinking of/);
  if (box) {
    if (teachLink) fail("teach box open and its link both shown", "");
    assertPanel("teach box in a free corner", box);
  } else {
    if (!teachLink) fail("no teach box and no link to open it", "");
    else {
      closedChecks("teach box collapsed to the info row link");
      teachLink.click();
      await settle();
      box = doc.querySelector(".teach-panel") as HTMLElement | null;
      if (!box) fail("the link did not open the teach box", "");
      else assertPanel("teach box docked, open", box);
    }
  }
  box = doc.querySelector(".teach-panel") as HTMLElement | null;
  const input = doc.querySelector(".teach-input") as HTMLInputElement | null;
  if (!box || !input) fail("teach input missing", "");
  else {
    if (input.placeholder !== "a dragon") fail("teach placeholder", input.placeholder);
    if (!/Add a, an or the if it needs one\./.test(box.textContent || "")) fail("teach hint missing", "");
    setInput(input, "a");
    await settle();
    box = doc.querySelector(".teach-panel") as HTMLElement;
    const picks = doc.querySelectorAll(".teach-picks .chip").length;
    if (picks !== 5) fail("teach suggestions", `${picks} shown, expected 5`);
    assertPanel("teach box with 5 suggestions", box);
    // recap open together with the box: neither may cover the other or the device
    recapToggle?.click();
    await settle();
    const rp2 = doc.querySelector(".recap-panel") as HTMLElement | null;
    box = doc.querySelector(".teach-panel") as HTMLElement | null;
    if (rp2 && box) {
      assertPanel("recap open with the teach box open", rp2);
      assertPanel("teach box open with the recap open", box);
      if (hit(rp2.getBoundingClientRect(), box.getBoundingClientRect())) fail("recap and teach box overlap", "");
    } else if (rp2 && !box) fail("teach box vanished when the recap opened", "");
    recapToggle?.click();
    await settle();
    setInput(doc.querySelector(".teach-input") as HTMLInputElement, "W".repeat(30));
    await tick();
    if ((doc.querySelector(".teach-input") as HTMLInputElement).value.length > 24) fail("teach input accepts more than 24 characters", "");
    setInput(doc.querySelector(".teach-input") as HTMLInputElement, "<b>dr*ag!on</b>");
    await tick();
    if (/[^A-Za-z0-9 '-]/.test((doc.querySelector(".teach-input") as HTMLInputElement).value)) fail("teach input accepts a disallowed character", "");
  }
  st.setState({ taught: true });
  await settle();
  box = doc.querySelector(".teach-panel") as HTMLElement | null;
  if (box) assertPanel("teach thanks", box);
  await wait(2400); // a docked box closes itself after the thanks
  st.setState({ loggedTs: null, taught: false });
  await settle();
  closedChecks("teach finished");
  frame.remove();
  return { size: `${w}x${h}`, pass: failures.length === 0, deviceD: Math.round(D * 10) / 10, expectedD: Math.round(expectedD * 10) / 10, fontPx: Math.round(fontPx * 100) / 100, strings: uniq.size, maxLines, failures };
}

async function main() {
  const out = document.getElementById("out")!;
  const results: SizeResult[] = [];
  for (const [w, h] of SIZES) {
    document.getElementById("status")!.textContent = `Running ${w}x${h}...`;
    const r = await runSize(w, h);
    results.push(r);
  }
  const all = results.every((r) => r.pass);
  document.getElementById("status")!.innerHTML = `<span class="${all ? "pass" : "fail"}">${all ? "ALL PASS" : "FAILURES"}</span>`;
  out.innerHTML =
    `<table><tr><th>Viewport</th><th>Result</th><th>D (px)</th><th>Expected D</th><th>LCD font (px)</th><th>Strings</th><th>Max lines</th><th>Failures</th></tr>` +
    results
      .map(
        (r) =>
          `<tr><td>${r.size}</td><td class="${r.pass ? "pass" : "fail"}">${r.pass ? "PASS" : "FAIL"}</td><td>${r.deviceD}</td><td>${r.expectedD}</td><td>${r.fontPx}</td><td>${r.strings}</td><td>${r.maxLines}</td><td>${r.failures
            .map((f) => `<pre>${f.what}: ${f.detail.replace(/</g, "&lt;")}</pre>`)
            .join("")}</td></tr>`,
      )
      .join("") +
    `</table>`;
  (window as any).__fitResult = { pass: all, results };
}

void main();
