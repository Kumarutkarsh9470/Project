"""Generate Part 3 (v11-v14) slides and the updated summary slides for the deck."""
import html, json, os, re, sys

# Usage: python build_part3.py <deck-in> <deck-out>
#   deck-in:  a folder holding the published deck's project/deck.json and project/slides/*.html
#   deck-out: where the new and changed files are written (same layout)
ROOT = sys.argv[1] if len(sys.argv) > 1 else "deck_in"
OUT = sys.argv[2] if len(sys.argv) > 2 else "deck_out"
SL = os.path.join(ROOT, "project/slides")

MONO = "'JetBrains Mono', 'Courier New', monospace"
HEAD = "'Space Grotesk', Arial, sans-serif"
SANS = "'IBM Plex Sans', Arial, sans-serif"
INK, PAPER, CARD, LINE, MUTED = "#1B1E24", "#F3EFE6", "#FBF9F4", "#DDD6C8", "#4A505C"
DARK, NAVY, CODEBG, CODELINE = "#15171C", "#121A24", "#20242C", "#2E3440"
CREAM, SOFT, AMBER, BLUE, SKY, BROWN, GREEN = "#ECE8DF", "#A9B0BC", "#F0A43A", "#1F5FA8", "#6DB3F2", "#8F4F00", "#2B6E4F"


def code(lines, size=24, color="#E6E1D6"):
    """Lines of code -> one <p>. A line starting with '!' is highlighted, '#' is a comment colour."""
    out = []
    for ln in lines:
        hl = None
        if ln.startswith("!"):
            ln, hl = ln[1:], f"color:{AMBER};font-weight:700"
        elif ln.startswith("~"):
            ln, hl = ln[1:], f"color:{SKY};font-weight:700"
        elif ln.startswith("#"):
            ln, hl = ln[1:], "color:#8C94A3"
        t = html.escape(ln, quote=False).replace(" ", "&#160;") or "&#160;"
        out.append(f'<span style="{hl}">{t}</span>' if hl else t)
    return (f'<p style="font-family:{MONO};font-size:{size}px;line-height:1.45;color:{color};'
            f'white-space:nowrap">' + "<br>".join(out) + "</p>")


def diagram(lines, hl_last=False):
    out = []
    for i, ln in enumerate(lines):
        t = html.escape(ln, quote=False).replace(" ", "&#160;") or "&#160;"
        if hl_last and i == len(lines) - 1:
            t = f'<span style="color:{BROWN};font-weight:700">{t}</span>'
        out.append(t)
    return (f'<div style="background:{CARD};border:1px solid {LINE};border-radius:12px;padding:24px 28px">'
            f'<p style="font-family:{MONO};font-size:24px;line-height:1.45;color:{INK};white-space:nowrap">'
            + "<br>".join(out) + "</p></div>")


def tracker(on, dark):
    base = SOFT if dark else MUTED
    hi = AMBER if dark else BROWN
    parts = []
    for s in range(1, 11):
        if s in on:
            parts.append(f'<span style="color:{hi};font-weight:700">{s}</span>')
        else:
            parts.append(f'<span style="color:{base}">{s}</span>')
    return (f'<p style="position:absolute;right:128px;top:116px;width:560px;text-align:right;font-family:{MONO};'
            f'font-size:24px;color:{base}">STEP&#160;&#160;' + "&#160;".join(parts) + "</p>")


def footer(label, num, dark):
    c = SOFT if dark else MUTED
    return (f'<p style="position:absolute;left:128px;bottom:64px;width:1200px;font-family:{MONO};font-size:24px;'
            f'color:{c};letter-spacing:1px">{label}</p><p style="position:absolute;right:128px;bottom:64px;width:200px;'
            f'text-align:right;font-family:{MONO};font-size:24px;color:{c}">{num:02d}</p>')


def section(sid, bg, fg, body, notes):
    return (f'<section id="{sid}" data-transition="fade" style="background:{bg};color:{fg};font-family:{SANS};'
            f'padding:128px 128px 160px;display:flex;flex-direction:column;gap:32px">\n{body}\n'
            f'<aside>{html.escape(notes, quote=False)}</aside>\n</section>\n')


def kicker(text, color):
    return (f'<p style="font-family:{MONO};font-size:24px;font-weight:600;letter-spacing:3px;color:{color};'
            f'text-transform:uppercase">{text}</p>')


def h2(text, size=56):
    return (f'<h2 style="font-family:{HEAD};font-size:{size}px;font-weight:600;line-height:1.1;'
            f'letter-spacing:-1px;">{text}</h2>')


def label(text, color):
    return (f'<p style="font-family:{MONO};font-size:24px;color:{color};letter-spacing:2px;'
            f'text-transform:uppercase">{text}</p>')


def para(text, color=INK, size=28):
    return f'<p style="font-size:{size}px;line-height:1.42;color:{color}">{text}</p>'


SPACER = '<div style="flex:1"></div>'


# ---------------------------------------------------------------- slide kinds
def slide_a(t, num):
    left = (label("The problem", MUTED) + para(t["problem"][0]) + para(t["problem"][1], MUTED) + SPACER +
            f'<div style="display:flex;flex-direction:column;gap:10px;background:{CARD};border:1px solid {LINE};'
            f'border-left:6px solid {BROWN};border-radius:10px;padding:22px 26px">'
            f'<p style="font-family:{MONO};font-size:24px;font-weight:600;color:{BROWN};letter-spacing:2px">IN OUR PROJECT</p>'
            f'<p style="font-size:27px;line-height:1.4;color:{INK}">{t["project"]}</p></div>')
    right = label("Mental model", MUTED) + diagram(t["model"]) + para(t["model_caption"], MUTED)
    body = (kicker(f'{t["v"]} · {t["name"]} · Intuition + mental model', BLUE) + h2(t["a_title"]) +
            f'<div style="flex:1;display:flex;flex-direction:row;gap:48px">'
            f'<div style="flex:1;display:flex;flex-direction:column;gap:18px">{left}</div>'
            f'<div style="flex:1.1;display:flex;flex-direction:column;gap:18px">{right}</div></div>' +
            tracker({1, 2}, False) + footer(t["footer"], num, False))
    return section(t["id"] + "a", PAPER, INK, body, t["a_notes"])


def slide_b(t, num):
    def pred(s):
        return (f'<p style="font-size:30px;line-height:1.35;color:{CREAM};border-left:4px solid {AMBER};'
                f'padding:4px 0 4px 24px">{s}</p>')

    def brk(s):
        return (f'<p style="font-size:26px;line-height:1.38;color:{SOFT};border-left:4px dashed {SKY};'
                f'padding:2px 0 2px 22px">{s}</p>')
    right = (label("Predict, then run", SOFT) + "".join(pred(p) for p in t["predict"]) + SPACER +
             label("Then break it", SOFT) + "".join(brk(b) for b in t["break"]))
    body = (f'<div style="position:absolute;left:36px;top:36px;width:1848px;height:1008px;border:3px dashed {SKY};'
            f'border-radius:28px"></div>' + kicker("Tiny example · Predict, then break it", SKY) +
            h2(t["b_title"], 60) +
            f'<div style="flex:1;display:flex;flex-direction:row;gap:48px">'
            f'<div style="flex:1.35;display:flex;flex-direction:column;background:{CODEBG};border:1px solid {CODELINE};'
            f'border-radius:16px;padding:32px 36px">{code(t["tiny"])}</div>'
            f'<div style="flex:1;display:flex;flex-direction:column;gap:18px">{right}</div></div>' +
            tracker({3, 4, 5}, True) + footer(t["footer"], num, True))
    return section(t["id"] + "b", NAVY, CREAM, body, t["b_notes"])


def slide_c(t, num):
    left = "".join(para(p, MUTED, 27) for p in t["explain"])
    if t.get("c_diagram"):
        left = diagram(t["c_diagram"], hl_last=True) + left
    left += SPACER + (f'<p style="font-size:28px;line-height:1.35;font-weight:600;color:{INK};background:#E3EAF2;'
                      f'border-left:6px solid {BLUE};padding:20px 28px;border-radius:4px">{t["rule"]}</p>')
    body = (kicker(f'{t["v"]} · {t["name"]} · Explain + fix', BLUE) + h2(t["c_title"], 52) +
            f'<div style="flex:1;display:flex;flex-direction:row;gap:48px">'
            f'<div style="flex:1;display:flex;flex-direction:column;gap:20px">{left}</div>'
            f'<div style="flex:1.5;display:flex;flex-direction:column;background:{CODEBG};border:1px solid {CODELINE};'
            f'border-radius:16px;padding:32px 36px">{code(t["fix"])}</div></div>' +
            tracker({6, 7}, False) + footer(t["footer"], num, False))
    return section(t["id"] + "c", PAPER, INK, body, t["c_notes"])


def slide_d(t, num):
    tests = ""
    for kind, text in t["tests"]:
        icon, col, tag = (("CheckCircle", SKY, "must pass") if kind == "pass" else ("Warning", AMBER, "should fail"))
        tests += (f'<div style="display:flex;flex-direction:row;gap:14px;align-items:start">'
                  f'<x-icon name="{icon}" style="color:{col};width:32px;height:32px"></x-icon>'
                  f'<p style="flex:1;font-size:26px;line-height:1.35;color:{CREAM}">{text} '
                  f'<span style="color:{col}">({tag})</span></p></div>')
    right = (label("What changed", SOFT) +
             "".join(f'<p style="font-size:26px;line-height:1.38;color:{SOFT}">{c}</p>' for c in t["changed"]) +
             SPACER + label("Run these tests", SOFT) + tests)
    body = (kicker(f'Project version · {t["d_kicker"]}', AMBER) + h2(t["d_title"], 60) +
            f'<div style="flex:1;display:flex;flex-direction:row;gap:48px">'
            f'<div style="flex:1.35;display:flex;flex-direction:column;background:{CODEBG};border:1px solid {CODELINE};'
            f'border-radius:16px;padding:32px 36px">{code(t["project_code"])}</div>'
            f'<div style="flex:1;display:flex;flex-direction:column;gap:16px">{right}</div></div>' +
            tracker({8}, True) + footer(t["footer"], num, True))
    return section(t["id"] + "d", DARK, CREAM, body, t["d_notes"])


def slide_e(t, num):
    ex = "".join(
        f'<div style="display:flex;flex-direction:row;gap:18px;background:{CARD};border:1px solid {LINE};'
        f'border-radius:10px;padding:18px 22px"><p style="font-family:{MONO};font-size:26px;font-weight:700;'
        f'color:{BLUE}">{i}</p><p style="flex:1;font-size:26px;line-height:1.38;color:{INK}">{e}</p></div>'
        for i, e in enumerate(t["exercises"], 1))
    cp = "".join(f'<p style="font-size:27px;line-height:1.36;color:{INK};border-left:4px solid {BROWN};'
                 f'padding:2px 0 2px 22px">{q}</p>' for q in t["checkpoint"])
    body = (kicker(f'{t["v"]} · {t["name"]} · Exercise + checkpoint', BLUE) + h2("Now on your own") +
            f'<div style="flex:1;display:flex;flex-direction:row;gap:48px">'
            f'<div style="flex:1.1;display:flex;flex-direction:column;gap:14px">{label("Exercises · on your own", MUTED)}{ex}</div>'
            f'<div style="flex:1;display:flex;flex-direction:column;gap:16px">{label("Checkpoint · answer without looking", MUTED)}{cp}</div></div>' +
            tracker({9, 10}, False) + footer(t["footer"], num, False))
    return section(t["id"] + "e", PAPER, INK, body, t["e_notes"])


# ---------------------------------------------------------------- content
TOPICS = [
    dict(
        id="v11", v="v11", name="Atomics", footer="v11 · Atomics",
        a_title="Counting without a lock",
        problem=["A dashboard thread wants the pool's submitted and completed counts every 100 ms.",
                 "Put both counters under a mutex and every finished task now queues behind the dashboard for that lock."],
        project="Pool v11 counts submitted and completed tasks while a monitor reads them, lock-free.",
        model=["++n is three steps:", "  load  →  add  →  store", "",
               "two threads interleave them", "  → a lost update (v2)", "",
               "n.fetch_add(1) is one step:", "  nobody gets in between"],
        model_caption="An atomic's read-modify-write can't be split. No lock, nobody waits.",
        a_notes="STEP 1: start from v2. The racy counter lost updates; we fixed it with a mutex. Ask: is a mutex the only way to make ++ safe?\n\nSTEP 2: ++n on a plain int is load, add, store. Two threads interleave those steps and one increment disappears. An atomic read-modify-write (fetch_add) is one indivisible step done by the hardware. It never blocks: there's no lock to wait for.\n\nHOOK: someone used std::atomic<int> back in v2. Today we find out why it worked.",
        b_title="Three ways to count to 2,000,000",
        tiny=["int plain = 0;                   // v2's counter",
              "std::mutex m;  int locked = 0;",
              "std::atomic<int> counter{0};", "",
              "#// two threads, 1,000,000 times each:",
              "++plain;                                // A",
              "{ std::lock_guard l(m); ++locked; }     // B",
              "!counter.fetch_add(1,",
              "!    std::memory_order_relaxed);         // C", "",
              "#// which totals are right? rank the times."],
        predict=["Which totals are 2,000,000?", "Rank A, B and C by speed."],
        **{"break": ["Build at -O0, then -O2. Does A change?",
                     "Write counter = counter + 1 instead. Still safe?"]},
        b_notes="STEPS 3–4 (verified, master/v11/tiny_atomic.cpp, GCC, 4-core Linux, -O2): no lock 2,000,000 in 0.4 ms; mutex 2,000,000 in 126 ms; atomic 2,000,000 in 21 ms.\n\nThe no-lock line looks right at -O2 only because the optimizer collapsed the loop into one add (same trap as the lab-bench slide). It is still a data race, which is undefined behaviour. At -O0 it loses updates exactly as in v2.\n\nSTEP 5 BREAK IT\n- -O0: A loses updates, B and C stay exact.\n- counter = counter + 1 is an atomic load followed by an atomic store: two operations, so updates are lost again. Atomic variables don't make expressions atomic; only the single operations are.",
        c_title="Atomic stops lost updates. Ordering decides what else is seen.",
        c_diagram=["writer:  data = 42;", "         ready.store(true, release)", "reader:  ready.load(acquire) == true",
                   "         → data is guaranteed 42"],
        explain=["<b>relaxed:</b> the operation is atomic, nothing more. Enough for a counter.",
                 "<b>release / acquire:</b> everything written before the store is visible after the load."],
        rule="Use relaxed for counters, release/acquire to publish data. Default (seq_cst) when unsure.",
        fix=["int data = 0;                   // plain int",
             "std::atomic<bool> ready{false};", "",
             "std::thread writer([] {",
             "    data = 42;",
             "!    ready.store(true, std::memory_order_release);",
             "});",
             "std::thread reader([] {",
             "~    while (!ready.load(std::memory_order_acquire))",
             "        std::this_thread::yield();",
             "    std::cout << data;          // always 42",
             "});"],
        c_notes="STEP 6: separate the two questions. Atomicity: can an operation be split? Ordering: when one thread sees my atomic write, what else of mine does it see?\n\nSTEP 7: master/v11/tiny_publish.cpp. The release store 'publishes' every earlier write; the acquire load that reads true 'receives' them. With relaxed on both sides the reader could print 0. x86 hides that (its stores are already ordered); ARM, including Apple chips and phones, doesn't.\n\nDEPTH: this is the pattern that fixes v9's double-checked default_pool(), and the one v13's ring buffer is built on. Don't teach consume or fences.",
        d_kicker="pool v11", d_title="v11: counters a monitor can read",
        project_code=["class ThreadPool {",
                      "!    std::atomic<std::size_t> submitted{0};",
                      "!    std::atomic<std::size_t> completed{0};", "",
                      "    void run(Task& t) {",
                      "        t();",
                      "        completed.fetch_add(1,",
                      "            std::memory_order_relaxed);",
                      "    }",
                      "public:",
                      "    std::size_t tasks_completed() const {",
                      "        return completed.load(",
                      "            std::memory_order_relaxed);",
                      "    }",
                      "};"],
        changed=["Two <b>atomic counters</b>, read with no lock.",
                 "<b>relaxed</b> is enough: each counter only has to be exact on its own."],
        tests=[("pass", "After 10,000 tasks, submitted = completed = 10,000"),
               ("pass", "A monitor reads the counters while tasks run"),
               ("fail", "One mutex for both queue ends: 1×1 vs 8×8 throughput")],
        d_notes="STEP 8 (verified): v11 tests pass; v10 behaviour unchanged.\n\nNEXT BUG (master/v11/next_bug.cpp, -O2, 4 cores): 1×1 5.7 M items/s, 2×2 2.1, 4×4 3.0, 8×8 2.0. More threads, less throughput: producers and consumers queue on one mutex although they touch opposite ends. That's v12.\n\nsubmit() increments submitted with the same relaxed fetch_add.\n\nMASTER CODE: master/v11/ has the complete files and tests for this version.",
        exercises=["Fix v9's default_pool(): double-checked locking with std::atomic&lt;ThreadPool*&gt; and acquire/release.",
                   "Add an in-flight gauge (submitted − completed). Can the monitor ever see it negative?",
                   "Run tiny_publish with relaxed on both sides 1,000 times. Why can't x86 show the bug?"],
        checkpoint=["Why is ++n on a plain int a data race?", "What does fetch_add guarantee that load-then-store doesn't?",
                    "When is relaxed enough?", "What does a release store promise an acquire load?"],
        e_notes="CHECKPOINT ANSWERS\n1. Two threads access it, at least one writes, and nothing orders them.\n2. The read, the add and the write happen as one step; no other write can land in between.\n3. When the value itself is all that matters, as with a statistics counter.\n4. Everything the writer did before the store is visible to the reader after a load that sees the stored value.\n\nEXERCISE 2: yes. Two separate loads are not one snapshot; read completed first, or treat the gauge as an estimate and clamp it at 0.\nEXERCISE 3: x86 doesn't reorder stores with other stores, so the hardware gives release/acquire for free. The compiler still may reorder; the code is wrong either way."),
    dict(
        id="v12", v="v12", name="Two-lock queue", footer="v12 · Two-lock queue",
        a_title="Producers and consumers share one lock",
        problem=["Every push and every pop takes the same mutex, though producers only touch the tail and consumers only the head.",
                 "v11's next bug: adding threads made the queue slower."],
        project="Queue v12: TwoLockQueue&lt;T&gt;, the same API as ThreadSafeQueue&lt;T&gt;, one lock per end.",
        model=["head_m                    tail_m", "  ▼                         ▼",
               "[ a ] → [ b ] → [ c ] → [dummy]", "", "consumers take from the head",
               "producers fill the dummy at the tail"],
        model_caption="The dummy node keeps head and tail apart, so the two locks never guard the same node.",
        a_notes="STEP 1: replay v11's next_bug numbers. A producer pushing and a consumer popping touch different ends, so why do they wait for each other?\n\nSTEP 2: a singly linked list with a dummy node at the end (Williams, Concurrency in Action, chapter 6). Producers write the value into the current dummy and append a new dummy, under tail_m. Consumers take the first node, under head_m. Because the last node is always an empty dummy, the head and the tail never point at the same real item.",
        b_title="Does a second lock help?",
        tiny=["template <class Q>",
              "double run(int producers, int consumers);",
              "#// pushes 4,000,000 ints in total, pops",
              "#// until shutdown, returns M items/s", "",
              "run<ThreadSafeQueue<int>>(1, 1);   // v7",
              "!run<TwoLockQueue<int>>(1, 1);      // v12", "",
              "run<ThreadSafeQueue<int>>(4, 4);",
              "!run<TwoLockQueue<int>>(4, 4);", "",
              "#// which wins, and by how much?"],
        predict=["Predict, then run.", "Write the four numbers down before you run."],
        **{"break": ["Run it on 1 core (taskset -c 0). Who wins now?",
                     "Delete push()'s empty head_m lock. Run the shutdown test 100 times."]},
        b_notes="STEPS 3–4 (verified, master/v12/tiny_contention.cpp, 4-core Linux, -O2): 1×1 one mutex 6.1 M/s, two locks 0.9 M/s; 4×4 one mutex 3.7, two locks 1.1.\n\nMost students predict the two-lock queue wins. On this machine it lost badly: every push allocates a node and does two lock/unlock pairs plus a notify, and that costs more than the contention it removes. Your numbers may differ; the lesson is the same either way: measure, don't believe the story.\n\nSTEP 5: the empty head_m lock prevents a lost wake-up (next slide). Without it the shutdown or wait tests can hang rarely: run many times.",
        c_title="Finer locks cut waiting, not work",
        c_diagram=None,
        explain=["<b>Two locks</b>: a push and a pop can run at once. That only pays when they really collide.",
                 "<b>The price</b>: a heap node per push, two mutexes, and a subtle wake-up rule.",
                 "<b>Lost wake-up</b>: push() briefly takes head_m, so its notify can't land between a consumer's check and its sleep."],
        rule="Splitting a lock is a trade. Only a measurement says which side wins.",
        fix=["bool push(T v) {",
             "    if (closed.load()) return false;",
             "    auto dummy = std::make_unique<Node>();",
             "    {",
             "!        std::lock_guard<std::mutex> l(tail_m);",
             "        tail->value = std::move(v);",
             "        Node* new_tail = dummy.get();",
             "        tail->next = std::move(dummy);",
             "        tail = new_tail;",
             "    }",
             "~    { std::lock_guard<std::mutex> l(head_m); }",
             "    cv.notify_one();",
             "    return true;",
             "}"],
        c_notes="STEP 6: have a student draw the race the empty lock prevents. Consumer holds head_m, sees no items, is about to sleep in cv.wait. Producer (not holding head_m) appends and notifies now: nobody is waiting yet, so the notify is lost and the consumer sleeps forever. Taking head_m in push() forces the notify to happen either before the check or after the consumer is really asleep.\n\nSTEP 7: closed is std::atomic<bool> (v11) so push() can read it without head_m. The node is allocated before any lock is taken: never allocate under a lock if you can help it.",
        d_kicker="queue v12", d_title="v12: TwoLockQueue&lt;T&gt;",
        project_code=["std::optional<T> wait_and_pop() {",
                      "!    std::unique_lock<std::mutex> l(head_m);",
                      "    cv.wait(l, [&] {",
                      "        return has_items() || closed;",
                      "    });",
                      "    if (!has_items()) return std::nullopt;",
                      "    return pop_head();",
                      "}", "",
                      "~TwoLockQueue() {        // a loop,",
                      "    while (head)        // not recursion",
                      "        head = std::move(head->next);",
                      "}"],
        changed=["Producers lock only <b>tail_m</b>, consumers only <b>head_m</b>.",
                 "has_items() reads the tail under tail_m: the one place both locks meet."],
        tests=[("pass", "FIFO order; the 4×4 matrix count and sum match"),
               ("pass", "Destroy a queue holding 1,000,000 nodes"),
               ("fail", "1 producer, 1 consumer: ns per item")],
        d_notes="STEP 8 (verified): all v12 tests pass, including unique_ptr values and shutdown with waiting consumers.\n\nThe destructor is a loop because the default unique_ptr chain destroys recursively: 1,000,000 nodes overflow the stack.\n\nNEXT BUG (master/v12/next_bug.cpp): about 1,140 ns per item for one producer and one consumer on this machine. A feed handler moving millions of messages a second between exactly two threads can't afford an allocation and two mutexes per message. That's v13.\n\nMASTER CODE: master/v12/ has the complete files and tests for this version.",
        exercises=["Run the v5 matrix on both queues. Plot throughput against thread count.",
                   "Delete the destructor loop and destroy 1,000,000 nodes. What happens, and why?",
                   "Build a hash map with one mutex per bucket, using the same idea."],
        checkpoint=["Why does the dummy node let two locks work?", "Which lost wake-up does push()'s empty lock prevent?",
                    "Why can two locks be slower for 1 producer, 1 consumer?", "Why is the destructor a loop?"],
        e_notes="CHECKPOINT ANSWERS\n1. The tail always points at an empty dummy, so head and tail never refer to the same real node, and each lock guards its own end.\n2. A notify sent between a consumer's empty check and its sleep.\n3. Allocation and two lock pairs per item cost more than the contention removed; with one producer and one consumer there is little contention to remove.\n4. Recursive unique_ptr destruction overflows the stack on long lists.\n\nEXERCISE 3 is the lock-based structures phase in miniature; the Simulator and Allocator tracks reuse it."),
    dict(
        id="v13", v="v13", name="Lock-free SPSC ring", footer="v13 · Lock-free SPSC ring",
        a_title="One producer, one consumer, millions of messages",
        problem=["A feed handler has one thread reading the network and one thread parsing. v12 spent over a microsecond per item.",
                 "Locks, allocation and sleeping each cost more than the message itself."],
        project="SpscRing&lt;T, N&gt;: a fixed array and two atomic indices. No mutex, no allocation.",
        model=["[ . | a | b | c | . | . | . | . ]", "      ▲           ▲", "     head        tail", "",
               "the consumer owns head", "the producer owns tail", "each only READS the other's"],
        model_caption="One writer per index: nothing to lock. The atomics only carry the news.",
        a_notes="STEP 1: replay v12's ns per item. Ask what a message costs to parse (tens of ns). The queue costs more than the work.\n\nSTEP 2: a ring of N slots. The producer writes slot tail, then advances tail. The consumer reads slot head, then advances head. Each index has exactly one writer, so no read-modify-write and no lock is needed: only a way to tell the other thread 'this slot is ready', which is v11's release/acquire.\n\nSAY THE RULE NOW: exactly one producer thread and one consumer thread. It's in the name.",
        b_title="Two private counters, one cache line",
        tiny=["struct Together {",
              "    std::atomic<long> a{0};",
              "!    std::atomic<long> b{0};   // same line",
              "};",
              "struct Apart {",
              "    alignas(64) std::atomic<long> a{0};",
              "~    alignas(64) std::atomic<long> b{0};",
              "};", "",
              "#// thread 1: ++s.a 50M times",
              "#// thread 2: ++s.b 50M times",
              "#// nothing is shared. which is faster?"],
        predict=["Nothing is shared. Predict the two times.", "Then explain the difference."],
        **{"break": ["Use alignas(32) instead of 64. Then alignas(128).",
                     "Run both loops on one thread. Does layout still matter?"]},
        b_notes="STEPS 3–4 (verified, master/v13/tiny_false_sharing.cpp, 4-core Linux, -O2): same cache line 1.43 s, separate lines 0.33 s, over 4× slower with nothing shared.\n\nWHY: caches move memory in 64-byte lines. Two cores writing different variables on one line keep stealing the whole line from each other. This is false sharing.\n\nSTEP 5: alignas(32) can still put both in one 64-byte line depending on placement; 128 is what some CPUs (adjacent-line prefetch) prefer. On one thread the line never moves between cores, so layout barely matters.\n\nThis is why SpscRing puts head and tail on separate lines.",
        c_title="Publish with release, read with acquire",
        c_diagram=None,
        explain=["<b>try_push</b> writes the slot, then release-stores tail: the v11 publish pattern.",
                 "<b>try_pop</b> acquire-loads tail, so the slot's contents are visible before it reads.",
                 "Each thread loads its <b>own</b> index relaxed: nobody else writes it."],
        rule="Lock-free code is only correct under its rules. Break SPSC's rule and it fails silently.",
        fix=["bool try_push(T v) {           // producer only",
             "    auto t = tail.load(std::memory_order_relaxed);",
             "    if (t - head.load(std::memory_order_acquire) == N)",
             "        return false;          // full",
             "    slots[t & (N - 1)] = std::move(v);",
             "!    tail.store(t + 1, std::memory_order_release);",
             "    return true;",
             "}",
             "bool try_pop(T& out) {         // consumer only",
             "    auto h = head.load(std::memory_order_relaxed);",
             "~    if (h == tail.load(std::memory_order_acquire))",
             "        return false;          // empty",
             "    out = std::move(slots[h & (N - 1)]);",
             "    head.store(h + 1, std::memory_order_release);",
             "    return true;",
             "}"],
        c_notes="STEP 6: walk one item through. Producer: write slot 5, release-store tail = 6. Consumer: acquire-load tail, sees 6, so the write to slot 5 is visible; read it; release-store head = 6, which tells the producer slot 5 may be reused.\n\nSTEP 7: indices only grow; t & (N - 1) maps them into the array (N a power of two), and t - head is the fill level even after wrap-around (unsigned arithmetic).\n\nNo waiting: the API is try_ only. The caller decides whether to spin, yield or sleep, which is exactly the latency choice a feed handler wants to make itself.",
        d_kicker="ring v13", d_title="v13: SpscRing&lt;T, N&gt;",
        project_code=["template <class T, std::size_t N>",
                      "class SpscRing {     // N: a power of two",
                      "!    alignas(64) std::atomic<std::size_t> head{0};",
                      "!    alignas(64) std::atomic<std::size_t> tail{0};",
                      "    alignas(64) std::array<T, N> slots{};",
                      "public:",
                      "    bool try_push(T v);        // producer",
                      "    bool try_pop(T& out);      // consumer",
                      "    std::size_t size() const;  // snapshot",
                      "};"],
        changed=["<b>No mutex, no condition_variable, no allocation</b> after construction.",
                 "head and tail on <b>separate cache lines</b>."],
        tests=[("pass", "Full and empty edges; wrap-around past N"),
               ("pass", "10,000,000 items arrive in order"),
               ("fail", "Two producers on one ring")],
        d_notes="STEP 8 (verified): all v13 tests pass, including unique_ptr values moved through the ring.\n\nNEXT BUG (master/v13/next_bug.cpp): two producers, 1,000,000 items each: the consumer got 1,476,725 of 2,000,000. Both producers read the same tail, write the same slot and publish the same index. It's also a data race. The rule is in the name.\n\nNEXT: we now have three queues and three stories about speed. v14 measures them properly.\n\nMASTER CODE: master/v13/ has the complete files and tests for this version.",
        exercises=["Write push_wait(): spin 100 times, then yield, until try_push succeeds.",
                   "Remove alignas from head and tail. Measure ns per item before and after.",
                   "Replace &amp; (N − 1) with % N and allow any N. What breaks, and what does it cost?"],
        checkpoint=["Why does SPSC need no lock?", "What does the release store in try_push publish?",
                    "What is false sharing?", "What goes wrong with two producers?"],
        e_notes="CHECKPOINT ANSWERS\n1. Each index has one writer; the other thread only reads it.\n2. The slot's contents, written before the store.\n3. Threads writing different variables on the same cache line slow each other down as the line moves between cores.\n4. Both read the same tail, write the same slot and store the same new tail: items are lost or duplicated, and it's a data race.\n\nEXERCISE 3: with % N the index arithmetic still works only if wrap-around of size_t stays consistent with N; for non-powers of two it doesn't, and the division is slower than a mask."),
    dict(
        id="v14", v="v14", name="Benchmark harness", footer="v14 · Benchmark harness",
        a_title="Which queue is fastest? Prove it.",
        problem=["We have three queues and plenty of opinions. So far: one run, any load, one average.",
                 "A feed handler is judged by its slowest messages, not its average one."],
        project="bench.hpp runs the same 1-producer, 1-consumer load against queues v7, v12 and v13.",
        model=["throughput  how many per second, flat out", "latency     how long ONE message waits", "",
               "p50     the typical message", "p99     1 in 100 is slower", "p99.9   1 in 1,000: the tail"],
        model_caption="Warm up, repeat, report the median, and always read the tail.",
        a_notes="STEP 1: ask the room which queue is fastest and by how much. Collect the guesses and the reasons. Then ask how they'd prove it.\n\nSTEP 2: two different questions. Throughput: how much can it move when saturated. Latency: how long one message waits, measured at a realistic rate. Averages hide the tail; percentiles show it. Trading systems care about p99 and p99.9.",
        b_title="The benchmark that measures nothing",
        tiny=["Stopwatch sw;",
              "std::uint64_t unused = 0;",
              "for (std::uint64_t i = 0; i < N; ++i)",
              "!    unused += i % 7;     // result never used",
              "double a = sw.seconds();", "",
              "sw.reset();",
              "std::uint64_t used = 0;",
              "for (std::uint64_t i = 0; i < N; ++i)",
              "    used += i % 7;",
              "double b = sw.seconds();",
              "~std::cout << used;       // result printed"],
        predict=["N = 500,000,000. Predict a and b.", "Then run it at -O2."],
        **{"break": ["Build at -O0. Are a and b close now?",
                     "Print unused as well. What happens to a?"]},
        b_notes="STEPS 3–4 (verified, master/v14/tiny_optimizer.cpp, GCC -O2): result unused 0.0002 ms, result used 640 ms. The compiler deleted the first loop because nothing observed its result.\n\nSTEP 5: at -O0 both loops run (and both are slow, so -O0 timings mean nothing). Printing unused brings the loop back.\n\nRULE: a benchmark must consume its result, and must be built with the optimization level you'll ship.",
        c_title="Measure what you mean, under the load you mean",
        c_diagram=None,
        explain=["<b>Warm up</b> first: caches, page faults and frequency scaling distort run one.",
                 "<b>Repeat</b> five times and take the <b>median</b>: one noisy run can't move it.",
                 "Measure latency at a <b>paced rate</b>, or you only time your own backlog."],
        rule="One number from one run is an anecdote. Report the median and the tail.",
        fix=["auto warm = make();               // 1. warm up,",
             "throughput_once(*warm, n / 10, push, pop);",
             "",
             "for (int r = 0; r < 5; ++r)        // 2. repeat",
             "    tp.push_back(throughput_once(...));",
             "std::sort(tp.begin(), tp.end());",
             "!res.million_per_sec = tp[tp.size() / 2];",
             "",
             "#// 3. latency at a paced 500k msg/s",
             "res.p50_ns  = percentile(lat, 0.50);",
             "~res.p99_ns  = percentile(lat, 0.99);",
             "res.p999_ns = percentile(lat, 0.999);"],
        c_notes="STEP 6: why pacing matters. Saturated, a queue fills up and every message's latency is mostly time spent behind the backlog; you measure the queue length, not the queue. At a steady 500k msg/s below capacity, latency shows the real cost per hand-off.\n\nSTEP 7: the harness in master/v14/bench.hpp. Median of five throughput runs after a discarded warm-up; latency percentiles from per-message timestamps.\n\nThe clock itself has a resolution (about 20 ns here): below that, readings are noise.",
        d_kicker="bench v14", d_title="v14: three queues, one harness",
        project_code=["#               M msg/s   latency at 500k/s, ns",
                      "#queue (1P/1C)  saturated    p50     p99   p99.9",
                      "ThreadSafeQueue    4.81    5768   901044  3.3M",
                      "TwoLockQueue       0.79   18345  3577659  6.1M",
                      "!SpscRing         104.78     263    50596  1.5M", "",
                      "#// 4-core Linux container, GCC, -O2",
                      "#// g++ -std=c++20 -O2 -pthread bench.cpp"],
        changed=["One <b>adapter</b> runs every queue through the same load.",
                 "SpscRing: about <b>20× the throughput</b> and a 20× lower median latency than v7."],
        tests=[("pass", "All three queues deliver 1,000,000 items in order"),
               ("pass", "The harness reports sane, non-zero numbers")],
        d_notes="STEP 8 (verified run in the notes table; your machine will differ, the ranking is what to check).\n\nREAD THE TAIL: even SpscRing has a p99.9 above a millisecond here. That's the OS descheduling a thread on a shared 4-core container, not the queue. Pinning threads to cores (exercise 2) is the Feed Handler's next step.\n\nNo should-fail test: this is the last version of the track.\n\nMASTER CODE: master/v14/ has the complete files and tests for this version.",
        exercises=["Run bench three times. Which numbers are stable, and which jump?",
                   "Pin the producer and consumer to separate cores and run again.",
                   "Print a latency histogram for SpscRing and plot it."],
        checkpoint=["Why warm up before measuring?", "Why the median, not the mean?",
                    "Why measure latency at a paced rate?", "What did -O2 do to the unused loop?"],
        e_notes="CHECKPOINT ANSWERS\n1. The first run pays for cold caches, page faults and CPU frequency ramp-up.\n2. One outlier run moves the mean but not the median.\n3. Saturated, latency is dominated by the backlog; paced below capacity it shows the cost per hand-off.\n4. Deleted it: nothing observed the result.\n\nEXERCISE 2: Linux taskset -c / pthread_setaffinity_np; Windows SetThreadAffinityMask.\n\nThis is the last topic. Next session: the Definition-of-done matrix and presentations."),
]


def main():
    deck = json.load(open(os.path.join(ROOT, "project/deck.json")))
    order = deck["order"]
    i = order.index("done")
    new_ids = ["p3"] + [t["id"] + s for t in TOPICS for s in "abcde"]
    order = order[:i] + new_ids + order[i:]
    deck["order"] = order
    deck["sections"]["part3"] = {"description": "Part 3: take the locks away and measure it, versions v11 to v14.",
                                 "start": "p3"}
    deck["sections"] = {k: deck["sections"][k] for k in ("intro", "part1", "part2", "part3", "finish")}
    num = {sid: n for n, sid in enumerate(order, 1)}
    files = {}

    # Part 3 divider
    items = ["v11  Atomics · memory order", "v12  Two-lock queue", "v13  Lock-free SPSC ring",
             "v14  Benchmark harness", "Finish  Definition of done"]
    lst = "".join(f'<p style="font-family:{MONO};font-size:26px;color:{SOFT}">{html.escape(s).replace("  ", "&#160;&#160;")}</p>' for s in items)
    body = (f'<div style="display:flex;flex-direction:row;gap:96px;flex:1;align-items:center">'
            f'<div style="display:flex;flex-direction:column;gap:24px;flex:1.3">{kicker("Part 3 · v11–v14", AMBER)}'
            f'<h1 style="font-family:{HEAD};font-size:112px;font-weight:700;line-height:1.0;letter-spacing:-3px;color:{CREAM}">Take the locks away</h1>'
            f'<p style="font-size:36px;line-height:1.4;color:{SOFT}">The pool works. Now make the queue fast enough for a feed handler, and prove it.</p></div>'
            f'<div style="flex:1;display:flex;flex-direction:column;gap:14px;border-left:2px solid {CODELINE};padding:8px 0 8px 48px">{lst}</div></div>'
            + footer("Part 3 · v11–v14", num["p3"], True))
    files["p3"] = section("p3", DARK, CREAM, body,
                          "PART 3 GOAL: the same queue, rebuilt twice more and measured. Atomics replace locks where a value is all we share (v11); the lock is split in two (v12); then removed for one producer and one consumer (v13); and all three are measured with a proper harness (v14).\n\nTHE SHIFT: Part 1 asked how threads share a queue safely, Part 2 how a caller gets results back. Part 3 asks what safety costs, and how to pay less. Say it explicitly.\n\nThis is the memory model, lock-based, lock-free and benchmarking phases of the bridge, each one topic deep. The project tracks go further.")
    for t in TOPICS:
        for s, fn in zip("abcde", (slide_a, slide_b, slide_c, slide_d, slide_e)):
            files[t["id"] + s] = fn(t, num[t["id"] + s])

    # --- updated existing slides
    def load(sid):
        return open(os.path.join(SL, sid + ".html")).read()

    def renum(src, sid):
        return re.sub(r'(text-align:right;font-family:[^"]*">)(\d+)(</p>\s*<aside>)',
                      lambda m: f"{m.group(1)}{num[sid]:02d}{m.group(3)}", src, count=1)

    for sid in ("done", "close"):
        files[sid] = renum(load(sid), sid)

    v10ne = load("v10ne").replace("This is the last topic. Next session: the Definition-of-done matrix and presentations.",
                                  "Last topic of Part 2. Next session: Part 3 starts with atomics. The Definition-of-done matrix comes after v14.")
    files["v10ne"] = v10ne

    cover = load("cover")
    cover = cover.replace("One project in eleven versions, every topic in ten steps.",
                          "One project in fifteen versions, every topic in ten steps.")
    cover = cover.replace("shutdown → queue&lt;T&gt; → tasks → pool → futures</p>",
                          "shutdown → queue&lt;T&gt; → tasks → pool → futures → atomics → two locks → lock-free → benchmarks</p>")
    cover = cover.replace("One project, a thread-safe queue, grows through eleven versions (v0–v10) into a thread pool with future-based results.",
                          "One project, a thread-safe queue, grows through fifteen versions: into a thread pool with future-based results (v0–v10), then into atomics, a two-lock queue, a lock-free SPSC ring and a benchmark harness (v11–v14).")
    files["cover"] = cover

    # ladder: 16 compact cards
    rungs = [("v0", "Ordinary queue", "concurrency vs parallelism", BROWN), ("v1", "Multiple threads", "lifetime · std::ref", BROWN),
             ("v2", "Mutex protected", "races · mutual exclusion", BROWN), ("v3", "RAII locking", "lock_guard · interface races", BROWN),
             ("v4", "condition_variable", "waiting · wait-for graphs", BROWN), ("v5", "Many producers", "load tests · deadlock", BROWN),
             ("v6", "Graceful shutdown", "lifecycle · notify_all", BROWN), ("v7", "Generic queue&lt;T&gt;", "move-only values", BROWN),
             ("v8", "Task queue", "std::function · exceptions", BLUE), ("v9", "Thread pool", "sizing · shared_mutex", BLUE),
             ("v10", "Futures", "future · promise · timeouts", BLUE), ("v11", "Atomics", "fetch_add · memory order", GREEN),
             ("v12", "Two-lock queue", "fine-grained locking", GREEN), ("v13", "Lock-free SPSC", "ring buffer · cache lines", GREEN),
             ("v14", "Benchmark harness", "throughput · p99", GREEN), ("next", "Project tracks", "Feed Handler first", MUTED)]
    cards = "".join(
        f'<div style="display:flex;flex-direction:column;gap:4px;background:{"#EEEBE3" if v == "next" else CARD};border:1px solid {LINE};'
        f'border-left:6px solid {c};border-radius:10px;padding:12px 20px">'
        f'<h3 style="font-family:{HEAD};font-size:28px;font-weight:600;line-height:1.15;color:{INK}">'
        f'<span style="font-family:{MONO};color:{c};font-weight:700">{v}</span>&#160;&#160;{title}</h3>'
        f'<p style="font-size:24px;line-height:1.3;color:{MUTED}">{sub}</p></div>' for v, title, sub, c in rungs)
    ladder = load("ladder")
    ladder = re.sub(r'<p style="font-family:[^"]*">The learning vehicle[^<]*</p><h2([^>]*)>[^<]*</h2><div style="flex:1;display:grid;grid-template-columns:1fr 1fr 1fr 1fr;gap:16px">.*?</div></div>\n',
                    lambda m: kicker("The learning vehicle · Part 1: v0–v7 · Part 2: v8–v10 · Part 3: v11–v14", BLUE)
                    + f'<h2{m.group(1)}>Fifteen versions of one queue</h2>'
                    + f'<div style="flex:1;display:grid;grid-template-columns:1fr 1fr 1fr 1fr;grid-template-rows:1fr 1fr 1fr 1fr;gap:14px">{cards}</div>\n',
                    ladder, count=1, flags=re.S)
    ladder = re.sub(r"<aside>THE VERSIONS\n[^\n]*\n",
                    "<aside>THE VERSIONS\nPart 1: v0 ordinary queue → v1 multiple threads → v2 mutex protected → v3 RAII locking → v4 condition_variable → v5 multiple producers/consumers → v6 graceful shutdown → v7 generic queue&lt;T&gt;.\nPart 2: v8 task queue → v9 thread pool → v10 future-based results.\nPart 3: v11 atomics → v12 two-lock queue → v13 lock-free SPSC ring → v14 benchmark harness.\n",
                    ladder, count=1)
    ladder = ladder.replace("so 17–20 sessions including the Part 1 checkpoint and final presentations.",
                            "so 21–24 sessions including the Part 1 checkpoint and final presentations.")
    files["ladder"] = ladder

    # concept map: three tables
    groups = [[("thread lifetime · std::ref · RAII", "v1"), ("race condition vs data race", "v2"), ("mutex · lock_guard", "v2 · v3"),
               ("interface races", "v3"), ("condition_variable", "v4"), ("wait-for graphs", "v4 · v5 · v10"), ("scoped_lock · recursive_mutex", "v5")],
              [("shutdown protocol", "v6"), ("move-only values · safe pop", "v7"), ("exceptions across threads", "v8"), ("cores vs waiting", "v0 · v9"),
               ("granularity · shared_mutex · call_once", "v9"), ("future · promise · packaged_task", "v10"), ("timeouts · nested-wait deadlock", "v10")],
              [("atomics · fetch_add", "v11"), ("release / acquire", "v11 · v13"), ("fine-grained locking", "v12"), ("lost wake-ups", "v4 · v12"),
               ("lock-free SPSC", "v13"), ("cache lines · false sharing", "v13"), ("percentiles · honest benchmarks", "v14")]]

    def table(rows):
        return (f'<div style="flex:1"><table style="font-family:{SANS};font-size:24px;color:{INK}"><tr style="background:#E6E0D3">'
                f'<th style="width:68%">Concept</th><th style="width:32%">Version</th></tr>'
                + "".join(f"<tr><td>{a}</td><td>{b}</td></tr>" for a, b in rows) + "</table></div>")
    cm = load("conceptmap")
    cm = re.sub(r'<div style="flex:1;display:flex;flex-direction:row;gap:48px">.*?</table></div></div>\n',
                lambda m: '<div style="flex:1;display:flex;flex-direction:row;gap:32px">' + "".join(table(g) for g in groups) + "</div>\n",
                cm, count=1, flags=re.S)
    cm = cm.replace("a config loaded on first use (static / call_once).",
                    "a config loaded on first use (static / call_once), a market-data hand-off between two threads (SPSC ring + benchmark).")
    files["conceptmap"] = renum(cm, "conceptmap")

    # next up: the three project tracks
    tracks = [("Feed Handler", "Starts from spsc_ring.hpp and bench.hpp. Next: pinned threads, busy-polling, parsing.", "v13 · v14"),
              ("Custom Allocator", "Atomics for per-thread caches, per-bucket locks, cache-line layout.", "v7 · v11 · v13"),
              ("Execution Simulator", "Event queues and the thread pool are its plumbing; futures carry results.", "v7 · v10 · v12")]
    cards = "".join(
        f'<div style="flex:1;display:flex;flex-direction:column;gap:14px;background:{CARD};border:1px solid {LINE};border-top:6px solid {BLUE};'
        f'border-radius:12px;padding:28px 28px"><h3 style="font-family:{HEAD};font-size:36px;font-weight:600;line-height:1.15;color:{INK}">{n}</h3>'
        f'<p style="font-size:26px;line-height:1.4;color:{MUTED}">{d}</p>{SPACER}'
        f'<p style="font-family:{MONO};font-size:24px;color:{BROWN}">Built on {v}</p></div>' for n, d, v in tracks)
    body = (kicker("After v14", BLUE) + h2("The project tracks start from code you wrote", 60) +
            f'<div style="flex:1;display:flex;flex-direction:row;gap:24px">{cards}</div>' + footer("What's next", num["nextup"], False))
    files["nextup"] = section("nextup", PAPER, INK, body,
                              "THE POINT: nobody opens a project repository cold. Each track starts from files the pair already wrote and tested.\n\n- Feed Handler: the SPSC ring (v13) is its core data structure; bench.hpp (v14) is how it will be judged. First steps: pin threads to cores, busy-poll instead of yield, parse real messages.\n- Custom Allocator: move semantics and object lifetime (v7), atomics for per-thread caches (v11), cache-line layout and false sharing (v13).\n- Execution Simulator: event queues between components (v7, v12) and the thread pool with futures (v10).\n\nSame method in every phase: ten steps per topic, one growing project.")

    out = os.path.join(OUT, "project")
    os.makedirs(os.path.join(out, "slides"), exist_ok=True)
    for sid, src in files.items():
        open(os.path.join(out, "slides", sid + ".html"), "w").write(src)
    json.dump(deck, open(os.path.join(out, "deck.json"), "w"), indent=1, ensure_ascii=False)
    print(len(order), "slides;", len(files), "files written")


if __name__ == "__main__":
    main()
