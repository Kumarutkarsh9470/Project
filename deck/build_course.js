// Builds Queue_Course.pptx from deck/course_part*.js.
// Each topic is four slides: PROBLEM (+ predict), WHY IT BREAKS (run + timeline),
// THE FIX (code), CHECK YOURSELF (learned + practice).
// Usage: node build_course.js [out.pptx]
const pptxgen = require("pptxgenjs");
const path = require("path");
const SKILL = process.env.PPTX_SKILL;
const P1 = require("./course_part1.js");
const { extraV4, topics: P1b } = require("./course_part1b.js");
const P2 = require("./course_part2.js");
const P3 = require("./course_part3.js");

const OUT = process.argv[2] || path.join(__dirname, "..", "Queue_Course.pptx");

const THEME = {
  name: "Queue Course", headFontFace: "Cambria", bodyFontFace: "Calibri",
  colors: { dk1: "1B2430", lt1: "FFFFFF", dk2: "13293D", lt2: "EEF2F5",
    accent1: "B4501A", accent2: "0F766E", accent3: "4E5D6C", accent4: "F2C14E",
    accent5: "2E6DA4", accent6: "8A3B12", hlink: "2E6DA4", folHlink: "4E5D6C" },
};
const K = THEME.colors;
const INK = K.dk1, NAVY = K.dk2, PANEL = K.lt2, FAIL = K.accent1, FIX = K.accent2, MUTED = K.accent3,
      GOLD = K.accent4, WHITE = "FFFFFF", SOFT = "D3DCE5", CODEBG = "161C24", CODEFG = "E8E4DA",
      ADD = "6EE7D2", DEL = "FCA5A5", NOTE = "FDF1E8";
const MONO = "Courier New", SANS = "Calibri";
const W = 13.333, H = 7.5, M = 0.6, TOP = 1.55, BOTTOM = 7.0;
const STEPS = ["PROBLEM", "WHY IT BREAKS", "THE FIX", "CHECK YOURSELF"];

const pres = new pptxgen();
pres.layout = "LAYOUT_WIDE";
pres.title = "From a Broken Queue to a Thread Pool";
pres.theme = { headFontFace: THEME.headFontFace, bodyFontFace: THEME.bodyFontFace };
for (const [name, bg, fg, num] of [["LIGHT", WHITE, INK, MUTED], ["DARK", NAVY, WHITE, SOFT]]) {
  pres.defineSlideMaster({
    title: name, background: { color: bg },
    objects: [{ placeholder: { options: { name: "title", type: "title", x: M, y: 0.72, w: W - 2 * M, h: 0.62,
      fontFace: THEME.headFontFace, fontSize: 28, bold: true, color: fg, align: "left", valign: "top", margin: 0 }, text: "" } }],
    slideNumber: { x: W - M - 0.6, y: H - 0.42, w: 0.6, h: 0.25, fontFace: SANS, fontSize: 10, color: num, align: "right" },
  });
}

// ---------------------------------------------------------------- measuring
const glyphs = (s) => s.replace(/▶/g, "►").replace(/◀/g, "◄").replace(/😴/g, "zzz").replace(/✔/g, "ok");
const split = (s) => glyphs(s).split("\n");
const PT = 1 / 72;
// Lines a proportional text needs at width w (Calibri ≈ 0.5 em per character, words kept whole).
function textLines(text, w, size) {
  const per = Math.floor(w / (0.5 * size * PT));
  let n = 0;
  for (const para of String(text).split("\n")) {
    let cur = 0, rows = 1;
    for (const word of para.split(" ")) {
      const L = word.length + 1;
      if (cur + L > per && cur > 0) { rows++; cur = L; } else cur += L;
    }
    n += rows;
  }
  return n;
}
const textH = (text, w, size, ls = 1.18) => textLines(text, w, size) * size * ls * PT + 0.04;
// Monospace size that fits the longest line in w (Courier New: 0.6 em per character).
const monoFit = (ls, w, max) => Math.max(10, Math.min(max, Math.floor(w / (0.6 * PT * Math.max(...ls.map((l) => l.length), 1)))));

// ---------------------------------------------------------------- drawing
const shapeOpts = (fill) => ({ fill: { color: fill }, line: { color: fill } });
function kicker(s, t, dark) {
  s.addText(`${t.ver}  ·  ${t.name}`.toUpperCase(), { x: M, y: 0.32, w: 6, h: 0.3, fontFace: SANS, fontSize: 12,
    bold: true, charSpacing: 1.5, color: dark ? GOLD : FAIL, margin: 0, valign: "middle", isTextBox: true });
}
function tracker(s, idx) {
  const pw = 1.42, gap = 0.08, x0 = W - M - (pw * 4 + gap * 3);
  STEPS.forEach((name, i) => {
    const on = i === idx, x = x0 + i * (pw + gap);
    s.addShape(pres.shapes.ROUNDED_RECTANGLE, { x, y: 0.32, w: pw, h: 0.3, rectRadius: 0.07, ...shapeOpts(on ? INK : PANEL) });
    s.addText(name, { x, y: 0.32, w: pw, h: 0.3, align: "center", valign: "middle", fontFace: SANS, fontSize: 10,
      bold: on, color: on ? WHITE : MUTED, margin: 0, isTextBox: true });
  });
}
// A code/diagram panel sized to its content. Returns its height.
function panel(s, text, x, y, w, o = {}) {
  const ls = split(text), fs = monoFit(ls, w - 0.4, o.max || 15);
  const h = o.h || ls.length * fs * 1.2 * PT + 0.36;
  s.addShape(pres.shapes.ROUNDED_RECTANGLE, { x, y, w, h, rectRadius: 0.08, ...shapeOpts(o.bg || CODEBG) });
  const runs = ls.map((l, i) => {
    let color = o.fg || CODEFG, strike;
    if (o.diff && l.startsWith("+ ")) color = ADD;
    else if (o.diff && l.startsWith("- ")) { color = DEL; strike = "sngStrike"; }
    else if (o.diff) color = "A9B4BF";
    return { text: l.length ? l : " ", options: { color, strike, breakLine: i < ls.length - 1 } };
  });
  s.addText(runs, { x: x + 0.2, y: y + 0.18, w: w - 0.4, h: h - 0.36, fontFace: MONO, fontSize: fs, valign: "top",
    margin: 0, lineSpacingMultiple: 1.0, isTextBox: true });
  return h;
}
function label(s, text, x, y, w, color) {
  s.addText(text, { x, y, w, h: 0.26, fontFace: SANS, fontSize: 12, bold: true, charSpacing: 1.5, color, margin: 0, valign: "middle", isTextBox: true });
  return 0.34;
}
function para(s, text, x, y, w, o = {}) {
  const size = o.size || 16, h = textH(text, w, size);
  s.addText(text, { x, y, w, h, fontFace: SANS, fontSize: size, color: o.color || INK, bold: o.bold, italic: o.italic,
    valign: "top", margin: 0, lineSpacingMultiple: 1.05, isTextBox: true });
  return h;
}
function box(s, title, titleColor, text, x, y, w, fill, size = 16) {
  const h = textH(text, w - 0.5, size) + 0.66;
  s.addShape(pres.shapes.ROUNDED_RECTANGLE, { x, y, w, h, rectRadius: 0.08, ...shapeOpts(fill) });
  label(s, title, x + 0.25, y + 0.2, w - 0.5, titleColor);
  para(s, text, x + 0.25, y + 0.54, w - 0.5, { size });
  return h;
}
function check(s, y, maxY, where) {
  if (y > maxY + 0.01) console.warn(`overflow ${where}: ${y.toFixed(2)} > ${maxY}`);
}
const add = (master, section) => pres.addSlide({ masterName: master, sectionTitle: section });

// ---------------------------------------------------------------- a topic
function topic(t, section) {
  const LW = 7.4, RX = M + LW + 0.4, RW = W - M - RX;

  // 1 PROBLEM: the situation, the question, a prediction and its answer.
  let s = add("LIGHT", section);
  kicker(s, t, false); tracker(s, 0);
  s.addText(t.problem.title, { placeholder: "title" });
  let y = TOP;
  y += panel(s, t.problem.scene, M, y, LW, { bg: PANEL, fg: INK, max: 15 }) + 0.25;
  y += panel(s, t.predict.code, M, y, LW, { max: 15 });
  check(y, BOTTOM, `${t.id} problem left`);
  let ry = TOP;
  ry += label(s, "THE QUESTION", RX, ry, RW, FAIL);
  ry += para(s, t.problem.question, RX, ry, RW, { size: 18, bold: true }) + 0.25;
  ry += label(s, "PREDICT", RX, ry, RW, FAIL);
  ry += para(s, t.predict.question, RX, ry, RW, { size: 16 }) + 0.3;
  ry += box(s, "ANSWER", FIX, t.predict.answer, RX, ry, RW, PANEL, 15);
  check(ry, BOTTOM, `${t.id} problem right`);
  s.addNotes(`${t.problem.question}\n\n${t.predict.question}`);

  // 2 WHY IT BREAKS: the real run, then the timeline that explains it.
  s = add("LIGHT", section);
  kicker(s, t, false); tracker(s, 1);
  s.addText(t.why.title, { placeholder: "title" });
  const TW = 4.7, TX = M + TW + 0.35, TLW = W - M - TX;
  y = TOP;
  y += label(s, "RUN IT", M, y, TW, MUTED);
  y += panel(s, `$ ${t.breakit.cmd}\n${t.breakit.output}`, M, y, TW, { bg: "0D1117", fg: "CDE8D9", max: 14 }) + 0.2;
  y += para(s, t.breakit.note, M, y, TW, { size: 15 });
  check(y, BOTTOM, `${t.id} why left`);
  ry = TOP;
  ry += label(s, "WHAT HAPPENS, STEP BY STEP", TX, ry, TLW, MUTED);
  ry += panel(s, t.why.timeline, TX, ry, TLW, { bg: PANEL, fg: INK, max: 15 }) + 0.25;
  ry += box(s, "SO", FAIL, t.why.caption, TX, ry, TLW, NOTE, 15);
  check(ry, BOTTOM, `${t.id} why right`);

  // 3 THE FIX: the code change and three steps that explain it.
  s = add("LIGHT", section);
  kicker(s, t, false); tracker(s, 2);
  s.addText(t.solution.title, { placeholder: "title" });
  y = TOP;
  y += label(s, t.solution.file, M, y, LW, MUTED);
  y += panel(s, t.solution.code, M, y, LW + 0.4, { diff: true, max: 15 });
  check(y, BOTTOM, `${t.id} fix code`);
  ry = TOP + 0.34;
  const SX = M + LW + 0.75, SW = W - M - SX;
  t.solution.steps.forEach((st, i) => {
    s.addShape(pres.shapes.OVAL, { x: SX, y: ry, w: 0.4, h: 0.4, ...shapeOpts(FIX) });
    s.addText(String(i + 1), { x: SX, y: ry, w: 0.4, h: 0.4, align: "center", valign: "middle", fontFace: SANS, fontSize: 14, bold: true, color: WHITE, margin: 0, isTextBox: true });
    ry += Math.max(0.45, para(s, st, SX + 0.55, ry + 0.04, SW - 0.55, { size: 16 })) + 0.3;
  });
  check(ry, BOTTOM, `${t.id} fix steps`);

  // 4 CHECK YOURSELF: the one-line lesson, what to explain, and practice with answers.
  s = add("LIGHT", section);
  kicker(s, t, false); tracker(s, 3);
  s.addText("Check yourself", { placeholder: "title" });
  const CW = 4.6, PX = M + CW + 0.45, PW = W - M - PX;
  y = TOP;
  y += box(s, "THE LESSON", FIX, t.learned.key, M, y, CW, PANEL, 17) + 0.3;
  y += label(s, "EXPLAIN WITHOUT LOOKING", M, y, CW, MUTED) + 0.04;
  for (const q of t.learned.explain) {
    s.addShape(pres.shapes.RECTANGLE, { x: M, y: y + 0.05, w: 0.2, h: 0.2, fill: { color: WHITE }, line: { color: FIX, width: 1.25 } });
    y += para(s, q, M + 0.35, y, CW - 0.35, { size: 15 }) + 0.12;
  }
  check(y, BOTTOM, `${t.id} check left`);
  const TYPES = { A: "NUMBERS", B: "TRACE IT", C: "DESIGN" };
  ry = TOP;
  for (const p of t.practice) {
    const qh = textH(p.q, PW - 0.5, 15), ah = textH(p.a, PW - 0.5, 14), h = 0.54 + qh + 0.1 + ah + 0.22;
    s.addShape(pres.shapes.ROUNDED_RECTANGLE, { x: PX, y: ry, w: PW, h, rectRadius: 0.08, fill: { color: WHITE }, line: { color: "D5DDE5", width: 1 } });
    label(s, TYPES[p.type], PX + 0.25, ry + 0.18, 2, FAIL);
    para(s, p.q, PX + 0.25, ry + 0.52, PW - 0.5, { size: 15, bold: true });
    para(s, p.a, PX + 0.25, ry + 0.52 + qh + 0.1, PW - 0.5, { size: 14, color: MUTED });
    ry += h + 0.2;
  }
  check(ry, BOTTOM, `${t.id} practice`);
}

function extraTimeline(t, x, section) {
  const s = add("LIGHT", section);
  kicker(s, t, false); tracker(s, 2);
  s.addText(x.title, { placeholder: "title" });
  panel(s, x.timeline, M, TOP, 7.6, { bg: PANEL, fg: INK, max: 15 });
  label(s, "WHO OWNS THE MUTEX?", 8.65, TOP, 4.08, FIX);
  para(s, x.caption, 8.65, TOP + 0.4, 4.08, { size: 16 });
}

function divider(kick, title, items, section) {
  pres.addSection({ title: section });
  const s = add("DARK", section);
  s.addText(kick, { x: M, y: 2.2, w: 6, h: 0.35, fontFace: SANS, fontSize: 14, bold: true, charSpacing: 2, color: GOLD, margin: 0, isTextBox: true });
  s.addText(title, { x: M, y: 2.7, w: 6.6, h: 1.8, fontFace: THEME.headFontFace, fontSize: 44, bold: true, color: WHITE, valign: "top", margin: 0, isTextBox: true });
  s.addText(items.map((it, i) => ({ text: it, options: { breakLine: i < items.length - 1 } })),
    { x: 7.9, y: 2.2, w: 4.8, h: 3.6, fontFace: MONO, fontSize: 16, color: SOFT, valign: "top", margin: 0, paraSpaceAfter: 8, isTextBox: true });
}

// ---------------------------------------------------------------- the deck
pres.addSection({ title: "Start" });
let s = add("DARK", "Start");
s.addText("From a broken queue\nto a thread pool", { x: M, y: 2.0, w: 11, h: 2.3, fontFace: THEME.headFontFace, fontSize: 56, bold: true, color: WHITE, valign: "top", margin: 0, isTextBox: true });
s.addText("v0 queue → threads → mutex → RAII → condition_variable → load → shutdown → <T> → tasks → pool → futures → atomics → two locks → lock-free → benchmarks",
  { x: M, y: 4.8, w: W - 2 * M, h: 0.7, fontFace: MONO, fontSize: 14, color: SOFT, margin: 0, isTextBox: true });

s = add("LIGHT", "Start");
s.addText("How to use this deck", { placeholder: "title" });
const how = [
  ["PROBLEM", "A situation in our queue. Answer the question and write a prediction before reading the answer."],
  ["WHY IT BREAKS", "Run the real program, then follow the timeline of what the threads did."],
  ["THE FIX", "The concept and the code change it needs. Green lines are added, red removed."],
  ["CHECK YOURSELF", "Explain the questions without looking, then do the three exercises."],
];
how.forEach(([n, d], i) => {
  const x = M + i * 3.1;
  s.addShape(pres.shapes.ROUNDED_RECTANGLE, { x, y: TOP, w: 2.9, h: 0.42, rectRadius: 0.07, ...shapeOpts(INK) });
  s.addText(n, { x, y: TOP, w: 2.9, h: 0.42, align: "center", valign: "middle", fontFace: SANS, fontSize: 13, bold: true, color: WHITE, margin: 0, isTextBox: true });
  para(s, d, x, TOP + 0.6, 2.9, { size: 15 });
});
label(s, "BUILD AND RUN", M, 3.85, 6, MUTED);
panel(s, "# explore bugs\ng++ -std=c++20 -O0 -g -pthread -I../common tests.cpp -o tests\n# measure speed\ng++ -std=c++20 -O2 -pthread -I../common tiny.cpp -o tiny\n# every version, with demos\n./build_all.sh --demos", M, 4.2, 7.4, { max: 15 });
label(s, "WHAT TO STUDY", 8.4, 3.85, 4.3, MUTED);
para(s, "Each version's main file (queue.hpp, later pool.hpp) and its tiny examples. Skip common/.\n\nDon't open the next version early.", 8.4, 4.2, 4.33, { size: 15 });

divider("PART 1  ·  v0–v7", "Build the queue",
  ["v0  ordinary queue", "v1  threads", "v2  mutex", "v3  RAII · interface races", "v4  condition_variable", "v5  load · deadlock", "v6  shutdown", "v7  queue<T>"], "Part 1 · The queue");
for (const t of [...P1, ...P1b]) {
  topic(t, "Part 1 · The queue");
  if (t.id === "v4") extraTimeline(t, extraV4, "Part 1 · The queue");
}
divider("PART 2  ·  v8–v10", "Grow it into a thread pool",
  ["v8   task queue", "v9   thread pool", "v9   real workloads", "v10  futures", "v10  promise · shared_future", "v10  timeouts", "v10  tasks waiting on tasks"], "Part 2 · The pool");
for (const t of P2) topic(t, "Part 2 · The pool");
divider("PART 3  ·  v11–v14", "Take the locks away",
  ["v11  atomics", "v12  two-lock queue", "v13  lock-free SPSC ring", "v14  benchmark harness"], "Part 3 · Faster");
for (const t of P3) topic(t, "Part 3 · Faster");

pres.addSection({ title: "Finish" });
s = add("LIGHT", "Finish");
s.addText("Every tool arrived because something broke", { placeholder: "title" });
const map = [
  ["lost update", "mutex", "v2"], ["forgotten unlock", "lock_guard", "v3"], ["check-then-act", "try_pop", "v3"],
  ["spinning consumer", "condition_variable", "v4"], ["opposite locks", "scoped_lock", "v5"], ["no way to stop", "closed + notify_all", "v6"],
  ["can't copy", "move + optional", "v7"], ["lost result", "future", "v10"], ["nested waits", "wait_helping", "v10"],
  ["contended counter", "atomic", "v11"], ["slow hand-off", "SPSC ring", "v13"], ["one-run numbers", "median + p99", "v14"],
];
map.forEach(([bug, tool, v], i) => {
  const col = i % 3, row = Math.floor(i / 3), cw = (W - 2 * M - 0.5) / 3, x = M + col * (cw + 0.25), y = TOP + row * 1.3;
  s.addShape(pres.shapes.ROUNDED_RECTANGLE, { x, y, w: cw, h: 1.08, rectRadius: 0.08, ...shapeOpts(PANEL) });
  s.addText([{ text: bug, options: { color: MUTED, breakLine: true } }, { text: tool, options: { color: INK, bold: true } }],
    { x: x + 0.25, y: y + 0.14, w: cw - 1.0, h: 0.8, fontFace: SANS, fontSize: 16, valign: "middle", margin: 0, isTextBox: true });
  s.addText(v, { x: x + cw - 0.8, y: y + 0.14, w: 0.55, h: 0.8, fontFace: MONO, fontSize: 14, bold: true, color: FAIL, align: "right", valign: "middle", margin: 0, isTextBox: true });
});

(async () => {
  await pres.writeFile({ fileName: OUT });
  if (SKILL) {
    const { applyTheme } = require(path.join(SKILL, "scripts/apply_theme.js"));
    await applyTheme(OUT, THEME);
  }
  console.log("wrote", OUT);
})();
