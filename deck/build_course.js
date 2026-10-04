// Builds Queue_Course.pptx: one thread-safe queue, fifteen versions, taught as a story.
// Every topic: PROBLEM → PREDICT → BREAK IT → WHY? → SOLUTION → LEARNED → PRACTICE.
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
  name: "Queue Course",
  headFontFace: "Cambria",
  bodyFontFace: "Calibri",
  colors: {
    dk1: "1B2430", lt1: "FFFFFF", dk2: "13293D", lt2: "EEF2F5",
    accent1: "C2571A", accent2: "0F766E", accent3: "5B6B7C", accent4: "F2C14E",
    accent5: "2E6DA4", accent6: "8A3B12", hlink: "2E6DA4", folHlink: "5B6B7C",
  },
};
const K = THEME.colors;
const INK = K.dk1, NAVY = K.dk2, PANEL = K.lt2, FAIL = K.accent1, FIX = K.accent2,
      MUTED = K.accent3, GOLD = K.accent4, CODEBG = "151B23", CODEFG = "E6E1D6",
      ADD = "5EEAD4", DEL = "FCA5A5", WHITE = "FFFFFF", SOFT = "B8C4D0";
const MONO = "Courier New";
const W = 13.333, H = 7.5, M = 0.6;

const STEPS = ["PROBLEM", "PREDICT", "BREAK IT", "WHY?", "SOLUTION", "LEARNED", "PRACTICE"];

const pres = new pptxgen();
pres.layout = "LAYOUT_WIDE";
pres.title = "From a Broken Queue to a Thread Pool";
pres.theme = { headFontFace: THEME.headFontFace, bodyFontFace: THEME.bodyFontFace };

pres.defineSlideMaster({
  title: "LIGHT", background: { color: WHITE },
  objects: [{ placeholder: { options: { name: "title", type: "title", x: M, y: 0.7, w: W - 2 * M, h: 0.8,
    fontFace: THEME.headFontFace, fontSize: 30, bold: true, color: INK, valign: "top", margin: 0 }, text: "" } }],
  slideNumber: { x: W - 1.1, y: H - 0.45, w: 0.6, h: 0.3, fontFace: "Calibri", fontSize: 10, color: MUTED, align: "right" },
});
pres.defineSlideMaster({
  title: "DARK", background: { color: NAVY },
  objects: [{ placeholder: { options: { name: "title", type: "title", x: M, y: 0.7, w: W - 2 * M, h: 0.8,
    fontFace: THEME.headFontFace, fontSize: 30, bold: true, color: WHITE, valign: "top", margin: 0 }, text: "" } }],
  slideNumber: { x: W - 1.1, y: H - 0.45, w: 0.6, h: 0.3, fontFace: "Calibri", fontSize: 10, color: SOFT, align: "right" },
});

// Courier New lacks a few glyphs; map them to ones it has.
const glyphs = (s) => s.replace(/▶/g, "►").replace(/◀/g, "◄").replace(/😴/g, "zzz").replace(/✔/g, "ok");
const lines = (s) => glyphs(s).split("\n");
const maxLen = (ls) => Math.max(...ls.map((l) => l.length));
// Largest monospace size (10-16 pt) that fits w x h inches.
function monoSize(ls, w, h, max = 16) {
  const byW = (w * 72) / (0.6 * Math.max(1, maxLen(ls)));
  const byH = (h * 72) / (1.18 * ls.length);
  return Math.max(9, Math.min(max, Math.floor(Math.min(byW, byH))));
}

function kicker(s, t, dark) {
  s.addText(`${t.ver.toUpperCase()}  ·  ${t.name.toUpperCase()}`, { x: M, y: 0.3, w: 6, h: 0.3, fontFace: "Calibri",
    fontSize: 11, bold: true, charSpacing: 2, color: dark ? GOLD : FAIL, margin: 0, isTextBox: true });
}
// The step tracker is the deck's motif: seven pills, the current one filled.
function tracker(s, idx, dark) {
  const pw = 0.86, gap = 0.06, x0 = W - M - (pw * 7 + gap * 6);
  STEPS.forEach((name, i) => {
    const on = i === idx;
    s.addShape(pres.shapes.ROUNDED_RECTANGLE, { x: x0 + i * (pw + gap), y: 0.28, w: pw, h: 0.3, rectRadius: 0.08,
      fill: { color: on ? (dark ? GOLD : INK) : (dark ? "22405A" : PANEL) }, line: { color: on ? (dark ? GOLD : INK) : (dark ? "22405A" : PANEL) } });
    s.addText(name, { x: x0 + i * (pw + gap), y: 0.28, w: pw, h: 0.3, align: "center", valign: "middle", fontFace: "Calibri",
      fontSize: 8.5, bold: on, color: on ? (dark ? INK : WHITE) : (dark ? SOFT : MUTED), margin: 0, isTextBox: true });
  });
}
function codePanel(s, text, x, y, w, h, opts = {}) {
  const ls = lines(text);
  const fs = monoSize(ls, w - 0.5, h - 0.4, opts.max || 16);
  s.addShape(pres.shapes.ROUNDED_RECTANGLE, { x, y, w, h, rectRadius: 0.1, fill: { color: opts.bg || CODEBG }, line: { color: opts.bg || CODEBG } });
  const runs = ls.map((l, i) => {
    let color = opts.fg || CODEFG, strike;
    if (opts.diff && l.startsWith("+ ")) color = ADD;
    else if (opts.diff && l.startsWith("- ")) { color = DEL; strike = "sngStrike"; }
    else if (opts.diff && l.startsWith("  ")) color = "9AA5B1";
    return { text: l.length ? l : " ", options: { color, strike, breakLine: i < ls.length - 1 } };
  });
  s.addText(runs, { x: x + 0.25, y: y + 0.2, w: w - 0.5, h: h - 0.4, fontFace: MONO, fontSize: fs, valign: "top",
    margin: 0, lineSpacingMultiple: 1.0, isTextBox: true });
}
function label(s, text, x, y, w, color) {
  s.addText(text, { x, y, w, h: 0.3, fontFace: "Calibri", fontSize: 11, bold: true, charSpacing: 2, color, margin: 0, isTextBox: true });
}
function body(s, text, x, y, w, h, o = {}) {
  s.addText(text, { x, y, w, h, fontFace: "Calibri", fontSize: o.size || 16, color: o.color || INK, bold: o.bold,
    italic: o.italic, valign: o.valign || "top", margin: 0, paraSpaceAfter: 6, isTextBox: true });
}
function answerPanel(s, title, text, x, y, w, h) {
  s.addShape(pres.shapes.ROUNDED_RECTANGLE, { x, y, w, h, rectRadius: 0.1, fill: { color: PANEL }, line: { color: PANEL } });
  label(s, title, x + 0.3, y + 0.25, w - 0.6, FIX);
  body(s, text, x + 0.3, y + 0.65, w - 0.6, h - 0.9, { size: 16 });
}

const add = (master, section) => pres.addSlide({ masterName: master, sectionTitle: section });

function topic(t, section) {
  // 1 PROBLEM (dark)
  let s = add("DARK", section);
  kicker(s, t, true); tracker(s, 0, true);
  s.addText(t.problem.title, { placeholder: "title" });
  codePanel(s, t.problem.scene, M, 1.75, 7.2, 4.6, { bg: "0B1A27" });
  label(s, "THE QUESTION", 8.3, 1.85, 4.4, GOLD);
  body(s, t.problem.question, 8.3, 2.25, 4.4, 2.6, { size: 20, color: WHITE });
  body(s, "Stop here. Answer it before you go on.", 8.3, 5.6, 4.4, 0.6, { size: 14, italic: true, color: SOFT });
  s.addNotes(`PROBLEM. ${t.problem.question}`);

  // 2 PREDICT
  s = add("LIGHT", section);
  kicker(s, t, false); tracker(s, 1, false);
  s.addText("Predict before you run", { placeholder: "title" });
  codePanel(s, t.predict.code, M, 1.75, 7.2, 3.3);
  label(s, "YOUR PREDICTION", M, 5.3, 7.2, FAIL);
  body(s, t.predict.question, M, 5.65, 7.2, 1.2, { size: 18, bold: true });
  answerPanel(s, "ANSWER  ·  write yours first", t.predict.answer, 8.2, 1.75, 4.53, 5.1);

  // 3 BREAK IT
  s = add("LIGHT", section);
  kicker(s, t, false); tracker(s, 2, false);
  s.addText("Run it and watch it fail", { placeholder: "title" });
  codePanel(s, `$ ${t.breakit.cmd}\n${t.breakit.output}`, M, 1.75, 7.2, 4.6, { bg: "0D1117", fg: "D1E7DD", max: 18 });
  label(s, "WHAT HAPPENED", 8.2, 1.85, 4.5, FAIL);
  body(s, t.breakit.note, 8.2, 2.25, 4.5, 3.5, { size: 18 });

  // 4 WHY?
  s = add("LIGHT", section);
  kicker(s, t, false); tracker(s, 3, false);
  s.addText(t.why.title, { placeholder: "title" });
  codePanel(s, t.why.timeline, M, 1.7, W - 2 * M, 3.85, { bg: PANEL, fg: INK, max: 17 });
  s.addShape(pres.shapes.ROUNDED_RECTANGLE, { x: M, y: 5.75, w: W - 2 * M, h: 1.15, rectRadius: 0.1, fill: { color: "FBEFE6" }, line: { color: "FBEFE6" } });
  body(s, t.why.caption, M + 0.3, 5.85, W - 2 * M - 0.6, 0.95, { size: 16, valign: "middle" });

  // 5 SOLUTION
  s = add("LIGHT", section);
  kicker(s, t, false); tracker(s, 4, false);
  s.addText(t.solution.title, { placeholder: "title" });
  label(s, t.solution.file, M, 1.65, 7.6, MUTED);
  codePanel(s, t.solution.code, M, 2.0, 7.8, 4.9, { diff: true });
  t.solution.steps.forEach((st, i) => {
    const y = 2.0 + i * 1.62;
    s.addShape(pres.shapes.OVAL, { x: 8.8, y, w: 0.5, h: 0.5, fill: { color: FIX }, line: { color: FIX } });
    s.addText(String(i + 1), { x: 8.8, y, w: 0.5, h: 0.5, align: "center", valign: "middle", fontFace: "Calibri", fontSize: 16, bold: true, color: WHITE, margin: 0, isTextBox: true });
    body(s, st, 9.5, y + 0.02, 3.23, 1.5, { size: 15 });
  });

  // 6 LEARNED (dark)
  s = add("DARK", section);
  kicker(s, t, true); tracker(s, 5, true);
  s.addText("What did we learn?", { placeholder: "title" });
  s.addText(t.learned.key, { x: M, y: 1.75, w: W - 2 * M, h: 1.2, fontFace: THEME.headFontFace, fontSize: 26, italic: true, color: GOLD, valign: "top", margin: 0, isTextBox: true });
  label(s, "CAN YOU EXPLAIN THESE WITHOUT LOOKING?", M, 3.25, 8, SOFT);
  t.learned.explain.forEach((q, i) => {
    const col = i % 2, row = Math.floor(i / 2), x = M + col * 6.1, y = 3.7 + row * 0.85;
    s.addShape(pres.shapes.RECTANGLE, { x, y: y + 0.06, w: 0.26, h: 0.26, fill: { color: NAVY }, line: { color: GOLD, width: 1.25 } });
    body(s, q, x + 0.45, y, 5.4, 0.75, { size: 17, color: WHITE });
  });
  body(s, "If one of these is shaky, go back before moving on.", M, 6.55, 8, 0.4, { size: 13, italic: true, color: SOFT });

  // 7 PRACTICE
  s = add("LIGHT", section);
  kicker(s, t, false); tracker(s, 6, false);
  s.addText("Practice", { placeholder: "title" });
  const TYPES = { A: "A · NUMBERS", B: "B · TRACE IT", C: "C · DESIGN" };
  label(s, "TRY FIRST", 2.3, 1.6, 5, FAIL);
  label(s, "THEN CHECK", 8.3, 1.6, 4, FIX);
  t.practice.forEach((p, i) => {
    const y = 2.0 + i * 1.62;
    s.addShape(pres.shapes.ROUNDED_RECTANGLE, { x: M, y, w: 1.5, h: 0.42, rectRadius: 0.08, fill: { color: INK }, line: { color: INK } });
    s.addText(TYPES[p.type], { x: M, y, w: 1.5, h: 0.42, align: "center", valign: "middle", fontFace: "Calibri", fontSize: 10.5, bold: true, color: WHITE, margin: 0, isTextBox: true });
    body(s, p.q, 2.3, y, 5.7, 1.45, { size: 16 });
    s.addShape(pres.shapes.ROUNDED_RECTANGLE, { x: 8.2, y: y - 0.08, w: 4.53, h: 1.4, rectRadius: 0.08, fill: { color: PANEL }, line: { color: PANEL } });
    body(s, p.a, 8.4, y, 4.15, 1.25, { size: 14, color: INK });
  });
}

function extraTimeline(t, x, section) {
  const s = add("LIGHT", section);
  kicker(s, t, false); tracker(s, 4, false);
  s.addText(x.title, { placeholder: "title" });
  codePanel(s, x.timeline, M, 1.7, 7.9, 5.2, { bg: PANEL, fg: INK, max: 16 });
  label(s, "WHO OWNS THE MUTEX?", 8.9, 1.8, 3.8, FIX);
  body(s, x.caption, 8.9, 2.2, 3.83, 4.5, { size: 17 });
}

function divider(kick, title, sub, items, section) {
  pres.addSection({ title: section });
  const s = add("DARK", section);
  s.addText(kick, { x: M, y: 1.4, w: 8, h: 0.4, fontFace: "Calibri", fontSize: 14, bold: true, charSpacing: 3, color: GOLD, margin: 0, isTextBox: true });
  s.addText(title, { x: M, y: 1.95, w: 7.2, h: 2.2, fontFace: THEME.headFontFace, fontSize: 48, bold: true, color: WHITE, valign: "top", margin: 0, isTextBox: true });
  body(s, sub, M, 4.4, 6.8, 1.4, { size: 20, color: SOFT });
  s.addText(items.map((it, i) => ({ text: it, options: { breakLine: i < items.length - 1 } })),
    { x: 8.4, y: 1.6, w: 4.3, h: 4.8, fontFace: MONO, fontSize: 15, color: SOFT, valign: "top", margin: 0, paraSpaceAfter: 10, isTextBox: true });
}

// ---------------------------------------------------------------- the deck
pres.addSection({ title: "Start" });
let s = add("DARK", "Start");
s.addText("C++ CLUB  ·  CONCURRENCY TRACK", { x: M, y: 0.9, w: 8, h: 0.4, fontFace: "Calibri", fontSize: 14, bold: true, charSpacing: 3, color: GOLD, margin: 0, isTextBox: true });
s.addText("From a broken queue\nto a thread pool", { x: M, y: 1.6, w: 11, h: 2.4, fontFace: THEME.headFontFace, fontSize: 60, bold: true, color: WHITE, valign: "top", margin: 0, isTextBox: true });
body(s, "One queue. Fifteen versions. Every concept arrives because the code breaks without it.", M, 4.2, 9.5, 0.9, { size: 22, color: SOFT });
s.addText("v0 queue → threads → mutex → RAII → condition_variable → load → shutdown → <T> → tasks → pool → futures → atomics → two locks → lock-free → benchmarks",
  { x: M, y: 5.6, w: W - 2 * M, h: 0.8, fontFace: MONO, fontSize: 13, color: SOFT, margin: 0, isTextBox: true });

s = add("LIGHT", "Start");
s.addText("How every topic works", { placeholder: "title" });
const how = [
  ["PROBLEM", "A situation in our queue. No new words yet."],
  ["PREDICT", "Write your guess before running anything."],
  ["BREAK IT", "Run the real program. Watch it fail."],
  ["WHY?", "The exact sequence of events, as a timeline."],
  ["SOLUTION", "Only now: the concept, and the code that uses it."],
  ["LEARNED", "One sentence, and questions to answer without looking."],
  ["PRACTICE", "Numbers, tracing, design. Answers on the right."],
];
how.forEach(([n, d], i) => {
  const x = M + i * 1.74;
  s.addShape(pres.shapes.ROUNDED_RECTANGLE, { x, y: 2.1, w: 1.6, h: 0.55, rectRadius: 0.08, fill: { color: i === 4 ? FIX : INK }, line: { color: i === 4 ? FIX : INK } });
  s.addText(n, { x, y: 2.1, w: 1.6, h: 0.55, align: "center", valign: "middle", fontFace: "Calibri", fontSize: 12, bold: true, color: WHITE, margin: 0, isTextBox: true });
  if (i < 6) s.addText("→", { x: x + 1.58, y: 2.1, w: 0.18, h: 0.55, align: "center", valign: "middle", fontFace: "Calibri", fontSize: 14, color: MUTED, margin: 0, isTextBox: true });
  body(s, d, x, 2.9, 1.6, 1.8, { size: 14 });
});
s.addShape(pres.shapes.ROUNDED_RECTANGLE, { x: M, y: 5.0, w: W - 2 * M, h: 1.6, rectRadius: 0.1, fill: { color: PANEL }, line: { color: PANEL } });
body(s, [
  { text: "The one rule: ", options: { bold: true } },
  { text: "never jump ahead. Don't open the next version or the master code early. Predict, break, understand, then build it yourself. The tracker in the top-right corner shows where you are." },
], M + 0.3, 5.2, W - 2 * M - 0.6, 1.2, { size: 17, valign: "middle" });

s = add("LIGHT", "Start");
s.addText("Your lab bench", { placeholder: "title" });
codePanel(s, `# explore bugs\ng++ -std=c++20 -O0 -g -pthread -I../common tests.cpp -o tests\n\n# measure speed\ng++ -std=c++20 -O2 -pthread -I../common tiny.cpp -o tiny\n\n# everything, with demos\n./build_all.sh --demos`, M, 1.7, 7.6, 3.4);
label(s, "WHAT TO STUDY", 8.7, 1.8, 4, FIX);
body(s, "Each version's main file (queue.hpp, later pool.hpp …) and its tiny examples.\n\nSkip common/: the test macros, stopwatch and thread owner are tools, not lessons.\n\nEach folder's README lists what you'll see when you run it, and why.", 8.7, 2.2, 4.03, 3.6, { size: 16 });
body(s, "GCC 11+, Clang 14+ or MSVC 2022. Explore at -O0, measure at -O2, race-test with 100,000 items per thread.", M, 5.5, 7.6, 1.0, { size: 15, color: MUTED });

divider("PART 1  ·  v0–v7", "Build the queue", "How do threads share one queue safely?",
  ["v0  ordinary queue", "v1  threads", "v2  mutex", "v3  RAII · interface races", "v4  condition_variable", "v5  load · deadlock", "v6  shutdown", "v7  queue<T>"], "Part 1 · The queue");
for (const t of [...P1, ...P1b]) {
  topic(t, "Part 1 · The queue");
  if (t.id === "v4") extraTimeline(t, extraV4, "Part 1 · The queue");
}
divider("PART 2  ·  v8–v10", "Grow it into a thread pool", "How does a caller get work done elsewhere, and get the answer back?",
  ["v8   task queue", "v9   thread pool", "v9   real workloads", "v10  futures", "v10  promise · shared_future", "v10  timeouts", "v10  tasks waiting on tasks"], "Part 2 · The pool");
for (const t of P2) topic(t, "Part 2 · The pool");
divider("PART 3  ·  v11–v14", "Take the locks away", "What does safety cost, and how do we pay less? Then: prove it.",
  ["v11  atomics", "v12  two-lock queue", "v13  lock-free SPSC ring", "v14  benchmark harness"], "Part 3 · Faster");
for (const t of P3) topic(t, "Part 3 · Faster");

pres.addSection({ title: "Finish" });
s = add("DARK", "Finish");
s.addText("Every tool arrived because something broke", { placeholder: "title" });
const map = [
  ["lost update", "mutex", "v2"], ["forgotten unlock", "lock_guard", "v3"], ["check-then-act", "try_pop", "v3"],
  ["spinning consumer", "condition_variable", "v4"], ["opposite locks", "scoped_lock", "v5"], ["no way to stop", "closed + notify_all", "v6"],
  ["can't copy", "move + optional", "v7"], ["lost result", "future", "v10"], ["nested waits", "wait_helping", "v10"],
  ["contended counter", "atomic", "v11"], ["slow hand-off", "SPSC ring", "v13"], ["one-run numbers", "median + p99", "v14"],
];
map.forEach(([bug, tool, v], i) => {
  const col = i % 3, row = Math.floor(i / 3), x = M + col * 4.1, y = 1.8 + row * 1.2;
  s.addShape(pres.shapes.ROUNDED_RECTANGLE, { x, y, w: 3.9, h: 1.0, rectRadius: 0.08, fill: { color: "1D3A52" }, line: { color: "1D3A52" } });
  s.addText([{ text: bug, options: { color: SOFT, breakLine: true } }, { text: `→ ${tool}`, options: { color: WHITE, bold: true } }],
    { x: x + 0.25, y: y + 0.12, w: 2.9, h: 0.8, fontFace: "Calibri", fontSize: 15, valign: "middle", margin: 0, isTextBox: true });
  s.addText(v, { x: x + 3.1, y: y + 0.12, w: 0.6, h: 0.8, fontFace: MONO, fontSize: 13, color: GOLD, align: "right", valign: "middle", margin: 0, isTextBox: true });
});
body(s, "Cover the right-hand side. Can you name the tool for each bug, and why?", M, 6.7, 10, 0.4, { size: 14, italic: true, color: SOFT });

(async () => {
  await pres.writeFile({ fileName: OUT });
  if (SKILL) {
    const { applyTheme } = require(path.join(SKILL, "scripts/apply_theme.js"));
    await applyTheme(OUT, THEME);
  }
  console.log("wrote", OUT);
})();
