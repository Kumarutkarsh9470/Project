// Course content, Part 2 (v8-v10).
module.exports = [
{
  id: "v8", ver: "v8", name: "Task queue", part: 2,
  problem: {
    title: "What if the queue carried work?",
    scene:
`main thread                     worker thread
push(task) ──▶ [ task queue ] ──▶ pop, task()`,
    question: "A task throws an exception on the worker. main wrapped its push() in try/catch. Does main catch it?",
  },
  predict: {
    code:
`try {
    tasks.push([] { throw std::runtime_error("disk full"); });
} catch (...) {
    std::cout << "caught in main";
}`,
    question: "What prints? What happens to the program?",
    answer: "Nothing is caught. The program terminates.\n\nThe exception unwinds the worker's stack, not main's.",
  },
  breakit: {
    cmd: "./tiny terminate",
    output: "terminate called after throwing\nan instance of 'std::runtime_error'\nAborted",
    note: "And a task that captured a local by reference ran after that local was destroyed.",
  },
  why: {
    title: "An exception lives on one thread's stack",
    timeline:
`main                          worker

try { push(task) }
catch (...) { }  ← done
                              task() throws
                              unwinds WORKER's stack
                              leaves the thread function
                              → std::terminate`,
    caption: "Catch on the worker, or one bad task kills the program. Queued tasks run LATER: capture by value.",
  },
  solution: {
    title: "A queue of work, and one worker",
    file: "task_queue.hpp",
    code:
`+ using Task = std::function<void()>;
+ class TaskQueue {
+     ThreadSafeQueue<Task> tasks;
+     std::thread worker{[this] { work(); }};
+     void work() {
+         while (auto t = tasks.wait_and_pop()) {
+             try { (*t)(); }
+             catch (...) { on_error(std::current_exception()); }
+         }
+     }
+ };`,
    steps: ["The worker is v6's consumer loop, running tasks.", "catch (...) keeps the worker alive.", "But the caller never learns its task failed, and never gets a result."],
  },
  learned: {
    key: "An exception can't cross threads on its own. Catch it where it happens and carry it back.",
    explain: ["Why can't main catch a worker's exception?", "Why capture by value?", "What does std::function require?", "Why isn't catch (...) the whole answer?"],
  },
  practice: [
    { type: "A", q: "1,000,000 empty tasks take 180 ms. Cost per task?", a: "About 180 ns: std::function call + queue push/pop." },
    { type: "B", q: "void f(){ int x=1; tasks.push([&]{ print(x); }); } Trace it.", a: "f returns, x is destroyed, then the worker reads it: undefined behaviour." },
    { type: "C", q: "How could the caller learn that its task failed?", a: "Store std::exception_ptr in shared state and rethrow it in the caller: that's v10's future." },
  ],
},
{
  id: "v9", ver: "v9", name: "Thread pool", part: 2,
  problem: {
    title: "One worker runs one task at a time",
    scene:
`submit(task) ──▶ [ task queue ] ──▶ worker 1
                                ──▶ worker 2  ?
                                ──▶ worker N  ?`,
    question: "64 tasks wait in line for one worker. How many workers should we start, and how do they all stop?",
  },
  predict: {
    code:
`// 64 tasks that each sleep 100 ms
// 64 tasks that each compute 100 ms
// on a 4-core machine
pool(1)   pool(4)   pool(64)`,
    question: "Which pool size is fastest for sleepy tasks? For busy tasks?",
    answer: "Sleepy: 64 workers (≈0.1 s).\nBusy: about 4 workers (one per core). More only adds switching.",
  },
  breakit: {
    cmd: "./tiny_workers   # 64 sleepy tasks",
    output: "1 worker:   6.86 s\n20 workers: 0.44 s",
    note: "Swap the order of the two members in ThreadPool and the destructor hangs or crashes.",
  },
  why: {
    title: "Members die in reverse order",
    timeline:
`class ThreadPool {
    ThreadSafeQueue<Task> tasks;   built 1st, destroyed LAST
    ThreadGroup workers;           built 2nd, destroyed FIRST
};

~ThreadPool(): tasks.shutdown()  → workers wake, drain, return
               then workers joined, then the queue goes`,
    caption: "Joining before shutdown hangs: workers sleep in wait_and_pop and nobody wakes them.",
  },
  solution: {
    title: "One worker becomes a group",
    file: "pool.hpp",
    code:
`- class TaskQueue {
-     std::thread worker;
+ class ThreadPool {
+     ThreadSafeQueue<Task> tasks;   // destroyed last
+     ThreadGroup workers;
+ public:
+     explicit ThreadPool(unsigned n) {
+         for (unsigned i = 0; i < n; ++i)
+             workers.add(std::thread([this] { work(); }));
+     }
+     ~ThreadPool() { tasks.shutdown(); }
  };`,
    steps: ["N workers run the same v8 loop on one queue.", "Shut down first, then the ThreadGroup member joins.", "CPU work: about one worker per core. Waiting work: many more."],
  },
  learned: {
    key: "For computing, about one worker per core. For waiting, many more. Shut down before joining.",
    explain: ["In what order are members destroyed?", "What if workers are joined before shutdown?", "Why is capturing this safe here?", "How many workers for network calls?"],
  },
  practice: [
    { type: "A", q: "64 busy 100 ms tasks on 4 cores, 4 workers. Rough total?", a: "64 × 0.1 / 4 = 1.6 s." },
    { type: "B", q: "Destroy the pool with 1,000 tasks queued. What runs?", a: "All 1,000 run first (drain policy), then workers exit." },
    { type: "C", q: "100,000 tiny tasks don't speed up with more workers. Why?", a: "They all fight over one queue mutex: contention (v5). Motivates Part 3." },
  ],
},
{
  id: "v9w", ver: "v9", name: "Real workloads", part: 2,
  problem: {
    title: "8 workers, as slow as 1",
    scene:
`pool.submit([&] {
    std::lock_guard l(m);
    auto page = download(url);     // 50 ms
    auto r = expensive_calc(page);
    results.push_back(r);
});`,
    question: "64 of these jobs on 8 workers take as long as on 1 worker. Why?",
  },
  predict: {
    code:
`download(url)        → touches shared data?
expensive_calc(page) → touches shared data?
results.push_back(r) → touches shared data?`,
    question: "Which line actually needs the lock?",
    answer: "Only results.push_back(r).\n\ndownload and calc only touch locals.",
  },
  breakit: {
    cmd: "./tiny_granularity",
    output: "lock everything: 3.2 s\nlock push_back:  0.4 s",
    note: "Same 64 results, 8× faster.",
  },
  why: {
    title: "Lock the shared touch, not the task",
    timeline:
`lock around the whole task
w1 ██████████
w2           ██████████
w3                     ██████████

lock around push_back only
w1 ████████▌
w2 ████████▌
w3 ████████▌      ▌ = the locked line`,
    caption: "Two more day-one tools: many readers of a cache → shared_mutex. Create the pool once → static or call_once.",
  },
  solution: {
    title: "Many readers, one writer",
    file: "dns_cache.hpp",
    code:
`+ class DnsCache {
+     std::map<std::string, std::string> entries;
+     mutable std::shared_mutex m;
+ public:
+     std::optional<std::string> find(const std::string& h) const {
+         std::shared_lock lock(m);      // many readers
+         ...
+     }
+     void update(std::string h, std::string ip) {
+         std::unique_lock lock(m);      // one writer
+         entries[h] = ip;
+     }
+ };`,
    steps: ["shared_lock: many readers at once. unique_lock: one writer, no readers.", "Our queue can't use it: every queue operation writes.", "default_pool(): a function-local static is created exactly once."],
  },
  learned: {
    key: "Lock the shared touch, not the whole task. Share reads. Initialise once.",
    explain: ["Which line needed the lock, and why only that one?", "Why not shared_mutex for the queue?", "Why is if (!pool) pool = new … broken?", "Two things never to do while holding a lock?"],
  },
  practice: [
    { type: "A", q: "64 jobs × 50 ms on 8 workers, lock only push_back. Rough total?", a: "64 × 0.05 / 8 = 0.4 s." },
    { type: "B", q: "Two threads run if (!pool) pool = new ThreadPool(4); at once. Trace it.", a: "Both see null, both create a pool: a leak and a data race." },
    { type: "C", q: "A high-score table: read 1,000×/s, updated once a minute. Which lock?", a: "std::shared_mutex: shared_lock to read, unique_lock to update." },
  ],
},
{
  id: "v10", ver: "v10", name: "Future-based results", part: 2,
  problem: {
    title: "The caller wants the answer",
    scene:
`main:   pool.submit(compute)   →  ???  where is the 42?
worker: compute() → 42          →  lost
worker: compute() throws        →  logged, main never knows`,
    question: "What would you need to build so main can wait for the result, or get the exception?",
  },
  predict: {
    code:
`// hand-built "result slot":
T value;
bool ready = false;
std::mutex m;
std::condition_variable cv;
std::exception_ptr error;`,
    question: "Count the parts. Would you want to write this for every task?",
    answer: "Five parts, every time.\n\nThe standard library packages exactly this: std::future.",
  },
  breakit: {
    cmd: "./next_bug   # v9",
    output: "how would main get the 42,\nor learn that a task failed?",
    note: "The pool runs work. It can't return anything yet.",
  },
  why: {
    title: "A one-shot channel",
    timeline:
`write end              shared state             read end
packaged_task ─set─▶ [ value | exception ] ─▶ future.get()
or promise             + ready flag            waits, then
                       + mutex + cv (hidden)   returns or rethrows`,
    caption: "Whoever runs the packaged_task fills the future. get() is one-shot: it moves the result out.",
  },
  solution: {
    title: "submit() returns a future",
    file: "pool.hpp",
    code:
`+ template <class F>
+ auto submit(F f) -> std::future<std::invoke_result_t<F>> {
+     using R = std::invoke_result_t<F>;
+     auto task = std::make_shared<std::packaged_task<R()>>(std::move(f));
+     auto result = task->get_future();
+     tasks.push([task] { (*task)(); });
+     return result;
+ }
  // caller:
+ auto f = pool.submit([] { return 6 * 7; });
+ int x = f.get();     // 42, or rethrows`,
    steps: ["packaged_task stores the value or the exception in the future.", "shared_ptr: packaged_task is move-only, std::function needs copyable.", "The worker's try/catch is gone: the future carries errors."],
  },
  learned: {
    key: "When threads exchange results instead of sharing state, use a future.",
    explain: ["Why not std::async inside submit()?", "Why the shared_ptr?", "What does a second get() do?", "What does launch::deferred change?"],
  },
  practice: [
    { type: "A", q: "100,000 tiny tasks submitted. How many futures must become ready?", a: "All 100,000. Check every one." },
    { type: "B", q: "auto f = std::async(std::launch::deferred, calc); Which thread runs calc, and when?", a: "The thread that calls f.get(), at that moment." },
    { type: "C", q: "Design: main needs 3 results computed in parallel, then their sum.", a: "Submit 3 tasks, keep 3 futures, sum the three get() calls." },
  ],
},
{
  id: "v10p", ver: "v10", name: "promise and shared_future", part: 2,
  problem: {
    title: "No function to run, or many readers",
    scene:
`network callback ──▶ reply arrives    (no function to wrap)

load_config() ──▶ 8 tasks all need it (many readers)`,
    question: "packaged_task wraps a function. What if the value comes from a callback? And what if 8 threads need one result?",
  },
  predict: {
    code:
`std::promise<int> p;
auto f = p.get_future();
p.set_value(42);
std::cout << f.get();
std::cout << f.get();`,
    question: "What do the two get() calls print?",
    answer: "First: 42.\nSecond: throws std::future_error (no associated state).\n\nget() is one-shot.",
  },
  breakit: {
    cmd: "./tiny_promise",
    output: "first reader got 42\nsecond get(): std::future_error:\nNo associated state",
    note: "Destroy a promise without setting it: readers get broken_promise instead of waiting forever.",
  },
  why: {
    title: "Who writes, and how many read",
    timeline:
`who produces the value?
  std::async          the library runs it
  std::packaged_task  you choose where it runs
  std::promise        set it by hand

how many readers?
  std::future         one   (like unique_ptr)
  std::shared_future  many  (like shared_ptr)`,
    caption: "Give each reader its OWN copy of the shared_future. One object used by many threads is a data race.",
  },
  solution: {
    title: "share(), one copy per task",
    file: "example",
    code:
`+ std::shared_future<Config> cfg =
+     pool.submit(load_config).share();
+ for (int i = 0; i < 8; ++i)
+     pool.submit([cfg] {          // copy, by value
+         use(cfg.get());
+     });`,
    steps: ["share() turns a future into a shared_future.", "Each task captures its own copy.", "If load_config throws, all 8 get() calls rethrow it."],
  },
  learned: {
    key: "One reader: future. Many readers: shared_future, one copy each. No function: promise.",
    explain: ["When promise instead of packaged_task?", "Why is get() one-shot?", "Why copy the shared_future per thread?", "What is broken_promise?"],
  },
  practice: [
    { type: "A", q: "8 readers each get x = 7 from one shared_future. Sum?", a: "56." },
    { type: "B", q: "The promise is destroyed before set_value. What does get() do?", a: "Throws std::future_error: broken_promise." },
    { type: "C", q: "Start 8 benchmark threads at the same instant. Design it.", a: "promise<void> + shared_future<void>: every thread waits on it, then set_value() releases all." },
  ],
},
{
  id: "v10t", ver: "v10", name: "Timeouts and cancellation", part: 2,
  problem: {
    title: "A task that never finishes",
    scene:
`auto f = pool.submit([] { return fetch(url); });
// fetch() sometimes hangs forever
f.get();      // ...and so does main`,
    question: "How do we stop waiting after 1 second? And does that stop fetch()?",
  },
  predict: {
    code:
`auto f = std::async(std::launch::async,
                    [] { sleep_for(3s); });
if (f.wait_for(1s) == std::future_status::timeout)
    std::cout << "timed out\\n";
}   // leave the scope`,
    question: "When is the scope left: after 1 s or after 3 s?",
    answer: "After 3 s.\n\nThe timeout only stopped waiting. async's future waits for the task in its destructor.",
  },
  breakit: {
    cmd: "./tiny_timeout",
    output: "timed out at 1.00 s\nleft the scope at 3.00 s",
    note: "C++ never kills a thread: it might hold a lock or be halfway through an update.",
  },
  why: {
    title: "A timeout stops waiting, not work",
    timeline:
`caller                        worker

wait_for(1s) ... timeout
"give up"
                              fetch() ... still running
pool destructor: join ...     fetch() ... still running`,
    caption: "Cancellation must be cooperative: ask the task to stop, and the task checks between steps.",
  },
  solution: {
    title: "Ask, and let the task stop itself",
    file: "pool.hpp",
    code:
`+ std::stop_source stop;
+ auto f = pool.submit([tok = stop.get_token()] {
+     for (int step = 0; step < 50; ++step) {
+         if (tok.stop_requested()) return -1;
+         do_step();               // 100 ms
+     }
+     return 0;
+ });
+ stop.request_stop();             // finishes within ~0.1 s`,
    steps: ["wait_for: relative. wait_until: one deadline for several steps.", "stop_source / stop_token (C++20): a thread-safe \"please stop\".", "A task that never checks its token can't be cancelled."],
  },
  learned: {
    key: "A timeout limits your waiting. Only the task can stop itself, when asked.",
    explain: ["Why did the scope take 3 s?", "wait_for vs wait_until?", "Why can't C++ kill a thread?", "What does future_status::deferred mean?"],
  },
  practice: [
    { type: "A", q: "A task checks its token every 100 ms. Worst delay after request_stop()?", a: "About 100 ms (one step)." },
    { type: "B", q: "3 steps, each wait_for(1s), total budget 1 s. Trace a slow case.", a: "Each step may wait 1 s: total up to 3 s. Use wait_until(deadline)." },
    { type: "C", q: "The pool must shut down even with stuck tasks. Design it.", a: "Pool owns a stop_source, passes tokens to tasks, request_stop() in the destructor before joining." },
  ],
},
{
  id: "v10n", ver: "v10", name: "Tasks waiting on tasks", part: 2,
  problem: {
    title: "The pool that freezes with nothing locked",
    scene:
`outer task:
    auto inner = pool.submit(half_of_the_work);
    return inner.get();          // wait inside a task`,
    question: "A recursive sum submits half its work and waits for it. With 2 workers and 2 outer tasks, what happens?",
  },
  predict: {
    code:
`ThreadPool pool(2);
auto outer = [&] {
    auto inner = pool.submit([] { return 1; });
    return inner.get();
};
auto a = pool.submit(outer);
auto b = pool.submit(outer);
std::cout << a.get() + b.get();`,
    question: "Does it print 2?",
    answer: "No. It hangs.\n\nBoth workers wait in get(); both inner tasks sit in the queue with no free worker.",
  },
  breakit: {
    cmd: "./tiny_nested",
    output: "[frozen: stopped after 10 s]",
    note: "3 workers fixes this program. 3 outer tasks break it again.",
  },
  why: {
    title: "get() is a wait-for edge too",
    timeline:
`Worker 1                    Worker 2
run outer A                 run outer B
  inner_A.get() ... waits     inner_B.get() ... waits

queue: [ inner A, inner B ]  ← no free worker

worker → inner task → needs a free worker → a cycle`,
    caption: "Same wait-for graph as v5, with futures as edges. More workers only move the limit.",
  },
  solution: {
    title: "Help instead of blocking",
    file: "pool.hpp",
    code:
`+ template <class T>
+ T wait_helping(std::future<T>& f) {
+     using namespace std::chrono_literals;
+     while (f.wait_for(0s) != std::future_status::ready) {
+         Task t;
+         if (tasks.try_pop(t)) t();     // run someone's task
+         else std::this_thread::yield();
+     }
+     return f.get();
+ }`,
    steps: ["While waiting, a worker runs other queued tasks, maybe the one it waits for.", "It finally gives v3's try_pop a real job.", "Real pools add per-worker queues and work stealing."],
  },
  learned: {
    key: "A blocking get() inside a pool task is a wait-for edge. Help while you wait.",
    explain: ["Why did 2 workers and 2 outer tasks freeze?", "Why don't more workers fix it?", "What does wait_helping do?", "Draw the cycle."],
  },
  practice: [
    { type: "A", q: "Recursive sum of 2,000,000 ints, cut-off 10,000. Roughly how many tasks?", a: "About 2 × 200 = 400 (a binary tree with 200 leaves)." },
    { type: "B", q: "Pool of 1 worker, psum with wait_helping. Trace the first split.", a: "The worker submits left, computes right, then pops and runs left itself while waiting." },
    { type: "C", q: "End of Part 2: list what your pool guarantees.", a: "Results and errors via futures · clean shutdown · cancellation by token · no nested-wait deadlock." },
  ],
},
];
