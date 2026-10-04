// Part 1 lessons (v0 to v7). Block types:
//   H heading · P paragraph · C code · D diagram/timeline · O terminal output · Q exercise + answer
const { H, P, C, D, O, Q } = require("./blocks.js");

module.exports = [
{
  ver: "v0", title: "What does a second thread buy us?",
  blocks: [
    H("Where we start"),
    P("Our first program is a plain queue of ints. One function produces items and pushes them, another pops and consumes them. Everything runs on one thread, so the consumer only starts once the producer has finished."),
    C(`class Queue {
    std::queue<int> q;
public:
    void push(int x) { q.push(x); }
    int pop() {
        int v = q.front();
        q.pop();
        return v;
    }
    std::size_t size() const { return q.size(); }
};`),
    P("The obvious idea is to give the producer and the consumer a thread each and expect the program to run twice as fast. Before doing that, it is worth asking what a second thread really gives us."),
    H("A small experiment"),
    P("Take a task that does nothing but wait for two seconds, the way a program waits for a disk or a network reply. Run it twice on one thread, then once each on two threads."),
    C(`void task() { std::this_thread::sleep_for(2s); }

// one thread
task(); task();

// two threads
std::thread t1(task), t2(task);
t1.join(); t2.join();`),
    P("The single-threaded version takes 4 seconds and the two-threaded version takes 2. You can see it yourself:"),
    O(`$ ./run.sh v0 tiny
sequential:  4.00 s
two threads: 2.00 s`),
    H("What happens on the clock"),
    P("Picture a clock that starts at t = 0. In the single-threaded version the first call to task() sleeps from 0 s to 2 s. Only when it returns does the second call start, so it sleeps from 2 s to 4 s. The two waits sit end to end."),
    D(`time        0s        1s        2s        3s        4s
main        |== task() ==========|== task() ==========|
                                 ^ 2nd call starts`),
    P("Now the two-threaded version. The line std::thread t1(task), t2(task); starts both threads almost instantly. They are written one after the other, but creating a thread only takes microseconds, so for our purposes t1 and t2 both begin sleeping at t = 0."),
    D(`time        0s        1s        2s
t1          |== sleeping ========|  done at 2s
t2          |== sleeping ========|  done at 2s
main        start t1, t2
            t1.join() waits ......| returns at 2s
                                  t2.join(): returns
                                  at once, t2 is done`),
    P("main reaches t1.join() right after starting the threads and waits there. At t = 2 s t1 finishes and join() returns. main moves to t2.join(), but t2 started at the same moment and has also finished, so that join returns immediately. The total is 2 seconds."),
    P("Notice what did not happen. Neither task got faster. Each still slept its full two seconds. We saved time only because the two waits overlapped."),
    H("Taking turns is not the same as running together"),
    D(`one core, two threads
core 0 | T1 T1 T2 T1 T2 T2 T1    the OS switches
                                  between them

two cores, two threads
core 0 | T1 T1 T1 T1 T1 T1 T1
core 1 | T2 T2 T2 T2 T2 T2 T2    really at once`),
    P("On a single core the two threads only take turns. The operating system runs a bit of one, then a bit of the other. That is concurrency: two tasks in progress at once. When the work is waiting, taking turns is enough, because a waiting thread does not need the core."),
    P("Parallelism means the threads really execute at the same instant, and that needs more than one core. If you replace the sleep with a loop that computes, two threads on one core take turns on the same arithmetic and finish no sooner than one thread would."),
    H("Why we measure first"),
    P("Every version from here on adds safety, and safety costs time. So we measure v0 now: about 60 ns for one push plus one pop. Keep that number. Later versions are judged against it."),
    H("Exercises"),
    Q("64 tasks each sleep for 100 ms. How long on one thread, and how long on 64 threads?", "About 6.4 s on one thread and a little over 0.1 s on 64. Waiting overlaps almost perfectly."),
    Q("Two threads each print 1, 2, 3. Can the output be 1 1 2 3 2 3?", "Yes. Each thread keeps its own order, but the scheduler can interleave the two in any way."),
    Q("A program downloads 10 files and then hashes them. Where do extra threads help?", "The downloads, because they are mostly waiting. Hashing only gets faster with more cores."),
  ],
},
{
  ver: "v1", title: "Who owns a thread?",
  blocks: [
    H("Giving the producer its own thread"),
    P("Starting a thread is one line. The first surprise comes when the function that started it returns."),
    C(`void work() { std::cout << "working\\n"; }

int main() {
    std::thread t(work);
}   // t is destroyed here`),
    P("This program does not print \"working\" and exit normally. It aborts:"),
    O(`$ OPT=-O0 ./run.sh v1 tiny terminate
terminate called without an active exception
Aborted`),
    D(`time   0                    a few microseconds later
main   std::thread t(work)  reaches }, t is destroyed
t            starts running work() ... still running`),
    P("main creates t and immediately reaches the closing brace. The new thread has barely started, but the std::thread object t is already being destroyed. It aborts every time. To understand why, look at what a std::thread object is. It is a handle that owns a running operating system thread. When the handle is destroyed, C++ has to decide what happens to that thread, and both possible answers are dangerous."),
    D(`std::thread object  --owns-->  OS thread

before the object is destroyed you must call:
  join()    wait here until the thread finishes
  detach()  let it carry on with no owner

destroyed while still joinable -> std::terminate`),
    P("Joining automatically could freeze the program in a destructor. Detaching automatically could leave a thread reading memory that is about to disappear. C++ refuses to guess and stops the program instead."),
    H("Arguments are copied"),
    P("The second surprise is quieter. std::thread copies every argument into the new thread. If you pass your queue, the thread receives its own copy and fills that, while the queue in main stays empty. To share the real object you have to say so with std::ref(q)."),
    H("The fix: let a destructor do the joining"),
    P("We forget things, especially when an exception skips the line that would have called join(). C++ has one reliable tool for \"this must happen on every way out of a scope\": a destructor. So we write a small class that owns threads and joins all of them when it goes out of scope."),
    C(`class ThreadGroup {
    std::vector<std::thread> ts;
public:
    void add(std::thread t) {
        ts.push_back(std::move(t));
    }
    ~ThreadGroup() {
        for (auto& t : ts)
            if (t.joinable()) t.join();
    }
};

ThreadGroup g;
g.add(std::thread(producer, std::ref(q), n));`),
    P("Now every thread has exactly one owner, and that owner joins it whether the scope ends normally or through an exception. In this project we never detach."),
    H("Exercises"),
    Q("t1.join(); t2.join(); std::cout << \"Done\"; Can \"Done\" appear before the output of t1 or t2?", "No. Each join waits for its thread to finish, so Done always comes last. t1 and t2 can print in either order."),
    Q("Three threads are started and then an exception is thrown. How do you make sure all three are joined?", "Keep them in an owner like ThreadGroup, or use std::jthread, which joins in its destructor."),
    Q("Four producers push 100,000 items each into one plain std::queue. What size do you expect?", "400,000 if it worked. In practice it crashes or hangs, and that is the next problem."),
  ],
},
{
  ver: "v2", title: "Two threads, one queue",
  blocks: [
    H("The situation"),
    P("Now four producers push into the same queue at the same time. With 1,000 items each the result looked fine. With 100,000 each the program crashed or hung on every run. Something inside push() cannot cope with two threads at once."),
    D(`        shared queue
     [ 10 | 20 | 30 | ... ]
        ^             ^
        |             |
   producer T1   producer T2`),
    P("std::queue is too large to reason about, so shrink the problem to one line that two threads both run a million times."),
    C(`int counter = 0;

void inc() {
    for (int i = 0; i < 1'000'000; ++i)
        ++counter;
}

std::thread t1(inc), t2(inc);
t1.join(); t2.join();
std::cout << counter;`),
    P("The answer should be 2,000,000. It is not, and it changes every run:"),
    O(`$ OPT=-O0 ./run.sh v2 tiny        (five runs)
race: 1556397
race: 1114575
race: 1363955
race: 1099554
race: 1074728`),
    H("What ++counter really does"),
    P("++counter looks like one step, but the CPU does three: it reads the value from memory into a register, adds one in the register, and writes the result back. Both threads start at the same moment and run on two cores, so their three steps happen side by side, and nothing stops one thread from reading the value while the other is still holding its new value in a register. Follow one unlucky moment, step by step."),
    D(`T1                       T2
read counter -> 0
                         read counter -> 0
add 1        -> 1
write 1
                         add 1        -> 1
                         write 1

two increments happened, counter is 1`),
    P("Nothing crashed here. One update was simply lost. Inside std::queue the same kind of interleaving happens to internal pointers, and a lost pointer update corrupts memory. That was the crash we saw."),
    P("This is called a data race: two threads access the same memory, at least one of them writes, and nothing orders the accesses. In C++ a data race is undefined behaviour, so the compiler is allowed to produce anything at all."),
    H("What we actually need"),
    P("If one thread is in the middle of changing the queue, every other thread has to wait until it is finished. That property is called mutual exclusion, and std::mutex provides it. Only one thread can hold the mutex at a time."),
    C(`class Queue {
    std::queue<int> q;   // guarded by m
    std::mutex m;
public:
    void push(int x) {
        m.lock();
        q.push(x);
        m.unlock();
    }
};`),
    P("The code between lock() and unlock() is the critical section. The rule that makes it work is strict: every access to q, including reads like size() and empty(), must go through the same mutex. A mutex protects data, not a function. If size() reads q while push() is changing it, that read is a data race too."),
    H("Exercises"),
    Q("Pushing costs 44 ns on one thread and 141 ns per push with four threads. Why is it slower?", "The four threads queue up for one mutex, and handing a lock from one core to another costs more than the push itself."),
    Q("m.lock(); foo(); m.unlock(); What happens if foo() throws?", "unlock() never runs. The mutex stays locked and the next thread that calls lock() waits forever."),
    Q("Thread A calls q.size() while thread B calls q.push(100). Is the read safe without a lock?", "No. A reads memory that B is writing. Read-only code still needs the lock when someone else writes."),
  ],
},
{
  ver: "v3", title: "The lock that never unlocks",
  blocks: [
    H("A consumer that arrives too early"),
    P("In v2 pop() throws when the queue is empty, and it locks and unlocks by hand."),
    C(`int pop() {
    m.lock();
    if (q.empty())
        throw std::runtime_error("empty");
    int v = q.front();
    q.pop();
    m.unlock();
    return v;
}`),
    P("Follow a consumer that calls pop() before anything has been pushed. It takes the lock, finds the queue empty and throws. The exception leaves the function immediately, so the line with unlock() is never reached."),
    D(`consumer                    producer
m.lock()
queue empty -> throw
leaves pop(), m still locked
                            push(42): m.lock()
                            ...waits forever`),
    O(`$ OPT=-O0 ./run.sh v3 tiny_raii
try_lock after the exception: 0`),
    P("try_lock returning 0 means the mutex is still held by nobody who will ever release it. One exception, one skipped line, and every thread that touches the queue freezes."),
    H("We have seen this shape before"),
    P("In v1 we had something that had to happen on every way out of a scope, and we used a destructor. When an exception unwinds the stack, the destructors of all local objects still run. So we tie the lock to an object."),
    D(`object lifetime  ------------------------------>
constructor                           destructor
lock mutex                            unlock mutex
    |---------- critical section ----------|`),
    C(`int pop() {
    std::lock_guard<std::mutex> lock(m);
    if (q.empty())
        throw std::runtime_error("empty");
    int v = q.front();
    q.pop();
    return v;
}   // lock is destroyed here, m is unlocked`),
    P("This idea is called RAII: a resource is acquired in a constructor and released in a destructor. Return early, throw, break out of a loop, and the mutex is still released. You stop calling unlock() yourself, so you can no longer forget it."),
    P("One trap is worth knowing. Writing std::lock_guard<std::mutex>(m); without a variable name creates a temporary that is destroyed at the semicolon, so the lock is released before the next line runs. Always give the guard a name."),
    H("Exercises"),
    Q("A function has four return statements and one throw. How many unlock() calls does it need with lock_guard?", "None. The destructor runs on all five exits."),
    Q("std::lock_guard<std::mutex>(m); ++counter; Is counter protected?", "No. The unnamed guard unlocks at the end of its own statement."),
    Q("You need to release the lock before some slow logging at the end of a function. Which lock type helps?", "std::unique_lock, which lets you call unlock() early."),
  ],
},
{
  ver: "v3", title: "Every call is safe, the program is not",
  blocks: [
    H("Checking before taking"),
    P("To avoid the exception, consumers now check first. empty() takes the lock and pop() takes the lock, so every single call is protected."),
    C(`if (!q.empty())
    x = q.pop();`),
    P("Put one item in the queue and let two consumers run this at the same time. It still fails:"),
    D(`queue: [ 42 ]

consumer A               consumer B
empty() -> false
                         empty() -> false
pop()   -> 42
                         pop() -> queue is empty, throws`),
    O(`$ OPT=-O0 ./run.sh v3 tiny_interface
top() hit an empty stack in 186 of 200 rounds`),
    P("Both consumers saw false, which was true at the moment each of them asked. Between A's check and A's pop, B asked the same question. Each call was safe on its own. The pair of calls was not."),
    P("This is a race condition without a data race. No memory was touched without a lock, so ThreadSanitizer reports nothing. The bug lives in the design of the interface, because it forces the caller to check in one call and act in another."),
    H("Make the whole operation one call"),
    C(`bool try_pop(int& out) {
    std::lock_guard<std::mutex> lock(m);
    if (q.empty())
        return false;
    out = q.front();
    q.pop();
    return true;
}`),
    P("The check, the read and the removal now happen under a single lock, so no other thread can slip in between. try_pop never throws. It simply reports that there was nothing to take."),
    P("empty() can stay, but its meaning has changed. It can only tell you that the queue was empty at some moment during the call. By the time you act on the answer it may be wrong, so it is fine for logging and useless for decisions."),
    H("Exercises"),
    Q("A map offers locked contains() and insert(). Two threads both want to insert key 7 if it is missing. Trace it.", "Both see contains(7) == false and both insert. The second insert overwrites the first or fails."),
    Q("How would you design the map's interface so this cannot happen?", "Offer insert_if_absent(key, value), which checks and inserts under one lock."),
    Q("Why does std::queue::pop() return void instead of the value?", "If copying the returned value threw after the element was removed, the element would be lost."),
  ],
},
{
  ver: "v4", title: "Waiting without burning a core",
  blocks: [
    H("The consumer is wasting a CPU"),
    P("With try_pop a consumer that finds nothing simply tries again."),
    C(`int x;
while (!q.try_pop(x)) {
    // try again
}`),
    O(`$ OPT=-O0 ./run.sh v3 next_bug
checked an empty queue 12301046 times in 1 s`),
    P("Twelve million times a second the consumer asks whether an empty queue is still empty. None of that is useful work, and it keeps a whole core at 100%. What we want is for the consumer to sleep while the queue is empty and be woken when a producer adds something."),
    H("First attempt: unlock and nap"),
    C(`if (q.empty()) {
    m.unlock();
    sleep(1);
    m.lock();
}
int value = q.front();`),
    P("This uses no CPU, but put it on a clock. At t = 0 the consumer finds the queue empty and goes to sleep for a second. At t = 1 ms the producer pushes an item. The item then sits in the queue for 999 ms while the consumer sleeps. Shorten the nap and you are back to burning CPU. There is no good number."),
    D(`consumer                  producer
lock, q.empty() -> yes
unlock
                          lock, push(42), unlock
sleep(1)    item is already there
wake up, lock, pop 42`),
    H("Second attempt: wait for a signal"),
    P("So replace the fixed sleep with a notification. The producer signals after pushing and the consumer wakes up. Now look at the gap between unlocking and starting to wait."),
    D(`consumer                  producer
"queue empty"
unlock
      <- scheduling gap ->
                          push item
                          notify  (nobody waiting yet)
start waiting
sleeps forever, item still in the queue`),
    P("The signal arrived before the consumer was listening, so it was lost. This is the lost wake-up problem, and it is the real reason condition variables exist. The problem is the gap between releasing the mutex and going to sleep."),
    H("What std::condition_variable gives us"),
    P("We need one operation that releases the mutex and starts waiting as a single step, with no gap a producer could fall into. That is cv.wait()."),
    D(`consumer                       producer
lock mutex
queue empty? yes
release mutex + sleep  (one step)
                               lock mutex
                               push item
                               unlock
                               notify_one()
wake up
lock mutex again
check: !q.empty() is true
pop item`),
    P("Before wait() the consumer owns the mutex. While it sleeps nobody does, which is why the producer can push. When wait() returns, the consumer owns the mutex again."),
    H("Always check again after waking"),
    P("A woken thread cannot assume the item is there. Another consumer may have taken it first, and threads can occasionally wake for no reason at all (a spurious wake-up). The right mental model is a loop, while (!condition) sleep, not an if. Passing the condition to wait() as a predicate gives you exactly that loop."),
    C(`std::condition_variable cv;

void push(int x) {
    {
        std::lock_guard<std::mutex> lock(m);
        q.push(x);
    }
    cv.notify_one();
}

int wait_and_pop() {
    std::unique_lock<std::mutex> lock(m);
    cv.wait(lock, [&] { return !q.empty(); });
    int v = q.front();
    q.pop();
    return v;
}`),
    P("wait() needs a std::unique_lock rather than a lock_guard because it must unlock the mutex while sleeping and lock it again before returning. A lock_guard cannot be unlocked."),
    D(`v0  std::queue
v2  std::queue + std::mutex               safe access
v4  std::queue + std::mutex
               + std::condition_variable  waiting`),
    H("Exercises"),
    Q("With wait_and_pop, how much CPU does a consumer use while the queue stays empty?", "Close to 0%. It is asleep inside wait()."),
    Q("Remove the predicate and let the producer push and notify before the consumer calls wait(). What happens?", "The notification is lost and the consumer sleeps forever, even though an item is waiting."),
    Q("One push makes one item available. notify_one or notify_all?", "notify_one. One item can satisfy one consumer. notify_all is for news everyone must hear, like shutdown."),
  ],
},
];
