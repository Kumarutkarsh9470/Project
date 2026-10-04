// Course content, Part 1 (v0-v7). Each topic runs the seven steps:
// PROBLEM, PREDICT, BREAK IT, WHY?, SOLUTION, LEARNED, PRACTICE.
// Lines in `solution.code` starting with "+ " are added, "- " removed.
module.exports = [
{
  id: "v0", ver: "v0", name: "Ordinary queue", part: 1,
  problem: {
    title: "Can a second thread make this faster?",
    scene:
`  main thread
  ┌──────────────────────────────────────────┐
  │ produce produce produce  consume consume │
  └──────────────────────────────────────────┘
                time →`,
    question: "Producing and consuming happen one after the other. If we put them on two threads, will the program run twice as fast?",
  },
  predict: {
    code:
`void task() { sleep_for(2s); }   // waits, no CPU

// A: one thread
task(); task();

// B: two threads
std::thread t1(task), t2(task);
t1.join(); t2.join();`,
    question: "How long does A take? How long does B take? Did either task itself get faster?",
    answer: "A: 4 s. B: 2 s.\n\nNeither task got faster. The two waits overlapped.",
  },
  breakit: {
    cmd: "./tiny",
    output: "sequential:  4.00 s\ntwo threads: 2.00 s",
    note: "Now replace sleep with a loop that computes. On one core, two threads take turns and nothing gets faster.",
  },
  why: {
    title: "Taking turns is not running together",
    timeline:
`ONE CORE, TWO THREADS            TWO CORES
core 0: T1 T1 T2 T1 T2 T2        core 0: T1 T1 T1 T1 T1
        ↑ the OS switches        core 1: T2 T2 T2 T2 T2
          between them                   ↑ truly at once`,
    caption: "Concurrency: several tasks in progress (structure).\nParallelism: running at the same instant (needs cores).",
  },
  solution: {
    title: "First, a correct baseline",
    file: "queue.hpp",
    code:
`class Queue {
    std::queue<int> q;
public:
    void push(int x) { q.push(x); }
    int pop() {
        int v = q.front();
        q.pop();
        return v;
    }
    std::size_t size() const { return q.size(); }
};`,
    steps: ["A thin wrapper around std::queue<int>.", "One thread: producer() fills it, then consumer() drains it.", "Measure it: about 60 ns per push + pop. Every later version is compared to this."],
  },
  learned: {
    key: "Threads overlap waiting. Only more cores speed up computing.",
    explain: ["What is concurrency? What is parallelism?", "When can two threads help on one core?", "Who decides which thread runs next?", "Why measure before adding threads?"],
  },
  practice: [
    { type: "A", q: "64 tasks each sleep 100 ms. How long on 1 thread? On 64 threads?", a: "6.4 s vs about 0.1 s. Waiting overlaps perfectly." },
    { type: "B", q: "Two threads each print 1 to 3. Is \"1 1 2 3 2 3\" possible?", a: "Yes. Any interleaving that keeps each thread's own order is possible." },
    { type: "C", q: "A program downloads 10 files, then hashes them. Where would threads help?", a: "The downloads (waiting). The hashing only speeds up with more cores." },
  ],
},
{
  id: "v1", ver: "v1", name: "Multiple threads", part: 1,
  problem: {
    title: "Give the producer its own thread",
    scene:
`  main ──creates──▶ std::thread t(producer)
    │
    └── returns from main ... t is destroyed
                              what happens to
                              the running thread?`,
    question: "main starts a thread and returns. The std::thread object is destroyed while the thread runs. What should C++ do?",
  },
  predict: {
    code:
`void work() { std::cout << "working\\n"; }

int main() {
    std::thread t(work);
}   // t is destroyed here`,
    question: "Does this print \"working\" and exit normally?",
    answer: "No. The program aborts (std::terminate).\n\nA std::thread that is still joinable must not be destroyed.",
  },
  breakit: {
    cmd: "./tiny terminate",
    output: "terminate called without an active exception\nAborted",
    note: "Then pass the queue without std::ref: the thread fills its own copy, and main's queue stays empty.",
  },
  why: {
    title: "A thread object owns a running thread",
    timeline:
`std::thread object ──owns──▶ OS thread

before the object dies, choose one:
   join()    wait here until it finishes
   detach()  let it run with no owner

destroyed while joinable → std::terminate`,
    caption: "C++ refuses to guess. Arguments are COPIED into the new thread: std::ref(q) shares the real queue.",
  },
  solution: {
    title: "An owner that always joins",
    file: "thread_group.hpp",
    code:
`+ class ThreadGroup {
+     std::vector<std::thread> ts;
+ public:
+     void add(std::thread t) { ts.push_back(std::move(t)); }
+     ~ThreadGroup() {
+         for (auto& t : ts)
+             if (t.joinable()) t.join();
+     }
+ };
  ThreadGroup g;
+ g.add(std::thread(producer, std::ref(q), n));`,
    steps: ["The destructor joins every thread, on every path out, even an exception.", "std::ref(q) passes the real queue, not a copy.", "In this project we never detach."],
  },
  learned: {
    key: "Every thread needs exactly one owner that joins it. Let a destructor be that owner.",
    explain: ["What happens if a joinable thread is destroyed?", "Why are thread arguments copied?", "Why is std::thread move-only?", "When is detach() safe?"],
  },
  practice: [
    { type: "A", q: "4 producers × 100,000 pushes into one plain std::queue. Expected size?", a: "400,000 expected. In practice: a crash or hang. That's v2." },
    { type: "B", q: "t1.join(); t2.join(); std::cout << \"Done\"; Can \"Done\" print before A or B?", a: "No. Done waits for both joins. A and B can be in either order." },
    { type: "C", q: "An exception is thrown after starting 3 threads. How do you make sure they're joined?", a: "Put them in an RAII owner (ThreadGroup or std::jthread)." },
  ],
},
{
  id: "v2", ver: "v2", name: "Mutex protected", part: 1,
  problem: {
    title: "Two producers, one queue",
    scene:
`              SHARED QUEUE
          ┌─────────────────┐
          │  10   20   30   │
          └─────────────────┘
              ↑         ↑
           Producer   Producer
            T1           T2`,
    question: "Both threads call q.push() at the same time. Is this safe?",
  },
  predict: {
    code:
`int counter = 0;
void inc() {
    for (int i = 0; i < 1'000'000; ++i)
        ++counter;
}
std::thread t1(inc), t2(inc);
t1.join(); t2.join();
std::cout << counter;`,
    question: "What does it print? Will it be the same every run?",
    answer: "Not 2,000,000, and different every run.\n\nThe next three slides show why.",
  },
  breakit: {
    cmd: "./tiny     # run 5 times, -O0",
    output: "race: 1556397\nrace: 1114575\nrace: 1363955\nrace: 1099554\nrace: 1074728",
    note: "And v1's 4 producers × 100,000: segmentation fault. push() changes the queue's internal pointers the same way.",
  },
  why: {
    title: "++counter is three steps",
    timeline:
`T1                         T2

READ  counter → 0
                           READ  counter → 0
ADD   → 1
WRITE 1
                           ADD   → 1
                           WRITE 1

two increments, counter is 1: one update lost`,
    caption: "Both threads work from shared state the other can change.\nThat is a DATA RACE: same memory, at least one write, no synchronization. Undefined behaviour.",
  },
  solution: {
    title: "Only one thread inside at a time",
    file: "queue.hpp",
    code:
`  class Queue {
      std::queue<int> q;     // guarded by m
+     std::mutex m;
  public:
      void push(int x) {
+         m.lock();
          q.push(x);
+         m.unlock();
      }
  };`,
    steps: ["We need: if T1 is modifying the queue, T2 must WAIT. That is mutual exclusion.", "lock() → enter the critical section → modify shared state → unlock().", "Rule: every access to q goes through the same m. Readers too: size() reads while push() writes."],
  },
  learned: {
    key: "A data race is unsynchronized access with at least one write. A mutex makes threads take turns.",
    explain: ["What is shared state?", "What is a data race?", "What is a critical section?", "Why do we need mutual exclusion?", "Is \"read-only\" automatically thread-safe?"],
  },
  practice: [
    { type: "A", q: "Push cost: 44 ns on 1 thread, 141 ns each on 4. Why slower?", a: "4 threads queue up for one lock. Passing it between cores is expensive." },
    { type: "B", q: "m.lock(); foo(); m.unlock(); What happens if foo() throws?", a: "unlock() never runs. m stays locked; the next lock() waits forever. That's v3." },
    { type: "C", q: "Thread A calls q.size() while B calls q.push(100). Safe without a lock?", a: "No. A reads state B is changing: a data race. size() must lock too." },
  ],
},
{
  id: "v3", ver: "v3", name: "RAII locking", part: 1,
  problem: {
    title: "A consumer arrives too early",
    scene:
`int pop() {
    m.lock();
    if (q.empty())
        throw std::runtime_error("empty");
    ...
    m.unlock();
}`,
    question: "The queue is empty and pop() throws. What happens to the mutex?",
  },
  predict: {
    code:
`m.lock()
   ↓
throw
   ↓
m.unlock()  ?`,
    question: "Where did unlock() go? What happens when the producer calls push()?",
    answer: "unlock() never executes.\n\nThe mutex stays locked. push() calls lock() and waits forever.",
  },
  breakit: {
    cmd: "./tiny_raii",
    output: "try_lock after the exception: 0",
    note: "0 means the mutex is still held. In v2's project test every thread froze.",
  },
  why: {
    title: "Something must run on every way out",
    timeline:
`mutex remains locked
       ↓
another thread calls lock()
       ↓
waits forever
       ↓
program hangs

exception thrown → stack unwinds →
destructors of every local STILL run`,
    caption: "We met this in v1: ThreadGroup joins in its destructor. Use the same trick for the lock.",
  },
  solution: {
    title: "The mutex tied to an object's lifetime",
    file: "queue.hpp",
    code:
`  int pop() {
-     m.lock();
+     std::lock_guard<std::mutex> lock(m);
      if (q.empty())
          throw std::runtime_error("empty");
      int v = q.front(); q.pop();
-     m.unlock();
      return v;
  }   // ← destructor: unlock()`,
    steps: ["constructor → lock mutex ··· critical section ··· destructor → unlock mutex.", "Return, throw, break: the destructor runs on every path.", "Name the object. lock_guard<std::mutex>(m); is a temporary that unlocks at the semicolon."],
  },
  learned: {
    key: "Never unlock by hand. Let a destructor release the lock.",
    explain: ["Why RAII?", "Why lock_guard?", "When exactly does it unlock?", "What happens during an exception?", "Why does scope matter?"],
  },
  practice: [
    { type: "A", q: "A function has 4 return statements and 1 throw. How many unlock() calls do you need with lock_guard?", a: "Zero. The destructor handles all 5 exits." },
    { type: "B", q: "std::lock_guard<std::mutex>(m); ++counter; Is counter protected?", a: "No. The unnamed temporary unlocks at the semicolon." },
    { type: "C", q: "You must unlock before slow logging at the end. Which lock type?", a: "std::unique_lock: call lock.unlock() early." },
  ],
},
{
  id: "v3i", ver: "v3", name: "Interface races", part: 1,
  problem: {
    title: "Every call locks. Is it safe now?",
    scene:
`Queue:  [ 42 ]

Consumer A             Consumer B
if (!q.empty())        if (!q.empty())
    q.pop();               q.pop();`,
    question: "empty() locks. pop() locks. One item, two consumers. Can anything go wrong?",
  },
  predict: {
    code:
`Consumer A            Consumer B

empty() → false       empty() → false
pop()   → 42
                      pop()   → ???`,
    question: "Both consumers received false. How? What does B's pop() do?",
    answer: "Between A's check and A's pop, B checked too.\n\nB's pop() finds an empty queue and throws.",
  },
  breakit: {
    cmd: "./tiny_interface",
    output: "top() hit an empty stack in 186 of 200 rounds",
    note: "ThreadSanitizer reports nothing: there is no data race.",
  },
  why: {
    title: "The gap between two calls",
    timeline:
`if (!q.empty())   ← lock, check, unlock
                    ... another thread runs ...
    q.pop();      ← lock, pop, unlock

two calls = two locks = a gap`,
    caption: "A function can be thread-safe on its own while a SEQUENCE of calls is not. Check-then-act across a gap is a race condition.",
  },
  solution: {
    title: "Check and take in one call",
    file: "queue.hpp",
    code:
`+ bool try_pop(int& out) {
+     std::lock_guard<std::mutex> lock(m);
+     if (q.empty())
+         return false;
+     out = q.front();
+     q.pop();
+     return true;
+ }`,
    steps: ["Check, read and remove under ONE lock.", "Never throws: returns false when there's nothing.", "empty() now only means \"was empty a moment ago\". Don't act on it."],
  },
  learned: {
    key: "A check and the action it guards must happen under one lock.",
    explain: ["Race condition without a data race: example?", "Why does std::queue::pop() return void?", "What does empty() promise?", "Why does empty() need a mutable mutex?"],
  },
  practice: [
    { type: "A", q: "2 consumers, 1,000 items, check-then-pop. Can exceptions happen?", a: "Yes, on the last items, whenever both pass the check together." },
    { type: "B", q: "A map has locked contains() and insert(). Trace two threads inserting key 7.", a: "Both see contains(7) == false; both insert. Second insert overwrites or fails." },
    { type: "C", q: "Design the map's API so that race can't happen.", a: "insert_if_absent(key, value): check and insert under one lock." },
  ],
},
{
  id: "v4", ver: "v4", name: "condition_variable", part: 1,
  problem: {
    title: "Our consumer is wasting a CPU",
    scene:
`int x;
while (!q.try_pop(x)) {
    // try again
}`,
    question: "The queue is empty for one second. What is this consumer doing during that second?",
  },
  predict: {
    code:
`$ ./next_bug     # v3
checked an empty queue
?????????? times in 1 s`,
    question: "Guess the number. Is any of that work useful?",
    answer: "About 10–12 million checks.\n\nAll useless: checking an empty queue. A whole core is burned doing nothing.",
  },
  breakit: {
    cmd: "try a nap instead",
    output: "if (q.empty()) {\n    m.unlock();\n    sleep(1);\n    m.lock();\n}",
    note: "Item arrives right after the check? The consumer still sleeps a full second. And with a notification instead of sleep, it gets worse (next slide).",
  },
  why: {
    title: "The gap between unlocking and sleeping",
    timeline:
`Consumer                   Producer

"queue empty"
unlock
     ← scheduling gap →
                           push item
                           notify  ← nobody waiting yet
start waiting
    😴 forever             (the item sits in the queue)`,
    caption: "This is the LOST WAKE-UP. We need one operation that releases the mutex and starts waiting as a single step.",
  },
  solution: {
    title: "Sleep until something changes",
    file: "queue.hpp",
    code:
`+ std::condition_variable cv;
  void push(int x) {
      { std::lock_guard<std::mutex> lock(m); q.push(x); }
+     cv.notify_one();
  }
+ int wait_and_pop() {
+     std::unique_lock<std::mutex> lock(m);
+     cv.wait(lock, [&] { return !q.empty(); });
+     int v = q.front(); q.pop();
+     return v;
+ }`,
    steps: ["wait() releases the lock and sleeps in ONE step: no gap.", "On wake-up it re-takes the lock and re-checks the predicate: while (!cond) sleep, never if.", "unique_lock, because wait() must unlock and re-lock it."],
  },
  learned: {
    key: "wait() releases the lock and sleeps in one step, and always re-checks when it wakes.",
    explain: ["Why is busy waiting bad?", "Why condition_variable?", "Why unique_lock?", "What happens inside wait()?", "Why the predicate?", "notify_one vs notify_all?"],
  },
  practice: [
    { type: "A", q: "1 producer, 1 consumer, 1,000,000 items. What CPU does an idle consumer use now?", a: "About 0%. It sleeps inside wait()." },
    { type: "B", q: "Trace cv.wait(lock, pred) from \"queue empty\" to \"pop item\". Who holds the mutex when?", a: "Consumer holds it → wait releases it → producer locks, pushes, unlocks, notifies → consumer re-takes it, pred true, pops." },
    { type: "C", q: "4 producers, 8 consumers. Consumers sleep when empty; producers wake them. Which parts?", a: "queue + mutex + condition_variable (+ a closed flag to stop: v6)." },
  ],
},
];
