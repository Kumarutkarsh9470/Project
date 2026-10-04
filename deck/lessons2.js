// Part 2 lessons (v8 to v10).
const { H, P, C, D, O, Q } = require("./blocks.js");

module.exports = [
{
  ver: "v8", title: "Putting work in the queue",
  blocks: [
    H("From numbers to tasks"),
    P("Part 1 gave us a queue that is safe for many threads and can hold any type. In Part 2 we use it for something more useful than numbers: we put work into it. A piece of work, which we will call a task, is just a function to call later. In C++ we can store any function that takes no arguments and returns nothing as std::function<void()>. A lambda like [] { save_file(); } fits perfectly."),
    P("One thread, the worker, sits in a loop: it pops a task from the queue and runs it, then pops the next one. Any other thread can hand work to the worker by pushing a task. This is the core of every thread pool, game engine job system and server you will meet."),
    D(`main thread                    worker thread
push(task) --> [ task queue ] --> pop, run task()`),
    P("Moving work to another thread raises two questions that never came up with ints. If a task throws an exception, where does that exception go? And if a task uses variables from the function that created it, are those variables still alive when the task finally runs?"),
    H("Where does the exception go?"),
    P("Here main pushes a task that throws, and wraps the push in try and catch so it can handle the error."),
    C(`try {
    tasks.push([] {
        throw std::runtime_error("disk full");
    });
} catch (...) {
    std::cout << "caught in main\\n";
}`),
    P("The catch block never runs. The whole program is terminated instead:"),
    O(`$ OPT=-O0 ./run.sh v8 tiny terminate
terminate called after throwing an instance
of 'std::runtime_error'
Aborted`),
    P("Put it on a clock. At t = 0 main calls push(). push() only puts the std::function into the queue, which takes a few nanoseconds, and returns. Nothing has thrown yet, so main leaves the try block normally. Some time later the worker pops the task and calls it, and only then does the throw happen. By then main's try block is long gone, and the throw happens on a different thread anyway."),
    D(`main                        worker
t=0  try { push(task) }
     returns at once, no throw
     leaves try/catch
                            later: pops task
                            task() throws
                            unwinds the worker's stack
                            nothing catches it
                            -> std::terminate`),
    P("Every thread has its own call stack. When an exception is thrown, C++ walks back up the stack of the thread that threw it, looking for a catch. It never looks at another thread's stack. The worker's stack has no catch, so the exception falls out of the thread function, and C++ terminates the whole program when that happens. The worker has to catch everything itself."),
    H("What does the task point at?"),
    P("A task runs later, at a time the code that created it does not control. If a lambda captures a local variable by reference, with [&], it stores a reference to that variable. By the time the worker runs the task, the function that created it may have returned, and the variable is gone. The reference now points to memory that belongs to something else. So tasks that go into a queue should capture by value, with [=] or by naming the variables, so each task carries its own copies."),
    H("The task queue"),
    C(`using Task = std::function<void()>;

class TaskQueue {
    ThreadSafeQueue<Task> tasks;
    std::thread worker{[this] { work(); }};

    void work() {
        while (auto t = tasks.wait_and_pop()) {
            try {
                (*t)();               // run the task
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
        tasks.shutdown();   // wake the worker
        worker.join();      // wait for it to finish
    }
};`),
    P("The worker loop is our consumer from v6. wait_and_pop() returns a task, or nullopt after shutdown, which ends the loop. Each task runs inside try and catch, so a failing task cannot kill the program. std::current_exception() captures the exception that was caught into a std::exception_ptr, a value we can pass to an error handler. The destructor shuts the queue down and joins the worker, so destroying a TaskQueue always finishes cleanly."),
    P("Notice what is still missing. If a task fails, the code that submitted it never finds out. And if a task computes something, there is no way to get the result back. We fix both in v10."),
    H("Exercises"),
    Q("A million empty tasks take 180 ms to go through the task queue. How much does one task cost, and where does that time go?",
      "180 ms divided by 1,000,000 is 180 nanoseconds per task. The task itself does nothing, so all of that is overhead: creating the std::function, locking the mutex to push, notifying, locking again to pop, and making the call. That is three times more than the 60 ns push and pop of v0. It tells us a task should do a reasonable amount of work, or the overhead will be bigger than the work itself."),
    Q("void f() { int x = 1; tasks.push([&] { print(x); }); } Trace what happens.",
      "f() creates x and pushes a task that holds a reference to x, then returns. When f() returns, x is destroyed and its memory can be reused. Later the worker runs the task, which follows the reference to where x used to be and reads whatever happens to be there now. That is undefined behaviour: it might print 1, print garbage, or crash. Capturing [x] instead of [&] gives the task its own copy, and it always prints 1."),
    Q("How could the code that submitted a task find out that the task failed?",
      "The worker could store the exception somewhere the submitter can reach, for example a std::exception_ptr inside a small shared object, together with a flag that says the task is done. The submitter would wait on that flag, and if an exception was stored, call std::rethrow_exception() to throw it again on its own thread. That is a lot of parts to build for every task. The standard library already has it, and it is called a future, which is exactly what v10 introduces."),
  ],
},
{
  ver: "v9", title: "One worker is not enough",
  blocks: [
    H("A pool of workers"),
    P("Our task queue has one worker, so tasks run one after another. If one task takes a long time, every task behind it waits. The obvious step is to start several workers that all take tasks from the same queue. Whichever worker is free takes the next task. This is a thread pool."),
    D(`submit(task) --> [ task queue ] --> worker 1
                                 --> worker 2
                                 --> worker N`),
    P("Our queue is already safe for many consumers, so each worker can run exactly the same loop as the single worker in v8. The pool just starts N of them."),
    H("How many workers?"),
    P("The answer depends on what the tasks do, just like in v0. Take 64 tasks that each sleep for 100 ms. With one worker they run one after another: 64 x 100 ms = 6.4 s. With 20 workers, the first 20 tasks are picked up at t = 0 and sleep side by side. At 100 ms they finish and the next 20 start, then the next 20, then the last 4. Four rounds of 100 ms is about 0.4 s."),
    D(`1 worker    |t1|t2|t3|t4| ... |t64|        6.4 s
20 workers  |1..20|21..40|41..60|61..64|   ~0.4 s`),
    O(`$ ./run.sh v9 tiny_workers     (64 sleepy tasks)
1 worker:   6.86 s
20 workers: 0.44 s`),
    P("Now make the tasks compute for 100 ms instead of sleeping. On a 4-core machine, at most 4 tasks can really run at the same instant, one per core. With 4 workers you get the full speed-up. With 20 workers, the 20 threads take turns on the same 4 cores, so the tasks do not finish any sooner, and the operating system wastes time switching between them. So for computing tasks, about one worker per core is right. For tasks that mostly wait, many more workers help."),
    H("The order of destruction matters"),
    P("When the pool is destroyed, the workers must be stopped and joined before the queue they read from disappears. C++ gives us control over this through a rule worth remembering: the members of a class are constructed in the order they are declared, and destroyed in the reverse order."),
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
    P("Follow what happens when a ThreadPool is destroyed, step by step."),
    D(`~ThreadPool()
 1. destructor body runs: tasks.shutdown()
    -> sleeping workers wake up, finish the
       remaining tasks, and their loops end
 2. workers is destroyed (declared last):
    ThreadGroup joins every thread
 3. tasks is destroyed (declared first):
    no thread is using it any more`),
    P("Two mistakes are easy to make here. If you declare workers before tasks, the queue is destroyed while the threads are still running and using it. If you forget the shutdown() call, step 2 waits forever, because the workers are asleep in wait_and_pop() and nobody ever wakes them."),
    H("Exercises"),
    Q("64 tasks each compute for 100 ms. The machine has 4 cores and the pool has 4 workers. Roughly how long does it take?",
      "Four tasks run at a time, one per core, and each takes 100 ms. 64 tasks divided by 4 workers is 16 rounds, and 16 rounds of 100 ms is about 1.6 seconds. Using 64 workers would not help: there are still only 4 cores, so the 64 threads would share them and the total stays around 1.6 s, plus some time lost to switching."),
    Q("The pool is destroyed while 1,000 tasks are still waiting in the queue. What happens to them?",
      "They all run. The destructor calls shutdown(), which sets the closed flag and wakes the workers. But wait_and_pop() only returns nullopt when the queue is closed and empty. As long as tasks are left, each worker keeps getting tasks and running them. Only when the last task is taken do the workers see an empty, closed queue and leave their loops, and then they are joined."),
    Q("100,000 tiny tasks that do almost nothing do not get faster when you add workers. Why?",
      "Each tiny task needs a push and a pop on the queue, and both take the queue's one mutex. With more workers, more threads are trying to take that same mutex at the same moment, so they queue up for it. This is the contention we saw in v5. The real work is so small that the locking dominates, and adding workers only adds more threads to the line. Part 3 is about making that shared queue cheaper."),
  ],
},
{
  ver: "v9", title: "Real workloads",
  blocks: [
    H("Eight workers, as slow as one"),
    P("A realistic task downloads a page, does some expensive work with it, and stores the result in a vector that all the tasks share. Because the vector is shared, the first version protects the task with a lock."),
    C(`pool.submit([&] {
    std::lock_guard<std::mutex> l(m);
    auto page = download(url);       // 50 ms
    auto r = expensive_calc(page);
    results.push_back(r);
});`),
    P("We run 64 of these on 8 workers and expect about eight times the speed. Instead it takes just as long as with one worker. To see why, go through the task line by line and ask: does this line touch data that other threads also use?"),
    P("download() works with its own local variables. expensive_calc() works on page, which is local. Only push_back() touches the shared results vector. But the lock is taken at the top of the task, so it is held for the whole 50 ms. While one worker holds it, the other seven are waiting at the door. Eight workers end up taking turns, one at a time."),
    D(`lock around the whole task
w1 ##########
w2           ##########
w3                     ##########

lock around push_back only
w1 ########|
w2 ########|
w3 ########|      | = the one locked line`),
    P("If we take the lock only around push_back(), the downloads and the calculations run in parallel, and the workers only take turns for the tiny moment it takes to add one element."),
    O(`$ ./run.sh v9 tiny_granularity
lock everything: 3.2 s
lock push_back:  0.4 s`),
    P("Same 64 results, eight times faster. How much code a lock covers is called its granularity. A lock that covers too much makes threads wait for no reason. The rule is to lock exactly the lines that touch shared data, and nothing else."),
    H("Many readers, one writer"),
    P("Every task also looks up a host name in a shared DNS cache, a map from names to addresses. Almost every access is a read, and the cache is updated only now and then. With a normal mutex, two readers have to wait for each other, even though two threads reading the same map at the same time is perfectly safe. Only a writer needs everyone else to stay out."),
    P("std::shared_mutex supports exactly this. Many threads can hold it at once in shared mode, using std::shared_lock, as long as nobody holds it in exclusive mode. A writer takes it in exclusive mode, using std::unique_lock, and then nobody else can hold it at all."),
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
    P("Our queue cannot benefit from a shared_mutex, because every queue operation changes the queue. There are no pure readers."),
    H("Creating something exactly once"),
    P("Many parts of a program want to use one shared pool, so we write a function default_pool() that creates it the first time it is called. The tempting version is: if (!pool) pool = new ThreadPool(4);. If two threads call it at the same time, both can see that pool is null, and both create a pool. One of them is leaked, and the read and write of pool without a lock is a data race."),
    P("C++ solves this for us. A static local variable is initialised the first time control passes through it, and the language guarantees that this happens exactly once, even if several threads arrive at the same moment. The others simply wait until it is ready."),
    C(`ThreadPool& default_pool() {
    static ThreadPool pool(4);   // created once
    return pool;
}`),
    H("Exercises"),
    Q("64 tasks of 50 ms each run on 8 workers, with the lock taken only around push_back(). Roughly how long does it take?",
      "The 50 ms of downloading and computing now runs in parallel on all 8 workers, so they finish 8 tasks every 50 ms. 64 tasks divided by 8 workers is 8 rounds, and 8 x 50 ms = 0.4 seconds. The push_back() calls still take turns, but each takes well under a microsecond, so they add almost nothing. That matches the 0.4 s we measured."),
    Q("A high score table is read 1,000 times a second and updated once a minute. Which kind of lock should protect it?",
      "A std::shared_mutex. Readers take it with std::shared_lock, so any number of them can read at the same time without waiting for each other. The rare update takes it with std::unique_lock, which waits for the current readers to finish and keeps new ones out while it writes. With a plain mutex, all 1,000 readers per second would have to queue up one behind another for no reason."),
    Q("Name two things you should never do while holding a lock, and say why.",
      "First, do not call code you do not control, like a callback or a function that does input and output. It might be slow, which makes every other thread wait, or it might try to take the same lock, which deadlocks. Second, do not hand out a pointer or reference to the protected data. The caller would then use the data after the lock is released, without any protection, and the lock would be pointless."),
  ],
},
{
  ver: "v10", title: "Getting the result back",
  blocks: [
    H("The caller wants the answer"),
    P("Our pool can run work, but submit() returns nothing. If a task computes the number 42, main has no way to get it. If a task throws, the worker catches it and main never hears about it. The v9 test shows the gap:"),
    O(`$ OPT=-O0 ./run.sh v9 next_bug
how would main get the 42, or learn that
a task failed?`),
    P("Think about what we would have to build to send a result from the worker back to main. A place to store the value. A flag that says the value is ready. A mutex to protect the value and the flag, because two threads touch them. A condition variable so main can sleep until the flag is set, instead of spinning. And a std::exception_ptr in case the task throws instead. Five pieces, for every task."),
    H("A one-shot channel"),
    P("The standard library packages exactly those five pieces. Think of it as a channel with two ends. One end writes a value, or an exception, exactly once. The other end waits until something has been written, and then reads it exactly once. Everything in between, the storage, the flag, the mutex and the condition variable, is hidden inside."),
    D(`write end          shared state            read end
packaged_task -->  [ value or exception ] --> get()
or promise          ready flag                waits,
                    mutex + cv, hidden        then returns
                                              or rethrows`),
    P("std::packaged_task is the writing end for a function. You give it a function, and when someone calls the packaged_task, it runs the function and stores the return value, or the exception the function threw, in the shared state. std::future is the reading end. Its get() function sleeps until the result is ready, then returns the value, or throws the stored exception on the thread that called get()."),
    P("Follow a task that takes two seconds. main submits it and immediately gets a future back, then calls get() and sleeps. The worker picks up the task and runs it. When the function returns 42, the packaged_task stores 42 and wakes main, whose get() returns 42."),
    D(`time   0                        2 s
main   submit(f), gets a future
       f.get() waits ............| returns 42
worker   pops task, runs f() ....| stores 42,
                                   wakes main`),
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
    P("Read it line by line. std::invoke_result_t<F> is the type that calling f returns, here int, and we call it R. We wrap f in a packaged_task, and ask it for the future that belongs to it. Then we push a small task into the queue that just calls the packaged_task, and return the future to the caller."),
    P("Why the std::make_shared? A packaged_task can be moved but not copied, because there must be exactly one writer for each channel. But std::function, which our queue stores, requires a function object it can copy. A shared_ptr can be copied, so we put the packaged_task in one and copy the pointer instead."),
    P("The worker's try and catch from v8 are no longer needed, because the packaged_task catches the exception itself and stores it in the future. Also remember that get() can only be called once, since it moves the result out of the shared state."),
    H("Exercises"),
    Q("You submit 100,000 tiny tasks and keep all the futures. How many futures must become ready, and how would a test check it?",
      "All 100,000. Every packaged_task is run by some worker, and running it always stores either a value or an exception, so every future becomes ready. A good test keeps the futures in a vector, calls get() on each of them, and checks the values. If even one get() never returns, a task was lost somewhere, which is exactly the kind of bug the test is there to catch."),
    Q("auto f = std::async(std::launch::deferred, calc); Which thread runs calc, and when?",
      "None, at first. With launch::deferred no thread is started at all. calc runs later, on whichever thread calls f.get() or f.wait(), at the moment of that call. So if main calls f.get(), calc runs on main, and main waits for it like an ordinary function call. If nobody ever calls get() or wait(), calc never runs at all."),
    Q("main needs three values computed in parallel and then their sum. Design it with the pool.",
      "Submit the three computations, one call to submit() each, and keep the three futures. All three tasks start running on the workers right away. Then call get() on each future and add up the results. The first get() may wait, but while it waits the other two tasks keep running, so the total time is about the time of the slowest task, not the sum of all three. If any task throws, its get() rethrows the exception in main."),
  ],
},
{
  ver: "v10", title: "No function to wrap, or many readers",
  blocks: [
    H("When there is no function"),
    P("packaged_task is perfect when the result comes from a function we can hand to the pool. But some results do not come from a function at all. A network reply arrives in a callback some library calls whenever data shows up. There is nothing for us to wrap."),
    P("For this case there is std::promise. It is the writing end of the same kind of channel, but instead of running a function you write the result yourself. You call set_value() when you have the value, or set_exception() if something went wrong. Its matching future works exactly like before."),
    C(`std::promise<int> p;
std::future<int> f = p.get_future();

p.set_value(42);         // later, from anywhere
std::cout << f.get();    // 42
std::cout << f.get();    // ?`),
    P("The first get() prints 42. The second one fails:"),
    O(`$ OPT=-O0 ./run.sh v10 tiny_promise
first reader got 42
second get(): std::future_error:
No associated state`),
    P("A future is a one-shot channel with one reader. get() moves the result out of the shared state and gives it to you, and after that the future is empty. There is nothing left to get the second time. Another rule: if a promise is destroyed without ever setting a value, its reader does not wait forever. get() throws a future_error called broken_promise, so you find out something went wrong."),
    D(`who produces the value?
  std::async          the library runs the function
  std::packaged_task  you choose where it runs
  std::promise        no function: you set it

how many readers?
  std::future         one, like unique_ptr
  std::shared_future  many, like shared_ptr`),
    H("Many readers"),
    P("Now suppose eight tasks all need the same configuration, which is loaded once by another task. A plain future has one reader, so it cannot serve eight. share() turns it into a std::shared_future. A shared_future can be copied, every copy refers to the same result, and get() can be called on it any number of times."),
    P("One rule matters here. Give each task its own copy of the shared_future. Different copies can be used safely from different threads at the same time. But one single shared_future object used by several threads at once is a data race, just like any other object."),
    C(`std::shared_future<Config> cfg =
    pool.submit(load_config).share();

for (int i = 0; i < 8; ++i)
    pool.submit([cfg] {      // each task gets
        use(cfg.get());      // its own copy
    });`),
    P("Each of the eight tasks waits in cfg.get() until load_config has finished, then all of them see the same Config. If load_config throws, all eight get() calls throw the same exception."),
    H("Exercises"),
    Q("Eight readers each call get() on their own copy of one shared_future, which holds the value 7. What is the sum of what they read?",
      "56. Every copy of a shared_future refers to the same stored result, and get() on a shared_future does not move the value out, it gives a reference to it. So all eight readers get 7, and 8 x 7 = 56. With a plain future only the first get() would work, and the rest would throw."),
    Q("A promise is destroyed before set_value() is ever called. What happens to the thread waiting in get()?",
      "When the promise is destroyed, it notices that no value or exception was ever stored, so it stores a special error instead and wakes the reader. The reader's get() then throws std::future_error with the code broken_promise. This is deliberate: without it, the reader would sleep forever waiting for a value that can no longer arrive."),
    Q("You want eight benchmark threads to start their work at exactly the same moment. How can you do it with a promise?",
      "Create one std::promise<void> and get a shared_future<void> from it. Give each of the eight threads its own copy, and have each thread call get() on it before starting the work, so they all go to sleep there. When all eight are started, main calls set_value() on the promise. That one call wakes every thread at once, and they all start together. It works like a starting gun."),
  ],
},
{
  ver: "v10", title: "A task that never finishes",
  blocks: [
    H("Timeouts"),
    P("Some tasks can hang. A task that calls fetch() to download a page may wait forever if the server never answers, and then the caller, sitting in get(), waits forever too. A future lets you wait with a time limit: wait_for(1s) waits at most one second, and returns a status that says whether the result is ready or the time ran out."),
    P("Here the task sleeps for 3 s and the caller gives up after 1 s. You might expect the program to leave the block after 1 s. It leaves after 3 s:"),
    C(`{
    auto f = std::async(std::launch::async,
        [] { std::this_thread::sleep_for(3s); });
    if (f.wait_for(1s) ==
        std::future_status::timeout)
        std::cout << "timed out\\n";
}   // leave the scope`),
    O(`$ OPT=-O0 ./run.sh v10 tiny_timeout
timed out at 1.00 s
left the scope at 3.00 s`),
    P("Follow it on the clock. At t = 0 std::async starts a new thread that will sleep for 3 s. main calls wait_for(1s) and waits. At t = 1 s the time limit runs out, wait_for returns timeout, and main prints its message and reaches the closing brace. Now f is destroyed. A future that came from std::async has a special rule: its destructor waits for the task to finish. So main waits there until t = 3 s."),
    D(`time   0           1 s              3 s
task   |=== sleeping ===================|
main   wait_for(1s) ..| timeout, prints,
                       reaches }
                       ~future waits ...| leaves`),
    P("The timeout worked, but only for waiting. It did nothing to the work. The task kept running for its full three seconds. In our pool the situation is the same: the caller can stop waiting, but the worker is still busy with the stuck task, and the pool's destructor will wait for it when it joins the workers."),
    H("Why C++ never kills a thread"),
    P("Why not just stop the task from outside? Because a thread can be stopped at any instruction. It might be holding a mutex, and then that mutex stays locked forever. It might be halfway through updating a data structure, and then that structure is left broken for everyone else. There is no safe moment from the outside, so C++ deliberately has no way to kill a thread."),
    P("Instead, stopping has to be cooperative. You ask the task to stop, and the task checks from time to time whether it has been asked, at moments where stopping is safe, like between two steps of its work. C++20 provides a ready-made thread-safe flag for this. A std::stop_source is the side that asks. It hands out std::stop_token objects, and a task holding a token can call stop_requested() to see whether a stop has been asked for."),
    C(`std::stop_source stop;

auto f = pool.submit([tok = stop.get_token()] {
    for (int step = 0; step < 50; ++step) {
        if (tok.stop_requested())
            return -1;         // stop between steps
        do_step();             // 100 ms
    }
    return 0;
});

stop.request_stop();   // finishes within ~100 ms`),
    P("The task does its work in steps of 100 ms and checks the token before each step. When main calls request_stop(), the task notices at the start of its next step and returns. A task that never looks at its token cannot be stopped at all, so long-running tasks should check regularly."),
    P("There are two ways to give a time limit. wait_for(d) waits at most d from now. wait_until(t) waits until a fixed moment t. When one request has three steps and one total budget, compute the deadline once and use wait_until for every step, so the budget is shared."),
    H("Exercises"),
    Q("A task checks its stop token every 100 ms. What is the longest it can take to stop after request_stop() is called?",
      "About 100 ms. In the worst case, request_stop() is called right after the task checked its token and started a new step. The task does not notice anything during the step, so it finishes the whole 100 ms step first, then checks the token, sees the request and returns. On average it takes about half that, 50 ms."),
    Q("A request has three steps and a total budget of 1 second. Each step uses wait_for(1s). What goes wrong?",
      "Each wait_for(1s) restarts its own one-second limit. If every step is slow, the first can take almost 1 s, then the second almost 1 s, then the third, so the whole request takes up to 3 s, three times the budget. The fix is to compute deadline = now + 1s once at the start, and use wait_until(deadline) in all three steps. Then the three waits together can never go past the one deadline."),
    Q("The pool must be able to shut down even if a task is stuck in a long loop. Design it.",
      "Give the pool a std::stop_source as a member, and pass its token to every task when it is submitted. Tasks check stop_requested() regularly and return early when it is set. In the pool's destructor, call request_stop() first, then shut down the queue, then join the workers. The stuck task notices the request at its next check and returns, so the join completes instead of waiting forever."),
  ],
},
{
  ver: "v10", title: "Tasks that wait for tasks",
  blocks: [
    H("A pool that freezes with nothing locked"),
    P("Many algorithms work by splitting a problem in half. A parallel sum, for example, splits its range in two, submits one half to the pool as a new task, computes the other half itself, and then waits for the first half's result with get(). Let us try that with a tiny example: a pool of two workers and two such outer tasks."),
    C(`ThreadPool pool(2);

auto outer = [&] {
    auto inner = pool.submit([] { return 1; });
    return inner.get();     // wait inside a task
};

auto a = pool.submit(outer);
auto b = pool.submit(outer);
std::cout << a.get() + b.get();`),
    P("This should print 2. Instead the program freezes, using no CPU at all:"),
    O(`$ OPT=-O0 ./run.sh v10 tiny_nested
(frozen, stopped after 10 s)`),
    P("Follow it on the clock. At t = 0 main submits two outer tasks, and the two workers pick them up, one each. Within a microsecond, each outer task submits its inner task, which goes to the back of the queue, and then calls get() on it. get() sleeps until the inner task has run. Now both workers are asleep inside get(). The two inner tasks are sitting in the queue, but there is no free worker left to run them, and there never will be."),
    D(`worker 1                  worker 2
runs outer A              runs outer B
submits inner A           submits inner B
inner_A.get() sleeps      inner_B.get() sleeps

queue: [ inner A, inner B ]  no free worker`),
    P("No mutex is involved anywhere, yet this is the same deadlock as in v5. get() is a wait just like waiting for a lock. Draw the wait-for graph: worker 1 waits for inner A, inner A needs a free worker, and every worker is waiting. The arrows form a cycle."),
    P("Could we just add a third worker? That fixes this exact program, because the third worker would run the inner tasks. But three outer tasks would freeze it again. A recursive algorithm keeps creating new outer tasks as it splits, so it will always eventually use up every worker you have."),
    H("Help while you wait"),
    P("The real fix is for a waiting worker not to sleep at all. While it waits for its future to become ready, it takes other tasks from the queue and runs them itself. Sooner or later it will pick up and run the very task it is waiting for."),
    C(`template <class T>
T wait_helping(std::future<T>& f) {
    using namespace std::chrono_literals;
    while (f.wait_for(0s) !=
           std::future_status::ready) {
        Task t;
        if (tasks.try_pop(t))
            t();                // run some task
        else
            std::this_thread::yield();
    }
    return f.get();
}`),
    P("wait_for(0s) does not wait at all, it only asks whether the result is ready yet. If not, the worker tries to pop a task with try_pop(), which never blocks, and runs it. If the queue is empty, yield() lets other threads run for a moment. The loop continues until the future is ready, and then get() returns immediately."),
    P("Replay the frozen example with wait_helping. Worker 1, instead of sleeping, pops inner A from the queue and runs it, which makes its own future ready. Worker 2 does the same with inner B. Both outer tasks finish, and main prints 2. This also finally gives try_pop() from v3 a real job. A recursive sum written this way finishes correctly even on a pool with a single worker. Real thread pools go further with a separate queue per worker and \"work stealing\", but the idea is the same."),
    H("Exercises"),
    Q("A recursive sum over 2,000,000 numbers stops splitting when a range has fewer than 10,000 elements. Roughly how many tasks does it create?",
      "Each split halves the range: 2,000,000, then 1,000,000, 500,000, and so on, until a range is under 10,000. That takes 8 levels (2,000,000 / 2^8 is about 7,800), giving 2^8 = 256 small ranges, the leaves of the tree. A binary tree with 256 leaves has 255 inner nodes, the tasks that split. So the sum creates roughly 500 tasks in total, few enough that the queue overhead does not matter."),
    Q("A pool has one worker and runs a recursive sum with wait_helping. Trace the first split.",
      "The single worker runs the top task. It splits the range, submits the left half as a new task, which goes into the queue, and computes the right half itself. Then it calls wait_helping on the left half's future. The future is not ready, so it calls try_pop(), gets the left half task, and runs it right there. When that finishes, the future is ready, wait_helping returns the left sum, and the worker adds the two halves. One worker did everything, and nothing ever waited."),
    Q("At the end of Part 2, list what your pool now guarantees.",
      "A caller gets a future for every task, and that future delivers either the result or the exception (v10). The pool shuts down cleanly and finishes queued work first (v9). Locks are held only around the shared data, so the workers really run in parallel (v9). A long task can be asked to stop with a stop token (v10). And a task that waits for another task helps run the queue instead of sleeping, so nested waits cannot freeze the pool (v10)."),
  ],
},
];
