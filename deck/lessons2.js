// Part 2 lessons (v8 to v10).
const { H, P, C, D, O, Q } = require("./blocks.js");

module.exports = [
{
  ver: "v8", title: "Putting work in the queue",
  blocks: [
    H("From numbers to tasks"),
    P("Our queue can hold anything, so let it hold work. A task is any function with no arguments and no result, stored as std::function<void()>. One worker thread pops tasks and runs them."),
    D(`main thread                    worker thread
push(task) --> [ task queue ] --> pop, run task()`),
    P("This already raises two questions that did not exist with ints. Where does an exception go when a task fails? And what happens to the data a task refers to?"),
    H("Where does the exception go?"),
    C(`try {
    tasks.push([] {
        throw std::runtime_error("disk full");
    });
} catch (...) {
    std::cout << "caught in main\\n";
}`),
    O(`$ ./tiny terminate
terminate called after throwing an instance
of 'std::runtime_error'
Aborted`),
    P("main's catch block never runs. An exception travels up the call stack of the thread that threw it, and only that one. The task runs on the worker, so the exception unwinds the worker's stack. main's try block is on a different stack, and it finished long before the task even started."),
    D(`main                        worker
try { push(task) }
catch (...) { }   done
                            task() throws
                            unwinds the worker's stack
                            leaves the thread function
                            -> std::terminate`),
    P("An exception that escapes a thread function terminates the whole program. So the worker has to catch everything itself."),
    H("What does the task point at?"),
    P("A task runs later, at a time the submitter does not control. If it captured a local variable by reference, that variable may already be destroyed when the worker runs it. Tasks in a queue should capture by value."),
    H("The task queue"),
    C(`using Task = std::function<void()>;

class TaskQueue {
    ThreadSafeQueue<Task> tasks;
    std::thread worker{[this] { work(); }};

    void work() {
        while (auto t = tasks.wait_and_pop()) {
            try {
                (*t)();
            } catch (...) {
                on_error(std::current_exception());
            }
        }
    }
public:
    bool submit(Task t) {
        return tasks.push(std::move(t));
    }
    ~TaskQueue() {
        tasks.shutdown();
        worker.join();
    }
};`),
    P("The worker loop is v6's consumer, running tasks instead of printing numbers. Catching keeps the program alive. Notice what is still missing though. The caller never finds out that its task failed, and it never gets a result back."),
    H("Exercises"),
    Q("A million empty tasks take 180 ms. What does one task cost?", "About 180 ns, mostly the std::function call and the queue's push and pop."),
    Q("void f() { int x = 1; tasks.push([&] { print(x); }); } Trace what happens.", "f returns and x is destroyed. Later the worker reads x through a dangling reference, which is undefined behaviour."),
    Q("How could the caller learn that its task failed?", "Store the exception in shared state with std::exception_ptr and rethrow it on the caller's side. That is what a future does in v10."),
  ],
},
{
  ver: "v9", title: "One worker is not enough",
  blocks: [
    H("A pool of workers"),
    P("A single worker runs tasks one after another. If we start N workers on the same queue we get a thread pool. Each worker runs the same loop as in v8."),
    D(`submit(task) --> [ task queue ] --> worker 1
                                 --> worker 2
                                 --> worker N`),
    H("How many workers?"),
    P("Run 64 tasks on a four core machine, once with tasks that sleep for 100 ms and once with tasks that compute for 100 ms. Think about which pool size is best for each before you look."),
    O(`$ ./tiny_workers       (64 sleepy tasks)
1 worker:   6.86 s
20 workers: 0.44 s`),
    P("For sleepy tasks more workers keep helping, because waiting overlaps, just as in v0. For computing tasks the speed-up stops at about the number of cores. Beyond that the extra threads only take turns and add switching overhead."),
    H("The order of destruction matters"),
    C(`class ThreadPool {
    ThreadSafeQueue<Task> tasks;   // built first
    ThreadGroup workers;           // built second
public:
    explicit ThreadPool(unsigned n) {
        for (unsigned i = 0; i < n; ++i)
            workers.add(std::thread(
                [this] { work(); }));
    }
    ~ThreadPool() { tasks.shutdown(); }
};`),
    P("Members are destroyed in the reverse order of their declaration. When the pool is destroyed, the destructor body runs first and shuts the queue down, which wakes every sleeping worker. Then workers is destroyed, which joins all the threads. Only after that is tasks destroyed."),
    P("If you swap the two members, the queue is destroyed while workers may still be using it. And if you forget the shutdown() call, the join waits forever, because the workers are asleep inside wait_and_pop() and nobody wakes them."),
    D(`~ThreadPool()
  1. destructor body: tasks.shutdown()
     -> workers wake, drain the queue, return
  2. workers destroyed: every thread joined
  3. tasks destroyed: nobody is using it now`),
    H("Exercises"),
    Q("64 tasks compute for 100 ms each on 4 cores with 4 workers. Roughly how long?", "64 x 0.1 s / 4 = about 1.6 s."),
    Q("The pool is destroyed with 1,000 tasks still queued. What happens to them?", "All 1,000 run before the workers exit, because the queue drains before wait_and_pop() returns nothing."),
    Q("100,000 tiny tasks do not get faster with more workers. Why?", "All workers fight for the one queue mutex. It is the contention from v5 again."),
  ],
},
{
  ver: "v9", title: "Real workloads",
  blocks: [
    H("Eight workers, as slow as one"),
    P("A realistic job downloads a page, does some expensive work on it and stores the result in a shared vector. The first version takes the lock for the whole job."),
    C(`pool.submit([&] {
    std::lock_guard<std::mutex> l(m);
    auto page = download(url);       // 50 ms
    auto r = expensive_calc(page);
    results.push_back(r);
});`),
    P("64 of these jobs on 8 workers take as long as on one worker. Look at each line and ask whether it touches shared data. download() and expensive_calc() only use locals. Only push_back() touches the shared vector."),
    D(`lock around the whole task
w1 ##########
w2           ##########
w3                     ##########

lock around push_back only
w1 ########|
w2 ########|
w3 ########|      | = the one locked line`),
    O(`$ ./tiny_granularity
lock everything: 3.2 s
lock push_back:  0.4 s`),
    P("Same 64 results, eight times faster. Holding a lock for the whole task turned eight workers back into one. Lock the line that touches shared data, not the whole job."),
    H("Many readers, one writer"),
    P("Every job also looks up a host in a shared DNS cache, and the cache is updated only rarely. With a normal mutex the readers block each other even though reading in parallel is perfectly safe. std::shared_mutex lets many readers in together and gives a writer exclusive access."),
    C(`class DnsCache {
    std::map<std::string, std::string> entries;
    mutable std::shared_mutex m;
public:
    std::optional<std::string>
    find(const std::string& host) const {
        std::shared_lock lock(m);   // many readers
        auto it = entries.find(host);
        if (it == entries.end()) return {};
        return it->second;
    }
    void update(std::string host, std::string ip) {
        std::unique_lock lock(m);   // one writer
        entries[host] = std::move(ip);
    }
};`),
    P("Our queue cannot benefit from this, because every queue operation writes."),
    H("Creating something exactly once"),
    P("Many threads call default_pool() to get a shared pool. The tempting version is if (!pool) pool = new ThreadPool(4);. Two threads can both see null and both create a pool, and the unsynchronised read and write is a data race. A function-local static is guaranteed to be initialised exactly once, even when several threads arrive together."),
    C(`ThreadPool& default_pool() {
    static ThreadPool pool(4);
    return pool;
}`),
    H("Exercises"),
    Q("64 jobs of 50 ms on 8 workers, locking only push_back. Roughly how long?", "64 x 0.05 s / 8 = about 0.4 s."),
    Q("A high score table is read 1,000 times a second and updated once a minute. Which lock?", "std::shared_mutex, with shared_lock for reading and unique_lock for updating."),
    Q("Name two things you should never do while holding a lock.", "Call code you do not control, such as callbacks or I/O, and hand out pointers or references to the guarded data."),
  ],
},
{
  ver: "v10", title: "Getting the result back",
  blocks: [
    H("The caller wants the answer"),
    P("The pool runs work, but submit() returns nothing. If a task computes 42, main has no way to get it. If a task throws, the worker catches it and main never hears about it."),
    O(`$ ./next_bug          (v9)
how would main get the 42, or learn that
a task failed?`),
    P("You could build this yourself. You would need a slot for the value, a ready flag, a mutex to protect them, a condition variable so the caller can sleep until the flag is set, and a std::exception_ptr for errors. Five pieces, for every task."),
    H("A one-shot channel"),
    P("The standard library packages exactly those pieces. One side writes a value or an exception once. The other side waits for it and reads it once."),
    D(`write end            shared state           read end
packaged_task  -->  [ value or exception ] --> future.get()
or promise           ready flag                waits, then
                     mutex + cv, hidden        returns or
                                               rethrows`),
    P("std::packaged_task wraps a function. When someone runs it, the function's return value, or the exception it threw, goes into the shared state. std::future is the reading end. get() sleeps until the result is ready and then returns the value or rethrows the exception on the caller's thread."),
    H("submit() returns a future"),
    C(`template <class F>
auto submit(F f)
    -> std::future<std::invoke_result_t<F>> {
    using R = std::invoke_result_t<F>;
    auto task = std::make_shared<
        std::packaged_task<R()>>(std::move(f));
    auto result = task->get_future();
    tasks.push([task] { (*task)(); });
    return result;
}

auto f = pool.submit([] { return 6 * 7; });
int x = f.get();   // 42, or rethrows`),
    P("The shared_ptr is there for a practical reason. packaged_task can only be moved, but std::function requires a callable it can copy. A shared_ptr can be copied, so wrapping the task in one satisfies std::function."),
    P("The worker's try and catch are gone, because the packaged_task now catches the exception and stores it in the future. get() can only be called once, since it moves the result out of the shared state."),
    H("Exercises"),
    Q("You submit 100,000 tiny tasks. How many futures must become ready?", "All 100,000. A test should check every one of them."),
    Q("auto f = std::async(std::launch::deferred, calc); Which thread runs calc, and when?", "The thread that calls f.get(), at the moment it calls it. Nothing runs before that."),
    Q("main needs three results computed in parallel and then their sum. Design it.", "Submit three tasks, keep the three futures, and add up the three get() results."),
  ],
},
{
  ver: "v10", title: "No function to wrap, or many readers",
  blocks: [
    H("When there is no function"),
    P("packaged_task wraps a function, but some results do not come from a function you can hand to the pool. A network reply arrives in a callback, for example. For that case there is std::promise. You hold the writing end yourself and call set_value() or set_exception() when the result is known."),
    C(`std::promise<int> p;
std::future<int> f = p.get_future();

p.set_value(42);           // later, from anywhere
std::cout << f.get();      // 42
std::cout << f.get();      // ?`),
    O(`$ ./tiny_promise
first reader got 42
second get(): std::future_error:
No associated state`),
    P("The second get() fails because the first one moved the result out. A future has exactly one reader, and reads once. If a promise is destroyed without ever being set, the reader gets a broken_promise error instead of waiting forever."),
    D(`who produces the value?
  std::async          the library runs the function
  std::packaged_task  you decide where it runs
  std::promise        no function, you set it yourself

how many readers?
  std::future         one, like unique_ptr
  std::shared_future  many, like shared_ptr`),
    H("Many readers"),
    P("Suppose eight tasks all need the same configuration, loaded once by another task. share() turns the future into a std::shared_future, whose get() can be called many times and from many threads. Give every task its own copy. The copies share the result safely, while a single shared_future object used by several threads at once would be a data race."),
    C(`std::shared_future<Config> cfg =
    pool.submit(load_config).share();

for (int i = 0; i < 8; ++i)
    pool.submit([cfg] {      // a copy each
        use(cfg.get());
    });`),
    P("If load_config throws, all eight get() calls rethrow the same exception."),
    H("Exercises"),
    Q("Eight readers each get x = 7 from one shared_future. What is the sum of what they read?", "56. Every reader sees the same value."),
    Q("The promise is destroyed before set_value() is called. What does get() do?", "It throws std::future_error with the code broken_promise."),
    Q("You want eight benchmark threads to start at exactly the same moment. Design it.", "Give them all a copy of a shared_future<void> from one promise<void>. Each waits on it, and set_value() releases them together."),
  ],
},
{
  ver: "v10", title: "A task that never finishes",
  blocks: [
    H("Timeouts"),
    P("A task calls fetch(), which sometimes hangs. The caller can stop waiting after a second with wait_for. Before running the example, decide when the program leaves the scope."),
    C(`{
    auto f = std::async(std::launch::async,
        [] { std::this_thread::sleep_for(3s); });
    if (f.wait_for(1s) ==
        std::future_status::timeout)
        std::cout << "timed out\\n";
}   // leave the scope`),
    O(`$ ./tiny_timeout
timed out at 1.00 s
left the scope at 3.00 s`),
    P("The timeout worked, but only for waiting. The task kept running, and the future returned by std::async waits for it in its destructor. A timeout limits how long you wait. It does nothing to the work itself."),
    D(`caller                       worker
wait_for(1s) ... timeout
gives up
                             fetch() still running
pool destructor joins ...    fetch() still running`),
    H("Why C++ never kills a thread"),
    P("A thread that is stopped from outside might be holding a lock, or be halfway through updating shared data. Killing it would leave the mutex locked forever or the data broken. So C++ has no way to kill a thread. Cancellation has to be cooperative: you ask the task to stop, and the task checks between steps."),
    P("C++20 provides a thread-safe stop flag for this. A std::stop_source requests the stop and hands out std::stop_token objects that tasks can check."),
    C(`std::stop_source stop;

auto f = pool.submit([tok = stop.get_token()] {
    for (int step = 0; step < 50; ++step) {
        if (tok.stop_requested())
            return -1;
        do_step();             // 100 ms
    }
    return 0;
});

stop.request_stop();   // returns within ~100 ms`),
    P("A task that never looks at its token cannot be cancelled at all. There are also two kinds of timeout. wait_for waits a relative amount of time for one step, and wait_until waits until a fixed deadline, which is what you want when several steps share one time budget."),
    H("Exercises"),
    Q("A task checks its token every 100 ms. What is the longest delay after request_stop()?", "About 100 ms, one step."),
    Q("Three steps each use wait_for(1s), but the whole request has a 1 s budget. What goes wrong?", "Each step can wait a full second, so the total can reach 3 s. Compute one deadline and use wait_until."),
    Q("The pool must shut down even if a task is stuck. Design it.", "The pool owns a stop_source, passes its token to every task and calls request_stop() before joining."),
  ],
},
{
  ver: "v10", title: "Tasks that wait for tasks",
  blocks: [
    H("A pool that freezes with nothing locked"),
    P("Recursive algorithms split their work. A parallel sum submits half its range as a new task and waits for that half's result. Try it with two workers and two such tasks."),
    C(`ThreadPool pool(2);

auto outer = [&] {
    auto inner = pool.submit([] { return 1; });
    return inner.get();     // wait inside a task
};

auto a = pool.submit(outer);
auto b = pool.submit(outer);
std::cout << a.get() + b.get();`),
    O(`$ ./tiny_nested
(frozen, stopped after 10 s)`),
    P("It never prints 2. Both workers are busy running an outer task, and each outer task is blocked in get(). The two inner tasks are sitting in the queue, but there is no free worker left to run them."),
    D(`worker 1                  worker 2
run outer A               run outer B
inner_A.get() waits       inner_B.get() waits

queue: [ inner A, inner B ]   no free worker`),
    P("No mutex is involved, but this is the same deadlock as v5. get() is a wait-for edge just like a lock: worker 1 waits for inner A, inner A needs a free worker, and every worker is waiting. Adding a third worker fixes this program, but three outer tasks break it again. Recursion creates waiting tasks faster than you can add workers."),
    H("Help while you wait"),
    P("The fix is to stop sleeping in get(). While a worker waits for its future, it takes other tasks from the queue and runs them. Sooner or later it runs the very task it is waiting for."),
    C(`template <class T>
T wait_helping(std::future<T>& f) {
    using namespace std::chrono_literals;
    while (f.wait_for(0s) !=
           std::future_status::ready) {
        Task t;
        if (tasks.try_pop(t))
            t();
        else
            std::this_thread::yield();
    }
    return f.get();
}`),
    P("This finally gives try_pop from v3 a real job. A recursive sum written with wait_helping finishes correctly even on a pool with one worker. Real thread pools go further with a queue per worker and work stealing, but the idea is the same."),
    H("Exercises"),
    Q("A recursive sum over 2,000,000 ints stops splitting below 10,000. Roughly how many tasks does it create?", "About 400. Each leaf has around 10,000 elements, so 200 leaves, and a binary tree has about as many inner nodes."),
    Q("Trace the first split on a pool with one worker using wait_helping.", "The worker submits the left half, computes the right half itself, then pops the left task and runs it while it waits for it."),
    Q("List what your pool now guarantees at the end of Part 2.", "Results and errors come back through futures, shutdown is clean, tasks can be cancelled with a token, and nested waits cannot deadlock."),
  ],
},
];
