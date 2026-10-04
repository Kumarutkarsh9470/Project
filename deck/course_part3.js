// Course content, Part 3 (v11-v14).
module.exports = [
{
  id: "v11", ver: "v11", name: "Atomics", part: 3,
  problem: {
    title: "A monitor wants counts without locking",
    scene:
`workers:   finish task → completed++
dashboard: every 100 ms → read submitted, completed

with a mutex: every finished task queues
              behind the dashboard for the lock`,
    question: "Is a mutex the only way to make ++ safe across threads?",
  },
  predict: {
    code:
`int plain = 0;                      // A: no lock
int locked = 0; std::mutex m;       // B: mutex
std::atomic<int> counter{0};        // C: atomic
// two threads, 1,000,000 increments each
++plain;
{ std::lock_guard l(m); ++locked; }
counter.fetch_add(1);`,
    question: "Which totals are 2,000,000? Rank A, B, C by speed.",
    answer: "A: wrong (v2's race).\nB and C: 2,000,000.\n\nC is several times faster than B: no lock to wait for.",
  },
  breakit: {
    cmd: "./tiny_atomic   # -O0",
    output: "no lock:     1056548  (4 ms)\nstd::mutex:  2000000  (212 ms)\nstd::atomic: 2000000  (27 ms)",
    note: "Write counter = counter + 1 instead: an atomic load, then an atomic store. Two steps, updates lost again.",
  },
  why: {
    title: "One indivisible step, and what it publishes",
    timeline:
`++n on an int:   load → add → store     3 steps, can interleave
n.fetch_add(1):  load+add+store         1 step, nobody in between

Writer                     Reader
data = 42;
ready.store(true, release) ──▶ ready.load(acquire) == true
                               data is guaranteed 42`,
    caption: "relaxed: atomic, nothing more (enough for counters). release/acquire: everything written before the store is visible after the load.",
  },
  solution: {
    title: "Counters any thread can read",
    file: "pool.hpp",
    code:
`+ std::atomic<std::size_t> submitted{0};
+ std::atomic<std::size_t> completed{0};
  void run(Task& t) {
      t();
+     completed.fetch_add(1, std::memory_order_relaxed);
  }
+ std::size_t tasks_completed() const {
+     return completed.load(std::memory_order_relaxed);
+ }`,
    steps: ["submit() counts only after push() succeeded.", "relaxed is enough: each counter only has to be exact on its own.", "Reading never blocks a worker."],
  },
  learned: {
    key: "Atomic stops lost updates. Release/acquire decides what else the other thread sees.",
    explain: ["Why is ++n on an int a data race?", "What does fetch_add guarantee?", "When is relaxed enough?", "What does a release store promise?"],
  },
  practice: [
    { type: "A", q: "After 10,000 tasks finish, what must submitted and completed read?", a: "Both 10,000." },
    { type: "B", q: "The monitor reads submitted, then completed. Can completed > submitted appear?", a: "Yes: two separate loads aren't a snapshot. Read completed first, or treat it as an estimate." },
    { type: "C", q: "Make v9's default_pool() lazily created with atomics.", a: "std::atomic<ThreadPool*>; acquire load, then lock + re-check + release store (double-checked locking)." },
  ],
},
{
  id: "v12", ver: "v12", name: "Two-lock queue", part: 3,
  problem: {
    title: "Producers and consumers share one lock",
    scene:
`  consumers take here       producers add here
          ▼                         ▼
       [ a ][ b ][ c ][ d ][ e ][ f ]
          └──────── one mutex ────────┘`,
    question: "Producers touch only the tail, consumers only the head. Why should they wait for each other?",
  },
  predict: {
    code:
`$ ./next_bug   # v11, one mutex
1x1: 6.3 M items/s
4x4: ?      8x8: ?`,
    question: "Will more threads move more items per second?",
    answer: "No. 1x1 ≈ 5.7, 8x8 ≈ 2.0 M items/s.\n\nMore threads, more contention on one lock.",
  },
  breakit: {
    cmd: "./tiny_contention   # -O2",
    output: "1x1  one mutex: 6.1 M/s  two locks: 0.9 M/s\n4x4  one mutex: 3.7 M/s  two locks: 1.1 M/s",
    note: "Most people predict two locks win. Here they lost: every push allocates a node and takes two locks. Measure, don't believe.",
  },
  why: {
    title: "A dummy node keeps the ends apart",
    timeline:
`head_m                          tail_m
  ▼                               ▼
[ a ] → [ b ] → [ c ] → [ dummy ]

Consumer (holds head_m)     Producer (holds tail_m only)
check: empty
                            append, notify  ← nobody waiting
start waiting 😴             (v4's lost wake-up, again)`,
    caption: "Fix: push() briefly locks head_m before notifying, so the notify can't land in the consumer's check-then-sleep gap.",
  },
  solution: {
    title: "push() locks only the tail",
    file: "two_lock_queue.hpp",
    code:
`+ bool push(T v) {
+     auto dummy = std::make_unique<Node>();    // no lock yet
+     {
+         std::lock_guard<std::mutex> l(tail_m);
+         tail->value = std::move(v);
+         Node* new_tail = dummy.get();
+         tail->next = std::move(dummy);
+         tail = new_tail;
+     }
+     { std::lock_guard<std::mutex> l(head_m); }
+     cv.notify_one();
+     return true;
+ }`,
    steps: ["The old dummy receives the value; a new dummy becomes the tail.", "Allocate before locking.", "The destructor frees nodes in a loop: recursion overflows the stack at 1M nodes."],
  },
  learned: {
    key: "Splitting a lock trades less waiting for more work per operation. Only a measurement says which wins.",
    explain: ["Why does the dummy node let two locks work?", "Which lost wake-up does the empty lock prevent?", "Why can two locks be slower?", "Why a loop in the destructor?"],
  },
  practice: [
    { type: "A", q: "1,000,000 pushes. How many heap allocations in v7? In v12?", a: "v7: few (deque blocks). v12: 1,000,000 (one node each)." },
    { type: "B", q: "Remove the empty head_m lock. Trace a consumer that never wakes.", a: "Consumer sees empty → producer appends + notifies → consumer starts waiting: lost wake-up." },
    { type: "C", q: "Apply the idea to a hash map. What do you lock?", a: "One mutex per bucket: threads on different buckets don't wait for each other." },
  ],
},
{
  id: "v13", ver: "v13", name: "Lock-free SPSC ring", part: 3,
  problem: {
    title: "One producer, one consumer, millions of messages",
    scene:
`network thread ──▶ [ queue ] ──▶ parser thread
                   ~1–4 µs per item (v12)
                   a message must cost ~100 ns`,
    question: "Locks, allocation and sleeping cost more than the message. With exactly one producer and one consumer, which of them do we really need?",
  },
  predict: {
    code:
`struct Together { std::atomic<long> a, b; };
struct Apart {
    alignas(64) std::atomic<long> a;
    alignas(64) std::atomic<long> b;
};
// thread 1: ++s.a 50M times · thread 2: ++s.b 50M times`,
    question: "Nothing is shared. Which struct is faster, and by how much?",
    answer: "Apart, about 4× faster.\n\nOn one 64-byte cache line, the two cores keep stealing the line from each other.",
  },
  breakit: {
    cmd: "./tiny_false_sharing",
    output: "same cache line:      1.53 s\nseparate cache lines: 0.39 s",
    note: "This is false sharing. The ring puts head and tail on separate lines.",
  },
  why: {
    title: "One writer per index: nothing to lock",
    timeline:
`slots: [ . | a | b | c | . | . | . | . ]
             ▲           ▲
            head        tail
consumer owns head · producer owns tail

Producer                         Consumer
write slot 5
tail.store(6, release) ───────▶ tail.load(acquire) == 6
                                read slot 5 (guaranteed visible)
                                head.store(6, release)`,
    caption: "That's v11's publish pattern, twice. The rule: exactly ONE producer and ONE consumer.",
  },
  solution: {
    title: "Write the slot, then publish it",
    file: "spsc_ring.hpp",
    code:
`+ bool try_push(T v) {                 // producer only
+     auto t = tail.load(std::memory_order_relaxed);
+     if (t - head.load(std::memory_order_acquire) == N)
+         return false;                 // full
+     slots[t & (N - 1)] = std::move(v);
+     tail.store(t + 1, std::memory_order_release);
+     return true;
+ }
+ // try_pop: the mirror image on head`,
    steps: ["A fixed array of N slots (N a power of two): no allocation.", "No mutex, no condition_variable: try_ functions only.", "head and tail each alignas(64)."],
  },
  learned: {
    key: "Lock-free code is only correct under its rules. SPSC: one writer per index.",
    explain: ["Why does SPSC need no lock?", "What does the release store publish?", "What is false sharing?", "What breaks with two producers?"],
  },
  practice: [
    { type: "A", q: "N = 1024, tail = 5000, head = 4000. How full is the ring? Can we push?", a: "1000 items. Yes: 1000 < 1024." },
    { type: "B", q: "Two producers both read tail = 7. Trace it.", a: "Both write slot 7, both store tail = 8: one item lost. (Real run: 1,255,101 of 2,000,000.)" },
    { type: "C", q: "The consumer has nothing to read. Spin, yield or sleep?", a: "Lowest latency: spin. Fair CPU: yield. Idle a long time: sleep. The caller chooses." },
  ],
},
{
  id: "v14", ver: "v14", name: "Benchmark harness", part: 3,
  problem: {
    title: "Which queue is fastest? Prove it.",
    scene:
`ThreadSafeQueue (v7)    "simple, probably fine"
TwoLockQueue   (v12)    "less contention, must be faster"
SpscRing       (v13)    "lock-free, must be fastest"`,
    question: "Every number so far came from one run, at whatever load. Is that proof?",
  },
  predict: {
    code:
`Stopwatch sw;
std::uint64_t unused = 0;
for (std::uint64_t i = 0; i < 500'000'000; ++i)
    unused += i % 7;           // result never used
std::cout << sw.seconds();     // built with -O2`,
    question: "How long does the loop take?",
    answer: "About 0 ms.\n\nThe compiler deleted a loop whose result nobody reads. Print the sum and it takes ~640 ms.",
  },
  breakit: {
    cmd: "./tiny_optimizer   # -O2",
    output: "result unused: 0.0002 ms\nresult used:   640 ms",
    note: "A benchmark must use its result, and be built the way you ship.",
  },
  why: {
    title: "Throughput is not latency",
    timeline:
`throughput   how many per second, flat out
latency      how long ONE message waits

p50     the typical message
p99     1 in 100 is slower than this
p99.9   1 in 1,000: where trouble lives

saturated queue → you only time your own backlog`,
    caption: "Warm up and discard it. Repeat 5 times, report the median. Measure latency at a paced rate below capacity.",
  },
  solution: {
    title: "Three queues, one harness",
    file: "bench.cpp   (-O2, 1 producer, 1 consumer)",
    code:
`                   M msg/s     latency at 500k msg/s
queue              saturated   p50       p99
ThreadSafeQueue      4.8       5.8 µs    0.9 ms
TwoLockQueue         0.8      18.3 µs    3.6 ms
SpscRing           104.8       0.26 µs   0.05 ms`,
    steps: ["SpscRing: ~20× the throughput, ~20× lower median latency.", "Why: no locks, no allocation, no sleeping.", "Even its p99.9 reaches ~1 ms: the OS pausing a thread. That's the Feed Handler's next problem."],
  },
  learned: {
    key: "One number from one run is an anecdote. Report the median, and read the tail.",
    explain: ["Why warm up?", "Why the median, not the mean?", "Why a paced rate for latency?", "What did -O2 do to the unused loop?"],
  },
  practice: [
    { type: "A", q: "5 runs: 4.1, 4.8, 4.9, 5.0, 12.0 M/s. Mean? Median? Which to report?", a: "Mean 6.16, median 4.9. Report the median: one outlier moved the mean." },
    { type: "B", q: "1,000,000 latencies sorted. Which index is p99?", a: "Index 990,000 (99% are at or below it)." },
    { type: "C", q: "Design a fair comparison of your queue vs a friend's.", a: "Same machine, -O2, same load, warm-up, 5+ runs, median throughput, p50/p99/p99.9 at a paced rate." },
  ],
},
];
