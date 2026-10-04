// Part 1 lessons (v0 to v4). Block types:
//   H heading · P paragraph · C code · D diagram/timeline · O terminal output · Q exercise + answer
//   A the question a learner would ask · J where this shows up in our project
const { H, P, C, D, O, Q, A, J } = require("./blocks.js");

module.exports = [
{
  ver: "v0", title: "What does a second thread buy us?",
  blocks: [
    H("Where we start"),
    P("Over the next fifteen versions we will build one thing: a queue that many threads can use at the same time. By the end it will be the heart of a thread pool, and later the core of the projects we build together. We start with the simplest queue possible."),
    C(`class Queue {
    std::queue<int> q;
public:
    void push(int x) { q.push(x); }
    int pop() {
        int v = q.front();   // read the front item
        q.pop();             // then remove it
        return v;
    }
    std::size_t size() const { return q.size(); }
};`),
    P("One function, the producer, pushes numbers in. Another, the consumer, pops them out. Right now both run on the same thread, so the program does one thing at a time: all the producing first, then all the consuming."),
    A("What is a thread, exactly?"),
    P("A thread is a sequence of instructions that the computer runs one after another, like a single worker following a list of steps. Every program starts with one thread, the one that runs main(). If you create a second thread, you now have two workers, each following its own list."),
    A("So with two threads, will the program run twice as fast?"),
    P("That is the natural guess. Sometimes it is true and sometimes it is not, and knowing which is the first thing to understand. Let us test it with a task that does nothing but wait two seconds, the way a program waits for a file or a network reply."),
    C(`void task() {
    std::this_thread::sleep_for(2s);
}

// version 1: one thread
task();
task();

// version 2: two threads
std::thread t1(task);   // start a thread running task()
std::thread t2(task);   // start another one
t1.join();              // wait until t1 has finished
t2.join();              // wait until t2 has finished`),
    P("The one-thread version takes 4 seconds and the two-thread version takes 2. You can see it yourself:"),
    O(`$ ./run.sh v0 tiny
sequential:  4.00 s
two threads: 2.00 s`),
    A("Half the time. Did each task get faster?"),
    P("No, and this is the important part. Put both versions on a clock that starts at t = 0. With one thread, the first task() sleeps from 0 to 2 s. The second cannot start until the first returns, so it sleeps from 2 to 4 s."),
    D(`time   0s        1s        2s        3s        4s
main   |== task() ==========|== task() ==========|
                            ^ 2nd call starts`),
    P("With two threads, the lines that create t1 and t2 are written one after the other, but creating a thread takes only microseconds. So both threads start sleeping at almost exactly t = 0, side by side."),
    D(`time   0s        1s        2s
t1     |== sleeping ========|  done at 2s
t2     |== sleeping ========|  done at 2s
main   creates t1, t2 (microseconds)
       t1.join() waits ......| returns at 2s
                             t2.join(): t2 is
                             already done, returns`),
    P("main goes straight to t1.join() and waits there. At 2 s, t1 finishes and the join returns. main reaches t2.join(), but t2 started at the same moment and is also finished, so that join returns at once. Each task still slept its full two seconds. We only saved time because the two waits overlapped."),
    A("Would it also halve the time if the task was doing calculations instead of sleeping?"),
    P("Only if there are free cores. A core is the part of the processor that actually runs instructions, and each core runs one thread at any instant. If two threads share one core, the operating system switches between them many times a second: they take turns."),
    D(`one core, two threads
core 0 | T1 T1 T2 T1 T2 T2 T1   taking turns

two cores, two threads
core 0 | T1 T1 T1 T1 T1 T1 T1
core 1 | T2 T2 T2 T2 T2 T2 T2   really at once`),
    P("A sleeping thread does not need the core, so taking turns is enough for waiting tasks. A calculating thread needs the core all the time, so two calculating threads on one core finish no sooner than one. Two tasks in progress at once, even if they take turns, is called concurrency. Two tasks running at the very same instant on different cores is called parallelism."),
    J("Our thread pool in v9 will run tasks that wait (like downloads) and tasks that calculate. How many threads we start depends on exactly this difference."),
    H("Why we measure before adding threads"),
    P("Every version from here on makes the queue safer, and safety costs time. So we take a starting measurement now: about 60 ns for one push plus one pop. Later versions are compared to this number."),
    H("Exercises"),
    Q("64 tasks each sleep for 100 ms. How long does it take on one thread, and how long on 64 threads?",
      "On one thread the tasks run one after another: 64 x 100 ms = 6.4 seconds. On 64 threads all of them start at about t = 0 and sleep side by side, so all finish at about t = 100 ms. In practice it is a little more than 0.1 s, because starting 64 threads takes some time. This works so well only because the tasks are waiting, not calculating."),
    Q("Two threads each print 1, 2, 3. Can the output be 1 1 2 3 2 3?",
      "Yes. Each thread prints its own numbers in order, so a thread never prints 2 before its 1. But the operating system decides when each thread runs and can switch at any moment. Here thread A printed 1, then B printed 1, 2, 3, then A printed 2, 3. Any mix that keeps each thread's own order is possible, and it can change every run."),
    Q("A program downloads 10 files, then computes a hash of each one. Where do extra threads help?",
      "With the downloads, a lot: a download mostly waits for the network, and ten threads can wait at the same time. Hashing is pure calculation, so it only speeds up if there are free cores to run threads in parallel. On a 4-core machine, hashing 10 files with 10 threads is at most about 4 times faster than with one."),
  ],
},
{
  ver: "v1", title: "Who owns a thread?",
  blocks: [
    H("Giving the producer its own thread"),
    P("Now we want our producer and consumer on their own threads. Before we touch the queue, there is a question that seems too simple to ask, and it trips up almost everyone."),
    A("What happens to a thread when the function that started it ends?"),
    C(`void work() {
    std::cout << "working\\n";
}

int main() {
    std::thread t(work);
}   // main ends here`),
    P("You might expect \"working\" and a normal exit. The program aborts instead:"),
    O(`$ OPT=-O0 ./run.sh v1 tiny terminate
terminate called without an active exception
Aborted`),
    P("Follow the clock. At t = 0 main creates t and a new thread starts running work(). main has nothing else to do, so a few microseconds later it reaches the closing brace, where every local variable is destroyed, including t. The new thread is still running."),
    D(`time   0                   a few microseconds later
main   std::thread t(work)  reaches }, t destroyed
t           starts work() ...  still running`),
    A("Why is destroying t a problem? The thread is still doing its work."),
    P("Because t is not the thread itself. It is a handle: a small object that owns a running thread inside the operating system. When the handle is destroyed, C++ must decide what happens to the thread it owns, and there are only two choices."),
    D(`std::thread object  --owns-->  OS thread

before the object is destroyed, choose:
  join()    wait here until the thread finishes
  detach()  let it run on with no owner

destroyed without choosing -> std::terminate`),
    A("Why doesn't C++ just pick one for me?"),
    P("Both automatic choices are dangerous. If it joined automatically, a destructor could block forever and you would never see why. If it detached automatically, the thread could keep running after the variables it uses are gone, reading memory that no longer belongs to it. Both bugs are very hard to find, so C++ stops the program loudly instead and makes you choose."),
    H("Arguments are copied"),
    P("The second surprise is quieter. std::thread t(producer, q, n) gives the new thread its own copies of q and n. That is a safety feature, because the thread might outlive the function that started it. But for us it means the producer fills a copy of the queue, and main's queue stays empty. To share the real queue you must say so explicitly: std::ref(q)."),
    H("Making sure every thread is joined"),
    A("I'll just remember to call join() then?"),
    P("You will forget at some point. Worse, an exception can jump over the line with join() even when you remembered. We need join() to happen however the scope ends."),
    P("C++ already has exactly one tool for \"this must happen whenever a scope ends\": the destructor. A local object's destructor runs when the scope ends normally, and it also runs when an exception passes through. So we write a small class that owns threads and joins them in its destructor."),
    C(`class ThreadGroup {
    std::vector<std::thread> ts;
public:
    void add(std::thread t) {
        ts.push_back(std::move(t));
    }
    ~ThreadGroup() {          // runs when g goes away
        for (auto& t : ts)
            if (t.joinable()) t.join();
    }
};

ThreadGroup g;
g.add(std::thread(producer, std::ref(q), n));
g.add(std::thread(consumer, std::ref(q), n));
// at the end of the scope g joins both`),
    P("std::move(t) is needed because a std::thread cannot be copied, only moved: one OS thread must have exactly one owner. In this project every thread has an owner like this, and we never use detach()."),
    J("The thread pool in v9 keeps all its worker threads in a ThreadGroup, so destroying the pool always joins every worker."),
    H("Exercises"),
    Q("t1.join(); t2.join(); std::cout << \"Done\"; Can \"Done\" appear before the output of t1 or t2?",
      "No. main stops at t1.join() until t1 has finished, then stops at t2.join() until t2 has finished. Only then does it print Done, so Done is always last. t1 and t2 themselves can still print in either order, because they run at the same time while main waits."),
    Q("Three threads are started, then an exception is thrown before any join(). What happens, and how do you prevent it?",
      "The exception leaves the function, the std::thread objects are destroyed while still joinable, and the program terminates. Keep the threads in an owner whose destructor joins them, like ThreadGroup, or use std::jthread (C++20), which joins in its own destructor. Destructors run during the exception, so the threads are joined safely."),
    Q("Four producers each push 100,000 items into one plain std::queue at the same time. What size do you expect?",
      "If it worked, 4 x 100,000 = 400,000. In practice the program crashes, hangs or ends with a wrong size, because four threads are inside push() at the same moment, changing the same data. Why that breaks things is exactly the next version."),
  ],
},
{
  ver: "v2", title: "Two threads, one queue",
  blocks: [
    H("The situation"),
    P("We start four producers that push into the same queue at once. With 1,000 items each it looks fine. With 100,000 each, it crashes or hangs every time. Before we can fix it we need two ideas that the crash depends on."),
    H("Idea 1: shared state"),
    A("Why would two threads interfere with each other at all?"),
    P("Each thread has its own local variables. If thread A only ever touches its own locals and thread B only touches its own, they can never get in each other's way, no matter how they are scheduled."),
    D(`thread A          thread B
  localA            localB      private

          counter               both can reach it
       SHARED STATE`),
    P("Trouble can only start when both threads reach the same data. That data is called shared state. Our queue is shared state: every producer pushes into the same object. So the question becomes: what goes wrong when two threads change the same thing at once?"),
    H("Idea 2: one line is not one step"),
    P("std::queue has a lot of code inside, so let us shrink the problem to one line that two threads each run a million times."),
    C(`int counter = 0;      // shared state

void inc() {
    for (int i = 0; i < 1'000'000; ++i)
        ++counter;
}

std::thread t1(inc), t2(inc);
t1.join();
t2.join();
std::cout << counter;`),
    P("The answer should be 2,000,000. It is not, and it changes every run:"),
    O(`$ OPT=-O0 ./run.sh v2 tiny      (five runs)
race: 1556397
race: 1114575
race: 1363955
race: 1099554
race: 1074728`),
    A("How can adding one a million times twice lose half a million?"),
    P("Because ++counter is not one operation. The processor does three: READ the value from memory into a register (a tiny storage slot inside the core), ADD one to it, and WRITE it back. Each core has its own registers. Two threads on two cores run these steps side by side, and nothing stops them from interleaving like this:"),
    D(`T1 (core 0)              T2 (core 1)
READ  counter -> 0
                         READ  counter -> 0
ADD   -> 1
WRITE 1
                         ADD   -> 1
                         WRITE 1

two increments, counter is 1`),
    P("T2 read 0 before T1 had written its 1. So T2 also computed 1, and wrote it over T1's result. One increment vanished. Over a million loops this happens hundreds of thousands of times."),
    P("Inside std::queue the same thing happens to its internal pointers. A lost pointer update leaves the queue pointing at the wrong memory, and that is the crash. This bug is called a data race: two threads access the same memory, at least one writes, and nothing makes them take turns. In C++ it is undefined behaviour, so anything at all may happen."),
    H("What would you do?"),
    A("Couldn't we just check whether the other thread is busy before touching counter?"),
    P("Try it: if (!busy) { busy = true; ++counter; busy = false; }. But checking busy and setting it are two separate steps too. Both threads can read busy as false at the same moment, both set it to true, and both go in. We have moved the race, not removed it. We need something the hardware guarantees: when one thread is inside, every other thread waits. That property is called mutual exclusion."),
    H("The mutex"),
    P("std::mutex gives us mutual exclusion. Think of it as the only key to a room. lock() takes the key, and if another thread already has it, you wait at the door until it comes back. unlock() hands the key back. The code between lock() and unlock() is the room, and it is called the critical section."),
    P("Before using it in the queue, watch what a mutex does to two threads. Each one locks, stays inside for half a second, and unlocks."),
    C(`void visit(const char* who) {
    say(who, "wants the mutex");
    m.lock();
    say(who, "is inside");
    std::this_thread::sleep_for(500ms);
    say(who, "leaves");
    m.unlock();
}

std::thread a(visit, "A"), b(visit, "B");`),
    O(`$ OPT=-O0 ./run.sh v2 exp_mutex
0.000 s  A wants the mutex
0.000 s  A is inside
0.000 s  B wants the mutex
0.500 s  A leaves
0.501 s  B is inside
1.001 s  B leaves`),
    P("Both threads asked at almost the same moment. A got the key first, so B simply waited at lock() for half a second and only went in after A left. Run it a few times and sometimes B goes first, but they are never inside together. That waiting is exactly what we were missing in the counter."),
    H("Why this fixes the exact problem"),
    P("Put the increment inside the room. Now T2 cannot READ while T1 is between its READ and WRITE, because T2 is stuck at lock()."),
    D(`T1                       T2
lock m
READ 0, ADD, WRITE 1
                         lock m ... waits
unlock m
                         gets m: READ 1, ADD,
                         WRITE 2, unlock m`),
    C(`class Queue {
    std::queue<int> q;   // guarded by m
    std::mutex m;
public:
    void push(int x) {
        m.lock();        // wait for the key
        q.push(x);       // only one thread here
        m.unlock();      // hand the key back
    }
};`),
    P("One rule makes it work: every access to q goes through the same mutex, including reads like size() and empty(). If size() reads while push() is halfway through a change, it reads a broken state. The mutex protects the data, not a particular function."),
    J("Every piece of shared state in our pool (the task queue, result lists, caches) will be guarded by a mutex this way, until Part 3 where we find cheaper tools for special cases."),
    H("Exercises"),
    Q("One thread pushes in 44 ns. With four threads pushing at once, each push takes 141 ns. Why does it get slower?",
      "Only one thread can hold the mutex, so with four threads the other three are usually waiting at lock(). The pushes no longer run in parallel, they run one at a time. On top of that, handing the mutex from one core to another takes time, because the cores must agree on who owns it, and that costs more than the push itself. We come back to this cost in v5."),
    Q("m.lock(); foo(); m.unlock(); What happens if foo() throws?",
      "The exception leaves the function straight away, so m.unlock() never runs. The key is never handed back. The next thread that calls m.lock() waits forever, and so does every thread after it. This is exactly the problem v3 solves."),
    Q("Thread A calls q.size() while thread B calls q.push(100). A only reads. Does it still need the lock?",
      "Yes. B is changing the queue's internal data while A reads it, so A can see it half changed and get a wrong size, or worse. A read at the same time as a write is still a data race. Read-only code needs the lock whenever another thread might be writing."),
  ],
},
{
  ver: "v3", title: "The lock that never unlocks",
  blocks: [
    H("A consumer that arrives too early"),
    P("In v2, pop() throws when the queue is empty, and it locks and unlocks by hand."),
    C(`int pop() {
    m.lock();
    if (q.empty())
        throw std::runtime_error("empty");
    int v = q.front();
    q.pop();
    m.unlock();
    return v;
}`),
    A("What happens if a consumer calls pop() before anything was pushed?"),
    P("Trace it line by line. It takes the lock. The queue is empty, so it throws. A throw leaves the function immediately, skipping every remaining line, including m.unlock()."),
    D(`m.lock()
   |
throw
   |
m.unlock()  ?   never reached
   |
mutex stays locked
   |
another thread calls lock()
   |
waits forever`),
    D(`consumer                    producer
m.lock()
queue empty -> throw
leaves pop(), m still locked
                            push(42): m.lock()
                            ...waits forever`),
    P("One exception, one skipped line, and every thread that uses the queue freezes. You can see the mutex left locked: try_lock() tries to take it without waiting and returns false, printed as 0, if it is taken."),
    O(`$ OPT=-O0 ./run.sh v3 tiny_raii
try_lock after the exception: 0`),
    H("What would you do?"),
    A("Could I wrap it in try/catch and unlock in the catch block?"),
    P("You could, and then you would need it in every function, and you would still have to remember an unlock before every return. The real problem is not that manual locking looks ugly. The real question is: how can the unlock happen automatically, whatever way the function is left?"),
    A("Haven't we seen something that runs whatever way a scope is left?"),
    P("Yes, in v1. Destructors of local objects run when a scope ends normally and when an exception passes through. That process is called stack unwinding. So we tie the mutex to the lifetime of a local object: its constructor locks, its destructor unlocks. The standard library already has this class, std::lock_guard."),
    D(`object lifetime ----------------------------->
constructor                        destructor
  locks m                            unlocks m
     |------- critical section --------|`),
    C(`int pop() {
    std::lock_guard<std::mutex> lock(m);
    if (q.empty())
        throw std::runtime_error("empty");
    int v = q.front();
    q.pop();
    return v;
}   // lock is destroyed here: m unlocked`),
    H("Why this fixes the exact problem"),
    P("Trace the early consumer again. lock_guard's constructor locks. The queue is empty, so it throws. As the exception leaves pop(), the local variable lock is destroyed, and its destructor unlocks m. The producer gets in. A normal return, an early return, a break: every exit destroys lock, so every exit unlocks."),
    P("This pattern is called RAII, Resource Acquisition Is Initialization. Ignore the awkward name; the idea is: acquire in a constructor, release in a destructor, and you can never forget the release."),
    A("Is there any way to get lock_guard wrong?"),
    P("One. std::lock_guard<std::mutex>(m); without a variable name creates a temporary, which is destroyed at the end of that same line. The mutex is locked and unlocked immediately, and the lines below are not protected. The compiler will not warn you. Always name the guard."),
    J("RAII is why an exception inside a task can never leave our pool's queue locked. Every lock in the project is taken through a guard object, never with a bare lock()."),
    H("Exercises"),
    Q("A function has four return statements and one throw. With lock_guard, how many unlock() calls do you write?",
      "None. lock_guard is a local variable, and its destructor runs on whichever of the five exits is taken. That is the point of RAII: the release is written once, in the destructor, instead of before every exit. With manual unlock() you would need it in five places, and missing one would freeze the program."),
    Q("std::lock_guard<std::mutex>(m); ++counter; Is counter protected?",
      "No. The unnamed guard is a temporary that lives only until the end of its own statement, so m is unlocked before ++counter runs. The data race from v2 is back. std::lock_guard<std::mutex> lock(m); keeps the guard, and the lock, until the end of the scope."),
    Q("At the end of a function you write a slow log message. You do not want to hold the lock during it. What can you use?",
      "std::unique_lock. Like lock_guard it locks in its constructor and unlocks in its destructor, but it also lets you call unlock() early. Unlock right after the last line that touches shared data, then write the log without blocking anyone. If you forget, the destructor still unlocks, so you keep the safety."),
  ],
},
{
  ver: "v3", title: "Every call is safe, the program is not",
  blocks: [
    H("Checking before taking"),
    A("To avoid the exception, can't the consumer just check empty() first?"),
    P("That is what everyone tries. empty() takes the lock and pop() takes the lock, so every call is protected. It looks completely safe."),
    C(`if (!q.empty())       // locks, checks, unlocks
    x = q.pop();      // locks, pops, unlocks`),
    A("Would this actually work with two consumers?"),
    P("Put exactly one item in the queue and let two consumers run it at the same time. In a test with the same pattern on a stack, it failed in 186 of 200 rounds:"),
    O(`$ OPT=-O0 ./run.sh v3 tiny_interface
top() hit an empty stack in 186 of 200 rounds`),
    P("Look at what happens between the two calls. Each call takes the lock and gives it back before returning. Between them the lock is free, and another thread can do anything."),
    D(`queue: [ 42 ]

consumer A               consumer B
empty() -> false
                         empty() -> false
pop()   -> 42
                         pop() -> queue empty,
                                  throws`),
    A("Both got false. How?"),
    P("Both asked honestly, and at that moment the queue really had one item. Then A took it. By the time B acted on its answer, the answer was out of date. Each call was safe on its own. The pair of calls was not. A function can be thread-safe while a sequence of calls to it is not."),
    P("This is not a data race: no memory was touched without the lock, so race-detecting tools report nothing. It is a race condition, a result that depends on timing. The bug is in the interface itself, because it forces the caller to check in one call and act in another."),
    H("The fix: one call, one lock"),
    P("Stop splitting the check from the action. Offer one function that checks, reads and removes under a single lock, so nobody can slip in between."),
    C(`bool try_pop(int& out) {
    std::lock_guard<std::mutex> lock(m);
    if (q.empty())
        return false;     // nothing to take
    out = q.front();
    q.pop();
    return true;
}`),
    P("Replay the two consumers. A takes the lock, finds 42, removes it, unlocks. B takes the lock, finds the queue empty and gets false. Nobody throws, nobody gets an item twice."),
    A("Is empty() useless now?"),
    P("Its meaning has changed. It tells you the queue was empty at some moment during the call. By your next line that may be false. Fine for logging, never for decisions."),
    J("Every operation our pool offers (submit a task, take a task) is a single call under a single lock, for exactly this reason."),
    H("Exercises"),
    Q("A map has locked contains() and insert(). Two threads both want to insert key 7 only if it is missing. Trace it.",
      "A calls contains(7) and gets false. Before A inserts, B also calls contains(7) and also gets false. Both insert key 7, so the second overwrites the first or fails. Both threads believed they were the one adding the key. It is the same check-then-act gap as empty() then pop()."),
    Q("Design the map's interface so this cannot happen.",
      "Offer insert_if_absent(key, value), which takes the lock, checks for the key, inserts if missing, and only then releases the lock. No thread can run between the check and the insert. It can return true or false to say whether it inserted."),
    Q("Why does std::queue::pop() return void instead of the removed item?",
      "If pop() removed the item and then returned it, the copy into the caller's variable would happen after the item had left the queue. If that copy throws, for example because memory runs out, the item is gone: not in the queue, not in the variable. With front() then pop(), you copy first and remove second, so a failed copy loses nothing."),
  ],
},
{
  ver: "v4", title: "Waiting without burning a core",
  blocks: [
    H("What is the consumer actually doing?"),
    P("Imagine the queue is empty and a consumer wants an item."),
    D(`consumer: "I need an item."
              |
         queue is empty
              |
     "What should I do now?"`),
    P("With try_pop() the simplest answer is: try again."),
    C(`int x;
while (!q.try_pop(x)) {
    // nothing there, try again
}`),
    P("If nothing arrives for a second, this loop runs about twelve million times:"),
    O(`$ OPT=-O0 ./run.sh v3 next_bug
checked an empty queue 12301046 times in 1 s`),
    A("What is the consumer doing twelve million times?"),
    P("Checking an empty queue. Check, check, check, while nothing changes. None of it is useful, and it keeps a whole core at 100%. What we really want: the consumer sleeps while the queue is empty, using no CPU, and wakes up the moment a producer adds something."),
    H("Naive idea 1: unlock and nap"),
    A("Why not just let the consumer sleep for a while and check again?"),
    C(`if (q.empty()) {
    m.unlock();      // let producers in
    sleep(1);
    m.lock();
}
int value = q.front();`),
    P("Put it on a clock. At t = 0 the queue is empty, the consumer naps for a second. At t = 1 ms a producer pushes. The item then waits 999 ms for a consumer that is asleep."),
    D(`time  0      1 ms                      1 s
cons  empty, unlock, sleep ............| wakes, pops
prod         lock, push 42, unlock
             item waits 999 ms`),
    P("A shorter nap means checking more often, which is back to burning CPU. A longer nap means items wait longer. There is no right number, because we are guessing when the item arrives."),
    H("Naive idea 2: wait for a signal"),
    A("Then let the producer tell the consumer when it pushes?"),
    P("Good idea. After pushing, the producer sends a signal, and the consumer sleeps until it gets one. But look closely at the moment between unlocking and starting to sleep."),
    D(`consumer                  producer
queue empty
unlock()
   |
   |  <---- gap
   |                      push(42)
   |                      signal "item!"
   |                      (nobody listening)
start sleeping
   ... sleeps forever, 42 is in the queue`),
    P("The producer shouted \"there is an item!\" but the consumer was not listening yet. The signal is lost, and the consumer sleeps forever next to a full queue. This is called the lost wake-up."),
    A("So what exactly went wrong?"),
    P("Not the sleeping. The gap. Releasing the mutex and starting to sleep were two separate steps, and the producer slipped between them. We need one operation that releases the mutex and starts waiting as a single step."),
    H("The concept: std::condition_variable"),
    P("That one operation is cv.wait(lock, predicate). The predicate is a small function that answers \"can I continue?\". Follow every step, including who owns the mutex."),
    D(`1  consumer owns the mutex
2  consumer checks predicate: !q.empty()
3  predicate is false
4  wait() releases the mutex  } one step:
5  consumer sleeps            } no gap
6  producer acquires the mutex
7  producer pushes 42
8  producer releases the mutex
9  producer calls notify_one()
10 consumer wakes up
11 consumer reacquires the mutex
12 consumer checks predicate AGAIN
13 predicate is now true
14 wait() returns: consumer owns the
   mutex and the queue has an item`),
    A("Where is the mutex while the consumer sleeps? How does the producer get it?"),
    P("Steps 4 and 5: wait() itself unlocks it as it puts the consumer to sleep. Nobody owns it while the consumer sleeps, which is why the producer can lock it at step 6. At step 11, before wait() returns, it locks the mutex again. So when your code continues after wait(), you own the mutex again, just as before the call."),
    A("Why check the predicate again at step 12? It was notified."),
    P("Two reasons. Another consumer may have woken first and taken the item. And threads can occasionally wake with no notify at all, a spurious wake-up. So the correct mental model is a loop: while (!condition) sleep, never if (!condition) sleep. The predicate version of wait() runs that loop for you."),
    A("Why can't the producer's notify fall into a gap now?"),
    P("Because the consumer checks the predicate while holding the mutex, and releases it only as part of going to sleep. The producer needs the mutex to push. So the push happens either before the consumer's check, and the consumer sees the item, or after the consumer is already asleep, and the notify wakes it. There is no moment in between."),
    H("The code"),
    C(`std::condition_variable cv;

void push(int x) {
    {
        std::lock_guard<std::mutex> lock(m);
        q.push(x);
    }
    cv.notify_one();    // wake one waiter
}

int wait_and_pop() {
    std::unique_lock<std::mutex> lock(m);
    cv.wait(lock, [&] { return !q.empty(); });
    int v = q.front();  // we own m here
    q.pop();
    return v;
}`),
    A("Why unique_lock and not lock_guard?"),
    P("wait() has to unlock the mutex in step 4 and lock it again in step 11. lock_guard cannot be unlocked by anyone; unique_lock can. That is the only reason."),
    D(`v0  std::queue
v2  + std::mutex                safe access
v4  + std::condition_variable   efficient waiting`),
    J("Our pool's workers sit in exactly this wait_and_pop() when there is no work. They use no CPU until a task is submitted, and notify_one() wakes one of them."),
    H("Exercises"),
    Q("With wait_and_pop(), how much CPU does a consumer use while the queue is empty for a minute?",
      "Almost none. Inside wait() the thread sleeps, and the operating system gives sleeping threads no time on a core. It only runs again when notified, or on a rare spurious wake-up, after which it checks the predicate, finds the queue still empty, and goes back to sleep. Compare that with 12 million checks a second."),
    Q("Remove the predicate and call plain cv.wait(lock). The producer pushes and notifies before the consumer reaches wait(). What happens?",
      "The notify happens while nobody is waiting, and condition variables do not remember past notifies, so it does nothing. The consumer then calls wait() and sleeps, although an item is already in the queue. Nobody notifies again, so it sleeps forever. With the predicate, wait() first checks !q.empty(), sees the item and returns at once."),
    Q("Trace cv.wait(lock, pred) when the queue already has an item at the moment the consumer calls it.",
      "The consumer owns the mutex and calls wait(). wait() checks the predicate first: !q.empty() is true. So it returns immediately, without releasing the mutex and without sleeping at all. The consumer still owns the mutex and pops the item. This is why the predicate also protects you from notifies that came early."),
  ],
},
];
