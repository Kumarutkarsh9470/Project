// Course content, Part 1 continued (v4 timeline, v5-v7).
const extraV4 = {
  title: "Inside cv.wait(lock, pred), step by step",
  timeline:
`CONSUMER                         PRODUCER

lock mutex
queue empty?  YES
   ├── release mutex  ┐ one step
   └── SLEEP          ┘
                                 lock mutex
                                 push item
                                 unlock
                                 notify_one()
wakes
reacquire mutex
check predicate: !q.empty() = true
pop item`,
  caption: "Before wait(): the consumer owns the mutex. While asleep: nobody does, so the producer can push. When wait() returns: the consumer owns it again, and the condition is true.",
};

module.exports = { extraV4, topics: [
{
  id: "v5", ver: "v5", name: "Many producers and consumers", part: 1,
  problem: {
    title: "It works once. Does it work under load?",
    scene:
`  P1 ─┐                ┌─▶ C1
  P2 ─┤   ┌────────┐   ├─▶ C2
  P3 ─┼──▶│ queue  │───┼─▶ C3
  P4 ─┘   └────────┘   └─▶ C4`,
    question: "One run printed the right total. How sure are you that 4 producers and 4 consumers never lose or duplicate an item?",
  },
  predict: {
    code:
`// 4 threads add 1,000,000 numbers each
// A: lock per item
for (...) { lock_guard l(m); total += i; }
// B: lock once
long local = 0;
for (...) local += i;
{ lock_guard l(m); total += local; }`,
    question: "Are both correct? How much faster is B?",
    answer: "Both correct.\n\nB is about 100× faster: it touches the shared total once instead of a million times.",
  },
  breakit: {
    cmd: "./tiny_contention",
    output: "A lock per item: 413 ms\nB lock once:     3 ms",
    note: "Same answer, 100× the time. And 1,000 items per producer hid v1's crash: each thread finished before the next started.",
  },
  why: {
    title: "Contention: threads queuing for one lock",
    timeline:
`T1 ██ lock ██ ......... ██ lock ██
T2 ... waiting ... ██ lock ██ .....
T3 ....... waiting ....... ██ lock ██
T4 .......... waiting ..........`,
    caption: "Passing a lock between cores costs more than a tiny push. Share less: work locally, touch shared state rarely.",
  },
  solution: {
    title: "Test every workload, and batch",
    file: "queue.hpp + tests.cpp",
    code:
`+ void push_all(const std::vector<int>& xs) {
+     {
+         std::lock_guard<std::mutex> lock(m);
+         for (int x : xs) push_locked(x);
+     }
+     cv.notify_all();
+ }
  // test matrix: 1x1, 4x1, 1x4, 4x4,
  // N = 10 and 200,000, slow producers, slow consumers
  // check: count, SUM, no hang, idle CPU ~0%`,
    steps: ["The sum catches a loss and a duplicate that cancel out in the count.", "Use 100,000 items per thread, not 1,000.", "push_all takes the lock once per batch: about 4× faster."],
  },
  learned: {
    key: "Concurrent code is proven by stress tests across workloads, never by one run.",
    explain: ["Why check the sum as well as the count?", "Why did 1,000 items hide the crash?", "What is contention?", "Why does batching help?"],
  },
  practice: [
    { type: "A", q: "4 producers push 0..99,999 each. What sum must the consumers see?", a: "4 × (99,999 × 100,000 / 2) = 19,999,800,000." },
    { type: "B", q: "Consumer loses item 5 and receives item 7 twice. Does the count catch it? The sum?", a: "Count: no (same total). Sum: yes, off by 2." },
    { type: "C", q: "Producers send in bursts of 1,000. How do you cut locking cost?", a: "Batch: push_all takes the lock once per burst and notifies once." },
  ],
},
{
  id: "v5d", ver: "v5", name: "Deadlock", part: 1,
  problem: {
    title: "Rebalance two queues",
    scene:
`  q1 [■■■■■■■■■■]   ← piling up
  q2 [ ]             ← running dry

  q1.move_all_to(q2) needs BOTH locks`,
    question: "Thread 1 moves q1 → q2 while thread 2 moves q2 → q1. Each locks its own queue first, then the other. What can happen?",
  },
  predict: {
    code:
`void move_all_to(Queue& other) {
    std::lock_guard a(m);
    std::lock_guard b(other.m);
    ...
}
// T1: q1.move_all_to(q2)
// T2: q2.move_all_to(q1)`,
    question: "Draw who holds what and who waits for what.",
    answer: "T1 holds q1.m, waits for q2.m.\nT2 holds q2.m, waits for q1.m.\n\nBoth wait forever.",
  },
  breakit: {
    cmd: "./tiny_deadlock",
    output: "[frozen: stopped after 10 s]",
    note: "Opposite-direction moves froze 3 runs out of 3. With less timing luck it freezes once a week in production.",
  },
  why: {
    title: "A cycle in the wait-for graph",
    timeline:
`T1 holds q1.m ──waits for──▶ q2.m
       ▲                        │
       │                        ▼
   q1.m ◀──waits for── T2 holds q2.m

cycle = deadlock`,
    caption: "Break the cycle: take both locks together, or always in one global order. Never lock the same mutex twice.",
  },
  solution: {
    title: "Two locks, taken together",
    file: "queue.hpp",
    code:
`  void move_all_to(Queue& other) {
+     if (this == &other) return;   // locking m twice is UB
-     std::lock_guard a(m);
-     std::lock_guard b(other.m);
+     std::scoped_lock lock(m, other.m);
      while (!q.empty()) {
          other.q.push(q.front()); q.pop();
      }
  }`,
    steps: ["scoped_lock locks several mutexes with a deadlock-free algorithm.", "push_all calls private push_locked(), never public push(): public functions lock, helpers assume.", "Needing recursive_mutex usually means the lock boundaries are wrong."],
  },
  learned: {
    key: "Take several locks together or in one fixed order. Never lock the same mutex twice.",
    explain: ["What must be true for a deadlock?", "Two ways to make a two-lock operation safe?", "Why check this == &other?", "Why is recursive_mutex a smell?"],
  },
  practice: [
    { type: "A", q: "3 threads each lock 2 of 3 mutexes, always lowest address first. Can they deadlock?", a: "No. One global order means no cycle." },
    { type: "B", q: "push_all locks m, then calls push(), which locks m. Trace it.", a: "The same thread waits for a lock it holds: frozen (std::mutex) or UB." },
    { type: "C", q: "Design transfer(a, b, amount) between two bank accounts.", a: "scoped_lock(a.m, b.m), check a == b first, then move the amount." },
  ],
},
{
  id: "v6", ver: "v6", name: "Graceful shutdown", part: 1,
  problem: {
    title: "The producers are done. The program never exits.",
    scene:
`Producers: push ... push ... return ✔
Consumers: pop ... pop ... wait_and_pop() 😴
main:      join consumers ... waiting ...`,
    question: "Consumers no longer know how many items will come. How can they find out that no more items are coming?",
  },
  predict: {
    code:
`void shutdown() {
    std::lock_guard lock(m);
    closed = true;
    cv.notify_one();
}
// 2 consumers are asleep in wait()`,
    question: "How many consumers wake up and leave?",
    answer: "One. notify_one wakes a single waiter.\n\nThe other sleeps forever and main hangs on join().",
  },
  breakit: {
    cmd: "./tiny",
    output: "woke up\n[frozen: stopped after 10 s]",
    note: "Change one word, notify_one → notify_all, and it exits.",
  },
  why: {
    title: "Shutdown is a protocol",
    timeline:
`RUNNING    push ok · pop waits
   ↓ shutdown()
CLOSED     push rejected · EVERY waiter woken
   ↓ queue drains
DRAINED    wait_and_pop() returns "nothing"
   ↓
consumers return · threads joined`,
    caption: "Set closed under the lock (else it can fall into v4's gap), wake everyone, let each waiter see it. No int can mean \"nothing\": return std::optional.",
  },
  solution: {
    title: "A closed flag, and pushes that can say no",
    file: "queue.hpp",
    code:
`+ bool closed = false;            // guarded by m
+ std::optional<int> wait_and_pop() {
      std::unique_lock lock(m);
-     cv.wait(lock, [&] { return !q.empty(); });
+     cv.wait(lock, [&] { return !q.empty() || closed; });
+     if (q.empty()) return std::nullopt;   // closed + drained
      int v = q.front(); q.pop(); return v;
  }
+ void shutdown() {
+     { std::lock_guard l(m); closed = true; }
+     cv.notify_all();
+ }`,
    steps: ["The predicate checks both conditions.", "Queued items are still consumed (drain policy).", "push() after shutdown() returns false."],
  },
  learned: {
    key: "Shutdown: change the state under the lock, wake everyone, let each waiter see it.",
    explain: ["Why notify_all in shutdown()?", "Why std::optional?", "What happens to queued items?", "Why set closed under the lock?"],
  },
  practice: [
    { type: "A", q: "1,000 items queued, then shutdown(). How many do consumers still receive?", a: "All 1,000. nullopt only when closed AND empty." },
    { type: "B", q: "closed = true is set WITHOUT the lock. Trace a lost wake-up.", a: "Consumer checks (not closed) → main sets closed + notifies → consumer starts waiting: sleeps forever." },
    { type: "C", q: "A bounded queue: producers wait while full. What must shutdown() also do?", a: "Wake waiting producers too (notify_all on their cv) and make push return false." },
  ],
},
{
  id: "v7", ver: "v7", name: "Generic queue<T>", part: 1,
  problem: {
    title: "Next we'll queue work, not ints",
    scene:
`Queue<int>        ✔
Queue<std::string>             ?
Queue<std::unique_ptr<Job>>    ?  can't be copied at all`,
    question: "Our queue only holds int and copies values everywhere. What breaks when values are big, or can't be copied?",
  },
  predict: {
    code:
`T pop() {
    T v = std::move(q.front());
    q.pop();              // item removed
    return v;
}
x = queue.pop();          // this assignment throws`,
    question: "If the caller's assignment throws, where is the item?",
    answer: "Gone. It was removed from the queue and never stored.\n\nThat's why std::queue::pop() returns void.",
  },
  breakit: {
    cmd: "g++ -DSHOW_BUG next_bug.cpp   # v6",
    output: "error: cannot convert\n'unique_ptr<int>' to 'int'",
    note: "An int-only queue can't carry ownership.",
  },
  why: {
    title: "Copy, move, or lose it",
    timeline:
`push(const T&)   copies    → unique_ptr won't compile
push(T v)        moves in  → works for every type

pop() returns T  → a throw after removal loses it
optional<T> built by moving → nothing lost`,
    caption: "Moving a standard type doesn't throw. Copying can, or can be impossible.",
  },
  solution: {
    title: "Make it a template that moves",
    file: "queue.hpp",
    code:
`- class Queue {
-     std::queue<int> q;
+ template <class T>
+ class ThreadSafeQueue {
+     std::queue<T> q;
-     bool push(int x) { ... q.push(x); ... }
+     bool push(T v)   { ... q.push(std::move(v)); ... }
-     std::optional<int> wait_and_pop()
+     std::optional<T> wait_and_pop()
      { ... T v = std::move(q.front()); q.pop(); return v; }`,
    steps: ["Take by value, then move in.", "Move out, never copy out.", "The queue can't be copied: mutex and cv can't be, and it would make no sense."],
  },
  learned: {
    key: "A generic concurrent container moves its values and never loses one when something throws.",
    explain: ["Why move instead of copy?", "Why does std::queue::pop() return void?", "Why can't the queue be copied?", "What breaks with push(const T&)?"],
  },
  practice: [
    { type: "A", q: "Pushing a 1 MB std::string by copy vs by move: bytes copied?", a: "Copy: 1 MB. Move: a few pointers." },
    { type: "B", q: "ThreadSafeQueue<std::unique_ptr<int>> q; q.push(p); Does it compile?", a: "No: p is an lvalue. q.push(std::move(p)) compiles." },
    { type: "C", q: "Part 1 checkpoint: list every rule your queue now follows.", a: "Lock every access · RAII · one-lock operations · wait with predicate · notify after change · closed + notify_all · move values." },
  ],
},
]};
