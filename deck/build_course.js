// Builds Queue_Course.pptx from the lesson files (deck/lessons*.js).
// Lessons are a flow of blocks laid out in two columns and continued onto the
// next slide when a column fills, so no slide is left half empty.
// Usage: node build_course.js [out.pptx]
const pptxgen = require("pptxgenjs");
const path = require("path");
const SKILL = process.env.PPTX_SKILL;
const LESSONS = [
  ["Part 1 · The queue", "Part 1", "Building the queue", "v0 to v7", [...require("./lessons1.js"), ...require("./lessons1b.js")]],
  ["Part 2 · The pool", "Part 2", "Growing it into a thread pool", "v8 to v10", require("./lessons2.js")],
  ["Part 3 · Faster", "Part 3", "Taking the locks away", "v11 to v14", require("./lessons3.js")],
];
const OUT = process.argv[2] || path.join(__dirname, "..", "Queue_Course.pptx");

const THEME = {
  name: "Queue Course", headFontFace: "Cambria", bodyFontFace: "Calibri",
  colors: { dk1: "1C2430", lt1: "FFFFFF", dk2: "14283A", lt2: "F1F4F7",
    accent1: "B4501A", accent2: "0F766E", accent3: "55606C", accent4: "E9B44C",
    accent5: "2E6DA4", accent6: "8A3B12", hlink: "2E6DA4", folHlink: "55606C" },
};
const K = THEME.colors;
const INK = K.dk1, NAVY = K.dk2, PANEL = K.lt2, ACCENT = K.accent1, TEAL = K.accent2, MUTED = K.accent3,
      GOLD = K.accent4, WHITE = "FFFFFF", SOFT = "D5DEE7";
const CODE = { bg: "1E2230", fg: "E4E7EE", kw: "C792EA", type: "82AAFF", str: "C3E88D", num: "F78C6C", com: "7F8AA3" };
const TERM = { bg: "0F1419", fg: "B9F2C8", cmd: "FFFFFF" };
const MONO = "Consolas", SANS = "Calibri";
const W = 13.333, H = 7.5, M = 0.55, GAP = 0.45, COLW = (W - 2 * M - GAP) / 2;
const TOP = 1.35, BOTTOM = 7.0, SPACE = 0.16;

const pres = new pptxgen();
pres.layout = "LAYOUT_WIDE";
pres.title = "From a Broken Queue to a Thread Pool";
pres.theme = { headFontFace: THEME.headFontFace, bodyFontFace: THEME.bodyFontFace };
for (const [name, bg, fg, num] of [["LIGHT", WHITE, INK, MUTED], ["DARK", NAVY, WHITE, SOFT]]) {
  pres.defineSlideMaster({
    title: name, background: { color: bg },
    objects: [{ placeholder: { options: { name: "title", type: "title", x: M, y: 0.55, w: W - 2 * M, h: 0.6,
      fontFace: THEME.headFontFace, fontSize: 26, bold: true, color: fg, align: "left", valign: "top", margin: 0 }, text: "" } }],
    slideNumber: { x: W - M - 0.6, y: H - 0.38, w: 0.6, h: 0.24, fontFace: SANS, fontSize: 10, color: num, align: "right" },
  });
}

// ---------------------------------------------------------------- measuring
const PT = 1 / 72;
const BODY = 15, MONO_EM = 0.55, SANS_EM = 0.47;
function wrapCount(text, w, size) {
  const per = Math.max(10, Math.floor(w / (SANS_EM * size * PT)));
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
const textH = (text, w, size) => wrapCount(text, w, size) * size * 1.2 * PT + 0.03;
function monoSize(lines, w) {
  const longest = Math.max(1, ...lines.map((l) => l.length));
  return Math.max(11, Math.min(13, Math.floor((w / (MONO_EM * PT * longest)) * 2) / 2));
}
const monoH = (lines, size) => lines.length * size * 1.18 * PT + 0.3;

// ---------------------------------------------------------------- syntax colouring
const KEYWORDS = new Set(("auto bool break case catch class const constexpr continue default delete do else enum explicit false for " +
  "friend if inline int long mutable namespace new noexcept nullptr operator private protected public return short signed sizeof " +
  "static struct switch template this throw true try typename unsigned using virtual void volatile while double float char").split(" "));
function colourise(line) {
  const out = [];
  const push = (text, color) => { if (text) out.push({ text, color }); };
  const ci = line.indexOf("//");
  let code = line, comment = "";
  if (ci >= 0 && !/"[^"]*\/\/[^"]*"/.test(line)) { code = line.slice(0, ci); comment = line.slice(ci); }
  const re = /("(?:[^"\\]|\\.)*")|(\b\d[\d']*(?:\.\d+)?\w*\b)|(std::\w+|\b[A-Z]\w*\b)|(\b[a-z_]\w*\b)|(\s+)|([^\s\w"]+)/g;
  let m;
  while ((m = re.exec(code))) {
    if (m[1]) push(m[1], CODE.str);
    else if (m[2]) push(m[2], CODE.num);
    else if (m[3]) push(m[3], CODE.type);
    else if (m[4]) push(m[4], KEYWORDS.has(m[4]) ? CODE.kw : CODE.fg);
    else push(m[0], CODE.fg);
  }
  push(comment, CODE.com);
  return out;
}

// ---------------------------------------------------------------- blocks
function measure(b, w) {
  switch (b.t) {
    case "H": return 0.42;
    case "P": return textH(b.text, w, BODY);
    case "A": return textH(b.text, w - 0.5, 16) + 0.26;
    case "J": return textH(b.text, w - 0.5, 14) + 0.62;
    case "F": return 0.32 + b.lines.length * 10 * 1.18 * PT + 0.26;
    case "C": case "D": case "O": {
      const ls = b.text.split("\n");
      return monoH(ls, monoSize(ls, w - 0.4));
    }
    case "Q": return textH(b.q, w, BODY) + 0.08 + textH(b.a, w - 0.4, 14) + 0.44;
  }
}
function draw(s, b, x, y, w) {
  const h = measure(b, w);
  if (b.t === "A") {
    s.addShape(pres.shapes.ROUNDED_RECTANGLE, { x, y, w, h, rectRadius: 0.06, fill: { color: "FBEDE3" }, line: { color: "FBEDE3" } });
    s.addText(b.text, { x: x + 0.25, y: y + 0.15, w: w - 0.5, h: h - 0.3, fontFace: SANS, fontSize: 16, italic: true, bold: true, color: "8A3B12", margin: 0, valign: "top", isTextBox: true });
  } else if (b.t === "J") {
    s.addShape(pres.shapes.ROUNDED_RECTANGLE, { x, y, w, h, rectRadius: 0.06, fill: { color: "E3F2EF" }, line: { color: "E3F2EF" } });
    s.addText("IN OUR PROJECT", { x: x + 0.25, y: y + 0.14, w: w - 0.5, h: 0.26, fontFace: SANS, fontSize: 11, bold: true, charSpacing: 1.5, color: TEAL, margin: 0, valign: "middle", isTextBox: true });
    s.addText(b.text, { x: x + 0.25, y: y + 0.46, w: w - 0.5, h: h - 0.58, fontFace: SANS, fontSize: 14, color: INK, margin: 0, valign: "top", isTextBox: true });
  } else if (b.t === "F") {
    s.addText(b.label, { x, y, w, h: 0.26, fontFace: MONO, fontSize: 11, bold: true, color: ACCENT, margin: 0, valign: "middle", isTextBox: true });
    const py = y + 0.32, ph = h - 0.32;
    s.addShape(pres.shapes.ROUNDED_RECTANGLE, { x, y: py, w, h: ph, rectRadius: 0.05, fill: { color: CODE.bg }, line: { color: CODE.bg } });
    const runs = [];
    b.lines.forEach((l, i) => {
      const parts = colourise(l);
      if (!parts.length) parts.push({ text: " ", color: CODE.fg });
      parts.forEach((p, j) => runs.push({ text: p.text, options: { color: p.color, breakLine: i < b.lines.length - 1 && j === parts.length - 1 } }));
    });
    s.addText(runs, { x: x + 0.12, y: py + 0.13, w: w - 0.2, h: ph - 0.2, fontFace: MONO, fontSize: 10, valign: "top", margin: 0, lineSpacingMultiple: 1.0, isTextBox: true });
  } else if (b.t === "H") {
    s.addText(b.text, { x, y: y + 0.06, w, h: 0.34, fontFace: THEME.headFontFace, fontSize: 18, bold: true, color: ACCENT, margin: 0, valign: "top", isTextBox: true });
  } else if (b.t === "P") {
    s.addText(b.text, { x, y, w, h, fontFace: SANS, fontSize: BODY, color: INK, margin: 0, valign: "top", isTextBox: true });
  } else if (b.t === "Q") {
    const qh = textH(b.q, w, BODY);
    s.addText(b.q, { x, y, w, h: qh, fontFace: SANS, fontSize: BODY, bold: true, color: INK, margin: 0, valign: "top", isTextBox: true });
    const ay = y + qh + 0.08, ah = h - qh - 0.08;
    s.addShape(pres.shapes.ROUNDED_RECTANGLE, { x, y: ay, w, h: ah, rectRadius: 0.06, fill: { color: PANEL }, line: { color: PANEL } });
    s.addText([{ text: "Answer  ", options: { bold: true, color: TEAL } }, { text: b.a, options: { color: INK } }],
      { x: x + 0.2, y: ay + 0.14, w: w - 0.4, h: ah - 0.25, fontFace: SANS, fontSize: 14, margin: 0, valign: "top", isTextBox: true });
  } else {
    const ls = b.text.split("\n"), size = monoSize(ls, w - 0.4);
    const bg = b.t === "C" ? CODE.bg : b.t === "O" ? TERM.bg : PANEL;
    s.addShape(pres.shapes.ROUNDED_RECTANGLE, { x, y, w, h, rectRadius: 0.06, fill: { color: bg }, line: { color: bg } });
    const runs = [];
    ls.forEach((l, i) => {
      const last = i === ls.length - 1;
      let parts;
      if (b.t === "C") parts = colourise(l);
      else if (b.t === "O") parts = [{ text: l, color: l.startsWith("$") ? TERM.cmd : TERM.fg }];
      else parts = [{ text: l, color: INK }];
      if (!parts.length) parts = [{ text: " ", color: CODE.fg }];
      parts.forEach((p, j) => runs.push({ text: p.text, options: { color: p.color, breakLine: !last && j === parts.length - 1 } }));
    });
    s.addText(runs, { x: x + 0.2, y: y + 0.15, w: w - 0.4, h: h - 0.3, fontFace: MONO, fontSize: size, valign: "top",
      margin: 0, lineSpacingMultiple: 1.0, isTextBox: true });
  }
  return h;
}

// ---------------------------------------------------------------- flow layout
function lessonSlides(lesson, section) {
  let s, col, ys;
  const newSlide = () => {
    s = pres.addSlide({ masterName: "LIGHT", sectionTitle: section });
    s.addText(lesson.ver, { x: M, y: 0.25, w: 3, h: 0.28, fontFace: SANS, fontSize: 13, bold: true, color: ACCENT, margin: 0, valign: "middle", isTextBox: true });
    s.addText(lesson.title, { placeholder: "title" });
    col = 0; ys = [TOP, TOP];
  };
  const colX = (c) => M + c * (COLW + GAP);
  const advance = () => { if (col === 0) col = 1; else newSlide(); };
  newSlide();
  const bs = lesson.blocks;
  for (let i = 0; i < bs.length; i++) {
    const b = bs[i];
    const isWide = (x) => x && "CDO".includes(x.t) && Math.max(...x.text.split("\n").map((l) => l.length)) > 58;
    const wide = isWide(b) || (b.t === "H" && isWide(bs[i + 1]));
    if (wide) {
      const w = W - 2 * M;
      let y = col === 0 ? ys[0] : Math.max(ys[0], ys[1]);
      const need = measure(b, w) + (b.t === "H" ? measure(bs[i + 1], w) : 0);
      if (y + need > BOTTOM) { newSlide(); y = TOP; }
      const h = draw(s, b, M, y, w);
      ys = [y + h + SPACE, y + h + SPACE]; col = 0;
      continue;
    }
    if (b.t === "F") {
      const roomOf = () => Math.floor((BOTTOM - ys[col] - 0.58) / (10 * 1.18 * PT));
      if (b.lines.length > roomOf() && roomOf() < 8) advance();
      const room = roomOf();
      if (b.lines.length > room) {
        const cut = b.lines.length - room < 6 ? b.lines.length - 6 : room;
        bs.splice(i + 1, 0, { t: "F", label: `${b.label.replace(" (continued)", "")} (continued)`, lines: b.lines.slice(cut) });
        b.lines = b.lines.slice(0, cut);
      }
    }
    let need = measure(b, COLW);
    if ((b.t === "H" || b.t === "A") && bs[i + 1]) need += SPACE + measure(bs[i + 1], isWide(bs[i + 1]) ? W - 2 * M : COLW);
    if (b.t === "H" && bs[i + 1] && bs[i + 1].t === "A" && bs[i + 2]) need += SPACE + measure(bs[i + 2], COLW);
    while (ys[col] + need > BOTTOM && ys[col] > TOP) advance();
    if (ys[col] + measure(b, COLW) > BOTTOM + 0.01) console.warn(`too tall: ${lesson.ver} ${lesson.title}: ${(b.text || "").slice(0, 40)}`);
    ys[col] += draw(s, b, colX(col), ys[col], COLW) + SPACE;
  }
  const used = col === 0 ? (ys[0] - TOP) / (2 * (BOTTOM - TOP)) : 0.5 + (ys[1] - TOP) / (2 * (BOTTOM - TOP));
  if (process.env.FILL) console.log(`${lesson.ver} ${lesson.title}: last slide ${(used * 100).toFixed(0)}% full`);
}

function divider(section, kick, title, range, lessons) {
  pres.addSection({ title: section });
  const s = pres.addSlide({ masterName: "DARK", sectionTitle: section });
  s.addText(`${kick}  ·  ${range}`, { x: M, y: 2.2, w: 6, h: 0.35, fontFace: SANS, fontSize: 15, bold: true, color: GOLD, margin: 0, isTextBox: true });
  s.addText(title, { x: M, y: 2.7, w: 6.4, h: 1.8, fontFace: THEME.headFontFace, fontSize: 42, bold: true, color: WHITE, valign: "top", margin: 0, isTextBox: true });
  s.addText(lessons.map((l, i) => ({ text: `${l.ver.padEnd(5)} ${l.title}`, options: { breakLine: i < lessons.length - 1 } })),
    { x: 7.4, y: 2.2, w: W - M - 7.4, h: 4.2, fontFace: SANS, fontSize: 16, color: SOFT, valign: "top", margin: 0, paraSpaceAfter: 7, isTextBox: true });
}

// ---------------------------------------------------------------- the deck
pres.addSection({ title: "Start" });
let s = pres.addSlide({ masterName: "DARK", sectionTitle: "Start" });
s.addText("From a broken queue\nto a thread pool", { x: M, y: 2.3, w: 11, h: 2.2, fontFace: THEME.headFontFace, fontSize: 54, bold: true, color: WHITE, valign: "top", margin: 0, isTextBox: true });

s = pres.addSlide({ masterName: "LIGHT", sectionTitle: "Start" });
s.addText("Before you start", { placeholder: "title" });
const intro = [
  { t: "P", text: "Each lesson starts from a problem in our queue and a short program that shows it. The slides give you the real output of every program, and the command to run it yourself, so you can see the same thing on your machine." },
  { t: "P", text: "The versions build on each other, so go in order. Every lesson ends with three exercises with their answers. Cover the answer, work it out, then compare." },
  { t: "P", text: "In the master folder, read each version's main file (queue.hpp, later pool.hpp and the others) and its tiny examples. The helpers in common/ are tools for tests and timing, so you can skip them." },
];
let y = TOP;
for (const b of intro) y += draw(s, b, M, y, COLW) + SPACE;
y = TOP;
y += draw(s, { t: "H", text: "Building the examples" }, M + COLW + GAP, y, COLW) + SPACE;
y += draw(s, { t: "O", text: "$ cd master\n$ ./run.sh v0 tiny            # build and run one program\n$ OPT=-O0 ./run.sh v2 tiny   # -O0 to explore races\n$ ./build_all.sh --demos     # everything, with tests" }, M + COLW + GAP, y, COLW) + SPACE;
draw(s, { t: "P", text: "run.sh builds with -O2 unless you set OPT. Use -O0 when you are chasing a race and -O2 when you are timing something. On Windows use run.bat the same way." }, M + COLW + GAP, y, COLW);

// The complete code of a version: main.cpp (or bench.cpp) and every header it includes.
const fs = require("fs");
const MASTER = path.join(__dirname, "..", "master");
function versionFiles(ver) {
  const dir = path.join(MASTER, ver), order = [], seen = new Set();
  const visit = (name) => {
    if (seen.has(name)) return;
    seen.add(name);
    const p = fs.existsSync(path.join(dir, name)) ? path.join(dir, name) : path.join(MASTER, "common", name);
    const text = fs.readFileSync(p, "utf8").replace(/\s+$/, "");
    for (const m of text.matchAll(/#include "([^"]+)"/g)) visit(m[1]);
    order.push({ name, text });
  };
  visit(ver === "v14" ? "bench.cpp" : "main.cpp");
  return order;                       // headers first, main last
}
function codeLesson(ver) {
  const files = versionFiles(ver);
  const main = files[files.length - 1].name.replace(".cpp", "");
  const blocks = [{ t: "P", text: `Everything ${ver} needs, file by file: ${files.map((f) => f.name).join(", ")}. If your version does not work, compare it with this one. Build and run it from the master folder with ./run.sh ${ver} ${main}.` }];
  for (const f of files) blocks.push({ t: "F", label: f.name, lines: f.text.split("\n") });
  return { ver, title: `${ver}: the complete code`, blocks };
}

for (const [section, kick, title, range, lessons] of LESSONS) {
  divider(section, kick, title, range, lessons);
  lessons.forEach((l, i) => {
    lessonSlides(l, section);
    if (!lessons[i + 1] || lessons[i + 1].ver !== l.ver) lessonSlides(codeLesson(l.ver), section);
  });
}

pres.addSection({ title: "Finish" });
s = pres.addSlide({ masterName: "LIGHT", sectionTitle: "Finish" });
s.addText("Each tool and the bug that made us need it", { placeholder: "title" });
const map = [
  ["lost update", "mutex", "v2"], ["forgotten unlock", "lock_guard", "v3"], ["check, then act", "try_pop", "v3"],
  ["spinning consumer", "condition_variable", "v4"], ["opposite locks", "scoped_lock", "v5"], ["no way to stop", "closed + notify_all", "v6"],
  ["values that can't be copied", "move + optional", "v7"], ["lost result", "future", "v10"], ["tasks waiting on tasks", "wait_helping", "v10"],
  ["contended counter", "atomic", "v11"], ["slow hand-off", "SPSC ring", "v13"], ["one-run numbers", "median and p99", "v14"],
];
map.forEach(([bug, tool, v], i) => {
  const cw = (W - 2 * M - 0.5) / 3, x = M + (i % 3) * (cw + 0.25), yy = TOP + 0.1 + Math.floor(i / 3) * 1.32;
  s.addShape(pres.shapes.ROUNDED_RECTANGLE, { x, y: yy, w: cw, h: 1.1, rectRadius: 0.06, fill: { color: PANEL }, line: { color: PANEL } });
  s.addText([{ text: bug, options: { color: MUTED, breakLine: true } }, { text: tool, options: { color: INK, bold: true } }],
    { x: x + 0.25, y: yy + 0.15, w: cw - 1.0, h: 0.8, fontFace: SANS, fontSize: 16, valign: "middle", margin: 0, isTextBox: true });
  s.addText(v, { x: x + cw - 0.8, y: yy + 0.15, w: 0.55, h: 0.8, fontFace: MONO, fontSize: 14, bold: true, color: ACCENT, align: "right", valign: "middle", margin: 0, isTextBox: true });
});

(async () => {
  await pres.writeFile({ fileName: OUT });
  if (SKILL) {
    const { applyTheme } = require(path.join(SKILL, "scripts/apply_theme.js"));
    await applyTheme(OUT, THEME);
  }
  console.log("wrote", OUT);
})();
