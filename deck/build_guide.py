"""Build the facilitator guide: the Parts 1-2 guide plus Part 3 (v11-v14).

Part 3 is generated from the same TOPICS data that build_part3.py turns into slides,
so the guide and the deck always match.

Usage: python build_guide.py [guide_base.html] [../facilitator-guide.html]
"""
import html
import os
import re
import sys

sys.argv, _args = sys.argv[:1], sys.argv[1:]      # build_part3 reads argv at import
from build_part3 import TOPICS                    # noqa: E402

HERE = os.path.dirname(os.path.abspath(__file__))
BASE = _args[0] if _args else os.path.join(HERE, "guide_base.html")
OUT = _args[1] if len(_args) > 1 else os.path.join(HERE, "..", "facilitator-guide.html")

TOC_NAMES = {"v11": "Atomics", "v12": "Two-lock queue", "v13": "Lock-free SPSC ring", "v14": "Benchmark harness"}
VER = {"v11": "pool v11", "v12": "queue v12", "v13": "ring v13", "v14": "bench v14"}


def strip_tags(s):
    return re.sub(r"<[^>]+>", "", s)


def ul(items):
    return "<ul>" + "".join(f"<li>{i}</li>" for i in items) + "</ul>"


def answers(t):
    """Checkpoint questions paired with the numbered answers in the slide notes."""
    m = re.search(r"CHECKPOINT ANSWERS\n((?:\d\..*\n?)+)", t["e_notes"])
    found = re.findall(r"^\d\.\s*(.*)$", m.group(1), re.M) if m else []
    items = []
    for i, q in enumerate(t["checkpoint"]):
        a = html.escape(found[i]) if i < len(found) else ""
        items.append(f"<li><b>{q}</b><br>{a}</li>")
    rest = t["e_notes"][m.end():].strip() if m else ""
    extra = "".join(f"<p>{html.escape(p)}</p>" for p in rest.split("\n\n") if p.strip())
    return "<ol>" + "".join(items) + "</ol>" + extra


def lab(t):
    tid = t["id"]
    model = html.escape("\n".join(t["model"]))
    musts = [txt for kind, txt in t["tests"] if kind == "pass"]
    fails = [txt for kind, txt in t["tests"] if kind == "fail"]
    explain = " ".join(strip_tags(e) for e in t["explain"])
    rows = [
        ("", "1–2 · Problem", f'<p>{t["problem"][0]} {t["problem"][1]}</p><p><i>In our project:</i> {t["project"]}</p>'),
        ("", "2 · Mental model", f'<pre><code>{model}</code></pre><p>{t["model_caption"]}</p>'),
        ("detour", "3–5 · Tiny example",
         f'<p><b>{t["b_title"]}.</b> Predict:</p>{ul(t["predict"])}<p>Then break it:</p>{ul(t["break"])}'),
        ("", "6–7 · Explain + fix", f'<p><b>{t["c_title"]}.</b> {explain} {t["rule"]}</p>'),
        ("", "8 · Project version", ul(t["changed"]) + "<p>Must pass:</p>" + ul(musts)),
    ]
    if fails:
        rows.append(("bridge", "Bridge",
                     f"<p>The test marked <i>should fail</i>: {fails[0]}. That failure is the next topic's problem.</p>"))
    rows += [
        ("", "9 · Exercises", "<ol>" + "".join(f"<li>{e}</li>" for e in t["exercises"]) + "</ol>"),
        ("trap", "10 · Checkpoint answers", answers(t)),
    ]
    dl = ""
    for cls, dt, dd in rows:
        c = f' class="{cls}"' if cls else ""
        dc = ' class="detour"' if cls == "detour" else ""
        dl += f"    <dt{c}>{dt}</dt><dd{dc}>{dd}</dd>\n"
    v = t["v"]
    return (f'<section class="lab" id="t-{tid}">\n'
            f'  <header><span class="num">{v}</span><h3>{t["a_title"]}</h3><span class="ver">{VER[tid]}</span>'
            f'<label class="done"><input type="checkbox" id="done-{tid}" data-lab="{tid}"> Taught</label></header>\n'
            f'  <p class="meta">{v} · {TOC_NAMES[tid]}</p>\n  <dl>\n{dl}  </dl>\n</section>\n')


def sub(src, old, new, count=1):
    if old not in src:
        raise SystemExit(f"build_guide: anchor not found: {old[:60]!r}")
    return src.replace(old, new, count)


def main():
    src = open(BASE, encoding="utf-8").read()
    if 'id="part3"' in src:
        raise SystemExit("build_guide: the base already has Part 3; use the Parts 1-2 base")

    # Contents
    toc = "  <p>Part 3 · Faster, measured</p>\n" + "".join(
        f'<a href="#t-{t["id"]}" data-lab="{t["id"]}"><span class="n">{t["v"]}</span>'
        f'<span class="t">{TOC_NAMES[t["id"]]}</span></a>\n' for t in TOPICS)
    src = sub(src, '  <a href="#finish" data-lab="fin">', toc + '  <a href="#finish" data-lab="fin">')
    src = sub(src, '<span class="t">Eleven versions</span>', '<span class="t">Fifteen versions</span>')
    src = sub(src, '<span class="t">The next phases</span>', '<span class="t">The project tracks</span>')

    # Intro, bridge and method
    src = sub(src, "one queue grown through eleven versions into a thread pool,",
              "one queue grown through fifteen versions into a thread pool and then a measured lock-free queue,")
    src = sub(src, "CONCURRENCY  ← this track: thread-safe queue → thread pool\n        ↓\nC++ memory model + atomics\n        ↓\nLock-based structures  →  Lock-free structures  →  Benchmarking + testing",
              "CONCURRENCY  ← Parts 1–2: thread-safe queue → thread pool\n        ↓\nC++ memory model + atomics          ← Part 3: v11\n        ↓\nLock-based structures  →  Lock-free structures  →  Benchmarking + testing\n        (v12)                    (v13)                     (v14)")
    src = sub(src, '<h2 id="versions">Eleven versions</h2>', '<h2 id="versions">Fifteen versions</h2>')
    src = sub(src, "→ v7 generic queue&lt;T&gt; → v8 task queue → v9 thread pool → v10 future-based results</div>",
              "→ v7 generic queue&lt;T&gt; → v8 task queue → v9 thread pool → v10 future-based results\n"
              "→ v11 atomics → v12 two-lock queue → v13 lock-free SPSC ring → v14 benchmark harness</div>")
    src = sub(src, "<p>Seventeen topics: v3, v5 and v9 have two each, v10 has four.",
              "<p>Twenty-one topics: v3, v5 and v9 have two each, v10 has four, and v11–v14 have one each.")
    src = sub(src, "and promise, <code>shared_future</code>, timeouts and the nested-wait deadlock (v10).</p>",
              "and promise, <code>shared_future</code>, timeouts and the nested-wait deadlock (v10). Part 3 is the first four "
              "phases of the bridge, one topic each: atomics and memory order (v11), fine-grained locking (v12), "
              "lock-free SPSC and cache lines (v13), and honest benchmarking (v14).</p>")
    src = sub(src, "Plan for 17–20 sessions including the Part 1 review and final presentations.",
              "Plan for 21–24 sessions including the Part 1 review and final presentations.")
    src = sub(src, "  <li><b>ThreadSanitizer</b> works on Linux, WSL and macOS, not MinGW or MSVC.</li>",
              "  <li><b>ThreadSanitizer</b> works on Linux, WSL and macOS, not MinGW or MSVC.</li>\n"
              "  <li><b>Part 3 timings depend on the machine.</b> Run v12's and v14's examples on the room's machines "
              "before the session; the ranking matters, not the exact numbers.</li>")

    # How the plan was applied: Part 3 decisions
    src = sub(src, '\n<h2 id="part1">',
              '<div class="change"><span class="i">8</span><div><b>Part 3 follows the same ten steps, one topic per version.</b>'
              '<p>v11–v14 carry the bridge\'s memory-model, lock-based, lock-free and benchmarking phases, so students reach '
              'the project tracks holding the same queue in four more forms.</p></div></div>\n'
              '<div class="change"><span class="i">9</span><div><b>Part 3 behaviours, <i>verified</i> with GCC 13 at '
              '<code>-O2</code> on a 4-core Linux machine:</b><p>the v2 counter with an atomic was exact in 21 ms against '
              '126 ms with a mutex; one mutex for both queue ends fell from 5.7 to 2.0 M items/s going from 1×1 to 8×8; '
              'the two-lock queue was <i>slower</i> than one mutex here (0.9 vs 6.1 M/s at 1×1), which the deck uses as the '
              'lesson; two counters on one cache line took 1.43 s against 0.33 s apart; two producers on the SPSC ring '
              'delivered 1,476,725 of 2,000,000 items; an unused loop took 0.0002 ms at <code>-O2</code>; and the harness '
              'measured SpscRing at 104.8 M msg/s with a 263 ns median against 4.8 M msg/s and 5,768 ns for queue v7.</p></div></div>\n'
              '\n<h2 id="part1">')

    # Part 3 labs, before the Definition of done
    part3 = ('<h2 id="part3">Part 3 · Faster, and measured (v11–v14)</h2>\n'
             '<p>The pool works. Part 3 asks what that safety costs and how to pay less: the same queue rebuilt with '
             'atomics, split locks and no locks at all, then measured properly. It ends where the Feed Handler starts.</p>\n\n'
             + "".join(lab(t) for t in TOPICS) + "\n")
    src = sub(src, '<section class="lab" id="finish">', part3 + '<section class="lab" id="finish">')
    src = sub(src, '<header><span class="num">Finish</span><h3>Definition of done</h3><span class="ver">pool v10</span>',
              '<header><span class="num">Finish</span><h3>Definition of done</h3><span class="ver">pool v10 · bench v14</span>')
    src = sub(src, "recursive psum on 1 and 2 workers; 20 TSan runs.</p></dd>",
              "recursive psum on 1 and 2 workers; 20 TSan runs. Part 3 adds: the v14 benchmark run on the pair's own "
              "machine, with the three queues ranked and the ranking explained.</p></dd>")

    # After: the project tracks
    after_old = src[src.index('<h2 id="after">'):src.index("</main>")]
    after_new = ('<h2 id="after">The project tracks</h2>\n'
                 '<p>Nobody opens a project repository cold. Each track starts from files the pair already wrote and tested:</p>\n'
                 '<ul>\n'
                 '  <li><b>Feed Handler:</b> starts from <code>spsc_ring.hpp</code> (v13) and <code>bench.hpp</code> (v14). '
                 'First steps: pin threads to cores, busy-poll instead of yield, parse real messages.</li>\n'
                 '  <li><b>Custom Allocator:</b> object lifetime and move semantics (v7), atomics for per-thread caches (v11), '
                 'cache-line layout and false sharing (v13).</li>\n'
                 '  <li><b>Execution Simulator:</b> event queues between components (v7, v12) and the thread pool with '
                 'futures (v10), measured with the v14 harness.</li>\n'
                 '</ul>\n'
                 '<div class="note fix">Same method in every phase: ten steps per topic, one growing project.</div>\n')
    src = src.replace(after_old, after_new)

    open(OUT, "w", encoding="utf-8").write(src)
    print(f"wrote {OUT}: {len(TOPICS)} Part 3 labs")


if __name__ == "__main__":
    main()
