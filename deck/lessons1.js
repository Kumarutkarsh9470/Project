// Part 1 lessons (v0 to v4). Block types:
//   H heading · P paragraph · C code · D diagram/timeline · O terminal output · Q exercise + answer
const { H, P, C, D, O, Q } = require("./blocks.js");

module.exports = [
{
  ver: "v0", title: "What does a second thread buy us?",
  blocks: [
    H("Where we start"),
    P("Over the next fifteen versions we will build one thing: a queue that many threads can use at the same time. We start with the simplest queue possible, a thin wrapper around std::queue<int>. push() adds a number at the back, pop() takes one from the front."),
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
    P("In our first program one function, the producer, pushes numbers into the queue, and another, the consumer, pops them out. Everything happens on one thread, so the program does one thing at a time: first all the producing, then all the consuming."),
    P("A thread is simply a sequence of instructions that the computer runs one after another. Every program starts with one thread, the one that runs main(). A natural idea is to start a second thread so the producer and the consumer can work at the same time. Before we do that, it helps to understand what a second thread really gives us, because it is not always speed."),
    H("A small experiment"),
    P("Take a task that does nothing except wait for two seconds. This is what a program does when it waits for a file to load or a reply from the network. We run the task twice on one thread, and then once each on two separate threads."),
    C(`void task() {
    std::this_thread::sleep_for(2s);
}

// version 1: one thread
task();
task();

// version 2: two threads
std::thread t1(task);   // starts a new thread
std::thread t2(task);   // and another one
t1.join();              // wait for t1 to finish
t2.join();              // wait for t2 to finish`),
    P("std::thread t1(task) creates a new thread and immediately starts running task() on it. join() means \"wait here until that thread has finished\". The single-threaded version takes 4 seconds and the two-threaded version takes 2. You can run it yourself:"),
    O(`$ ./run.sh v0 tiny
sequential:  4.00 s
two threads: 2.00 s`),
    H("What happens on the clock"),
    P("To see why, imagine a clock that starts at t = 0 when the program begins. In the single-threaded version the first call to task() sleeps from 0 s to 2 s. The second call cannot start until the first one returns, so it sleeps from 2 s to 4 s. The two waits sit end to end."),
    D(`time   0s        1s        2s        3s        4s
main   |== task() ==========|== task() ==========|
                            ^ 2nd call starts`),
    P("Now the two-threaded version. The two lines that create t1 and t2 are written one after the other, but creating a thread takes only a few microseconds. So for our purposes both threads begin sleeping at almost exactly t = 0, side by side."),
    D(`time   0s        1s        2s
t1     |== sleeping ========|  done at 2s
t2     |== sleeping ========|  done at 2s
main   creates t1, t2 (a few microseconds)
       t1.join() waits ......| returns at 2s
                             t2.join() returns at
                             once: t2 already done`),
    P("Meanwhile main has moved on to t1.join() and is waiting there. At t = 2 s, t1 finishes and that join returns. main then reaches t2.join(). But t2 started at the same moment as t1, so it has also finished, and this join returns immediately. The whole program took 2 seconds."),
    P("Look at what did not happen. Neither task became faster. Each one still slept for its full two seconds. We saved time only because the two waits overlapped."),
    H("Taking turns is not the same as running together"),
    P("Your computer has a few cores, and each core can run one thread at any instant. If there are more threads than cores, the operating system switches between them many times a second, so they take turns."),
    D(`one core, two threads
core 0 | T1 T1 T2 T1 T2 T2 T1   the OS switches

two cores, two threads
core 0 | T1 T1 T1 T1 T1 T1 T1
core 1 | T2 T2 T2 T2 T2 T2 T2   really at once`),
    P("Having two tasks in progress at the same time, even if they only take turns, is called concurrency. When the tasks are mostly waiting, taking turns is enough, because a sleeping thread does not need the core at all. That is why our experiment halved the time."),
    P("Running two threads at the very same instant on two different cores is called parallelism. It is what you need when the work is computation rather than waiting. If you replace the sleep with a loop that does arithmetic and run both threads on one core, they just take turns on the same core and finish no sooner than one thread would."),
    H("Why we measure before adding threads"),
    P("Every version from here on makes the queue safer, and safety always costs a little time. To know what each step costs, we need a starting number. Our plain queue takes about 60 nanoseconds for one push plus one pop. Keep that number in mind: later versions are compared to it."),
    H("Exercises"),
    Q("64 tasks each sleep for 100 ms. How long does it take on one thread, and how long on 64 threads?",
      "On one thread the tasks run one after another, so the total is 64 x 100 ms = 6.4 seconds. On 64 threads all 64 tasks start at about t = 0 and all sleep at the same time, so they all finish at about t = 100 ms. In practice you get a little more than 0.1 s because starting 64 threads takes some time. This works so well only because the tasks are waiting, not computing."),
    Q("Two threads each print 1, 2, 3. Can the output be 1 1 2 3 2 3?",
      "Yes. Each thread prints its own numbers in order, so you will never see 2 before 1 from the same thread. But the operating system decides when each thread runs, and it can switch between them at any moment. Here thread A printed 1, then thread B printed 1, 2, 3, then A printed 2, 3. Any mix that keeps each thread's own order is possible, and the result can be different every time you run it."),
    Q("A program downloads 10 files and then computes a hash of each one. Where do extra threads help?",
      "They help a lot with the downloads, because a download spends most of its time waiting for the network, and ten threads can wait at the same time. Hashing is pure computation, so it only gets faster if there are free cores to run the threads in parallel. On a 4-core machine, hashing 10 files with 10 threads is at most about 4 times faster than with one."),
  ],
},
{
  ver: "v1", title: "Who owns a thread?",
  blocks: [
    H("Giving the producer its own thread"),
    P("In v0 we saw that std::thread starts a new thread. Now we want to use it in our program, and the first surprise comes from a question you might not think to ask: what happens to a thread when the function that started it ends?"),
    C(`void work() {
    std::cout << "working\\n";
}

int main() {
    std::thread t(work);
}   // main ends, t is destroyed here`),
    P("You might expect this to print \"working\" and exit. Instead the program aborts:"),
    O(`$ OPT=-O0 ./run.sh v1 tiny terminate
terminate called without an active exception
Aborted`),
    P("Let us follow it on the clock. main creates t at t = 0, and a new thread starts running work(). But main has nothing else to do, so a few microseconds later it reaches the closing brace. At that point every local variable is destroyed, including t, while the new thread is still running."),
    D(`time   0                 a few microseconds later
main   std::thread t(work)  reaches }, t destroyed
t           starts work() ...  still running`),
    H("What a std::thread object is"),
    P("The variable t is not the thread itself. It is a handle, a small object that owns a running thread inside the operating system. When the handle is about to be destroyed, C++ needs to know what should happen to the thread it owns. There are two options, and you have to pick one yourself before the handle dies."),
    D(`std::thread object  --owns-->  OS thread

before the object is destroyed, call one of:
  join()    wait here until the thread finishes
  detach()  let it run on with no owner

destroyed while still joinable -> std::terminate`),
    P("Why does C++ not simply pick one for you? If it joined automatically, a destructor could block forever without you noticing. If it detached automatically, the thread could keep running after the variables it uses are gone, and read memory that no longer belongs to it. Both mistakes are hard to find, so C++ chooses to stop the program loudly instead."),
    H("Arguments are copied"),
    P("The second surprise is quieter. When you write std::thread t(producer, q, n), the thread receives its own copies of q and n. That is a safety feature, because the new thread might outlive the variables of the function that started it. But for our queue it means the producer fills a copy, and the queue in main stays empty. To pass the real queue you have to say so explicitly with std::ref(q)."),
    H("Letting a destructor do the joining"),
    P("So every thread must be joined. The danger is that we forget, or that an exception jumps over the line that would have called join(). In C++ there is one reliable way to make sure something happens however a scope ends: put it in a destructor. Destructors run when a scope ends normally, and they also run when an exception passes through."),
    P("So we write a small class that owns our threads and joins every one of them in its destructor."),
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
// g's destructor joins both threads`),
    P("std::move(t) is needed because a std::thread cannot be copied, only moved: one OS thread must have exactly one owner. Now every thread we start has an owner that always joins it. In this project we never use detach()."),
    H("Exercises"),
    Q("t1.join(); t2.join(); std::cout << \"Done\"; Can \"Done\" appear before the output of t1 or t2?",
      "No. main reaches t1.join() and stops there until t1 has finished. Then it reaches t2.join() and stops until t2 has finished. Only after both joins have returned does main print Done, so Done is always last. The output of t1 and t2 can still come in either order, because the two threads run at the same time while main is waiting."),
    Q("Three threads are started, and then an exception is thrown before any join() is reached. What happens, and how do you prevent it?",
      "The exception leaves the function, and all local std::thread objects are destroyed while still joinable, so the program terminates. To prevent it, give the threads to an owner whose destructor joins them, like our ThreadGroup, or use std::jthread from C++20, which joins in its own destructor. The destructor runs during the exception, so the threads are joined safely."),
    Q("Four producers each push 100,000 items into one plain std::queue at the same time. What size do you expect?",
      "If it worked, 4 x 100,000 = 400,000. In practice the program crashes or hangs, or ends with a wrong size. Four threads are now inside push() at the same moment, changing the same internal data of the queue. Why that breaks things is exactly the subject of the next version."),
  ],
},
{
  ver: "v2", title: "Two threads, one queue",
  blocks: [
    H("The situation"),
    P("At the end of v1 we started four producer threads, all pushing into the same queue at the same time. With 1,000 items each the result looked correct. With 100,000 items each the program crashed or hung on every run. Something inside push() cannot cope with two threads at once, and the small test hid it because the threads finished before they had a chance to collide."),
    D(`        shared queue
     [ 10 | 20 | 30 | ... ]
        ^             ^
        |             |
   producer T1   producer T2`),
    P("std::queue has a lot of code inside, which makes it hard to see what goes wrong. So let us shrink the problem to a single line that two threads run a million times each."),
    C(`int counter = 0;

void inc() {
    for (int i = 0; i < 1'000'000; ++i)
        ++counter;
}

std::thread t1(inc), t2(inc);
t1.join();
t2.join();
std::cout << counter;`),
    P("Two threads, a million increments each, so the answer should be 2,000,000. It is not, and the number changes every time you run it:"),
    O(`$ OPT=-O0 ./run.sh v2 tiny      (five runs)
race: 1556397
race: 1114575
race: 1363955
race: 1099554
race: 1074728`),
    H("What ++counter really does"),
    P("In C++ ++counter looks like one step. The processor does it in three: it reads the current value from memory into a register, adds one to the register, and writes the result back to memory. A register is a tiny piece of storage inside the core, and each core has its own."),
    P("Both threads start at the same moment and run on two different cores, so their three steps happen side by side. Nothing stops one thread from reading counter while the other has already read it but not yet written its new value back. Here is one unlucky moment, step by step."),
    D(`T1 (core 0)              T2 (core 1)
read counter -> 0
                         read counter -> 0
add 1        -> 1
write 1
                         add 1        -> 1
                         write 1

two increments happened, counter is 1`),
    P("T2 read the value before T1 wrote its result, so T2 also computed 1 and wrote 1 over it. One increment simply disappeared. Over a million loops this happens hundreds of thousands of times, which is why we got 1.1 to 1.5 million instead of 2 million."),
    P("Inside std::queue the same thing happens to its internal pointers, the ones that track where the data is stored. A lost update there does not just give a wrong number. It leaves the queue pointing at memory that is wrong or already freed, which is why the program crashed."),
    P("This kind of bug has a name: a data race. It happens when two threads access the same memory at the same time, at least one of them writes, and nothing makes them take turns. In C++ a data race is undefined behaviour, which means the language makes no promise at all about what your program will do."),
    H("What we actually need"),
    P("If one thread is in the middle of changing the queue, every other thread must wait until it is done. Only one thread at a time may be inside. This idea is called mutual exclusion, and the C++ tool for it is std::mutex. A mutex is like the key to a room: lock() takes the key, and if someone else already has it you wait at the door. unlock() gives the key back so the next thread can enter."),
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
    P("With the lock in place the earlier timeline cannot happen any more. T2 asks for the mutex while T1 holds it, so T2 waits until T1 has finished its whole read, add and write."),
    D(`T1                       T2
lock m
read 0, add, write 1
                         lock m  ... waits
unlock m
                         gets m: read 1, add,
                         write 2, unlock m`),
    P("The code between lock() and unlock() is called the critical section. The rule that makes this work is strict: every access to q must go through the same mutex, including functions that only read, like size() and empty(). If size() reads q while push() is halfway through changing it, size() can read a broken state. A mutex protects data, not one particular function."),
    H("Exercises"),
    Q("With one thread a push costs 44 ns. With four threads pushing at once, each push costs 141 ns. Why is it slower when we have more threads?",
      "Only one thread can hold the mutex at a time, so with four threads the other three are usually waiting for it. The work does not run in parallel any more, it runs one push at a time. On top of that, passing the mutex from one core to another takes time, because the cores have to agree on who owns it. That overhead is bigger than the push itself, so each push gets slower. We will come back to this cost in v5."),
    Q("m.lock(); foo(); m.unlock(); What happens if foo() throws an exception?",
      "When foo() throws, the exception leaves the function immediately and the next line, m.unlock(), never runs. The mutex stays locked. The next thread that calls m.lock() will wait forever for a key that nobody will give back, and every thread that touches the queue will freeze. This is exactly the problem v3 solves."),
    Q("Thread A calls q.size() while thread B calls q.push(100). Thread A only reads. Does it still need the lock?",
      "Yes. B is changing the queue's internal data while A is reading it, so A may read it halfway through the change and get a size that is garbage, or worse. A read at the same time as a write is still a data race. The rule is that every access needs the lock whenever any other thread might be writing, not just the writes themselves."),
  ],
},
{
  ver: "v3", title: "The lock that never unlocks",
  blocks: [
    H("A consumer that arrives too early"),
    P("In v2 our pop() throws an exception when the queue is empty, and it locks and unlocks the mutex by hand. That combination hides a serious bug."),
    C(`int pop() {
    m.lock();
    if (q.empty())
        throw std::runtime_error("empty");
    int v = q.front();
    q.pop();
    m.unlock();
    return v;
}`),
    P("Follow a consumer that calls pop() before the producer has pushed anything. It takes the lock and finds the queue empty, so it throws. When an exception is thrown, C++ leaves the function immediately and looks for a matching catch further up. Every line after the throw is skipped, and that includes m.unlock()."),
    D(`consumer                    producer
m.lock()
queue empty -> throw
leaves pop(), m still locked
                            push(42): m.lock()
                            ...waits forever`),
    P("Now the producer calls push(), which calls m.lock(). But the mutex is still held by a consumer that has already left. Nobody will ever unlock it, so the producer waits forever, and so does every other thread that touches the queue. One exception and one skipped line froze the whole program. You can see the mutex left locked:"),
    O(`$ OPT=-O0 ./run.sh v3 tiny_raii
try_lock after the exception: 0`),
    P("try_lock() tries to take the mutex without waiting and returns false, here printed as 0, when it is already taken."),
    H("We have solved this kind of problem before"),
    P("In v1 we had something that had to happen however a scope ended, joining threads, and we used a destructor. The reason it works is a rule of C++: when an exception passes through a function, the destructors of all its local objects still run. This process is called stack unwinding."),
    P("So we use the same trick for the mutex. We create a small object whose constructor locks the mutex and whose destructor unlocks it. The mutex is now tied to the lifetime of that object. The standard library already has this class: std::lock_guard."),
    D(`object lifetime ----------------------------->
constructor                        destructor
locks the mutex                    unlocks it
   |------- critical section --------|`),
    C(`int pop() {
    std::lock_guard<std::mutex> lock(m);
    if (q.empty())
        throw std::runtime_error("empty");
    int v = q.front();
    q.pop();
    return v;
}   // lock is destroyed here, m is unlocked`),
    P("Follow the same early consumer again. It locks through lock_guard, finds the queue empty and throws. As the exception leaves pop(), the local variable lock is destroyed, its destructor unlocks the mutex, and the producer can carry on. The same happens on a normal return, an early return, or anything else that ends the scope."),
    P("This idea is called RAII, short for Resource Acquisition Is Initialization. The name is awkward, but the idea is simple: acquire a resource in a constructor, release it in a destructor, and you can never forget to release it."),
    H("One trap to know"),
    P("If you write std::lock_guard<std::mutex>(m); without a variable name, you create a temporary object that is destroyed at the end of that same line. The mutex is locked and immediately unlocked again, and the code below it is not protected at all. The compiler will not warn you, so always give the guard a name."),
    H("Exercises"),
    Q("A function has four return statements and one throw. How many times do you need to call unlock() if you use lock_guard?",
      "None. The lock_guard is a local variable, and its destructor runs whenever the function ends, whichever of the five exits is taken. That is the whole point of RAII: the release is written once, in the destructor, instead of once before every exit. With manual unlock() you would need it in five places, and missing just one would freeze the program."),
    Q("std::lock_guard<std::mutex>(m); ++counter; Is counter protected?",
      "No. Because the guard has no name, it is a temporary object. A temporary lives only until the end of the statement it is created in, so the mutex is locked and then unlocked before ++counter runs. The increment happens without the lock, and the data race from v2 is back. Writing std::lock_guard<std::mutex> lock(m); keeps the guard alive until the end of the scope."),
    Q("At the end of a function you write a long message to a log file, which is slow. You do not want to hold the lock while doing it. What can you use?",
      "std::unique_lock. It locks in its constructor and unlocks in its destructor like lock_guard, but it also lets you call unlock() yourself earlier. You can unlock right after the last line that touches shared data and then write the log without blocking other threads. If you forget, the destructor still unlocks, so you keep the safety of RAII."),
  ],
},
{
  ver: "v3", title: "Every call is safe, the program is not",
  blocks: [
    H("Checking before taking"),
    P("To stop pop() from throwing, a consumer can first ask whether the queue is empty. Both empty() and pop() take the lock, so every single call is protected. It looks completely safe."),
    C(`if (!q.empty())       // locks, checks, unlocks
    x = q.pop();      // locks, pops, unlocks`),
    P("Put exactly one item in the queue and let two consumers run this code at the same time. It still fails. In a test with a stack, the same pattern hit an empty stack in 186 of 200 rounds:"),
    O(`$ OPT=-O0 ./run.sh v3 tiny_interface
top() hit an empty stack in 186 of 200 rounds`),
    P("Look at the gap between the two calls. Each call takes the lock and releases it again before returning. In between, the lock is free, and another thread can do anything it likes."),
    D(`queue: [ 42 ]

consumer A               consumer B
empty() -> false
                         empty() -> false
pop()   -> 42
                         pop() -> queue empty,
                                  throws`),
    P("Both consumers asked \"is it empty?\" and both got the honest answer, false, because at that moment it was not. Then A took the only item. When B called pop(), the answer it had received was already out of date. Each call was safe on its own. The combination of two calls was not."),
    P("This is a different kind of bug from v2. No memory was ever touched without the lock, so it is not a data race, and tools that look for data races, like ThreadSanitizer, report nothing. It is called a race condition: the result depends on the timing of the threads. The bug is in the design of the interface, because the interface forces the caller to check in one call and act in another."),
    H("Make the whole operation one call"),
    P("The fix is to stop splitting the check and the action. We offer one function that checks, reads and removes under a single lock, so no other thread can slip in between."),
    C(`bool try_pop(int& out) {
    std::lock_guard<std::mutex> lock(m);
    if (q.empty())
        return false;     // nothing to take
    out = q.front();
    q.pop();
    return true;
}`),
    P("try_pop() never throws. It returns false when there is nothing to take, and true when it put an item into out. Now replay the two consumers: A takes the lock, finds 42, removes it. B waits for the lock, then finds the queue empty and simply gets false."),
    P("We can keep empty(), but its meaning has changed. It tells you the queue was empty at some moment during the call. By the time your next line runs, that may no longer be true. It is fine for logging or statistics, but you must never make a decision based on it."),
    H("Exercises"),
    Q("A map offers two locked functions, contains() and insert(). Two threads both want to insert key 7 only if it is missing. Trace what can happen.",
      "Thread A calls contains(7) and gets false. Before A inserts, thread B also calls contains(7) and also gets false, because nothing has been inserted yet. Now both insert key 7. Depending on the map, the second insert overwrites the first value, or fails. Both threads believed they were the one adding the key. It is the same check-then-act gap we saw with empty() and pop()."),
    Q("How would you design the map's interface so this cannot happen?",
      "Give it one function that does the whole job under one lock, for example insert_if_absent(key, value). Inside it, the lock is taken, the key is checked, and if it is missing the value is inserted, all before the lock is released. No other thread can run between the check and the insert. The function can return true or false to say whether it inserted."),
    Q("Why does std::queue::pop() return void instead of returning the item it removes?",
      "If pop() removed the item and then returned it, the item would be copied into the caller's variable after it had already left the queue. If that copy throws an exception, for example because memory runs out, the item is gone: no longer in the queue and never stored anywhere. Splitting it into front() and pop() lets you copy first and remove second, so a failed copy loses nothing."),
  ],
},
{
  ver: "v4", title: "Waiting without burning a core",
  blocks: [
    H("The consumer is wasting a CPU"),
    P("With try_pop() a consumer that finds the queue empty has nothing to do, so it tries again, and again."),
    C(`int x;
while (!q.try_pop(x)) {
    // nothing there, try again
}`),
    P("If the queue stays empty for one second, this loop runs about twelve million times:"),
    O(`$ OPT=-O0 ./run.sh v3 next_bug
checked an empty queue 12301046 times in 1 s`),
    P("Twelve million times a second the consumer asks whether an empty queue is still empty. None of that is useful work, and it keeps one core busy at 100% doing nothing. What we really want is for the consumer to go to sleep while the queue is empty, using no CPU at all, and to be woken up as soon as a producer adds something."),
    H("First attempt: unlock and nap"),
    P("A simple idea is to sleep for a while when the queue is empty, and look again afterwards. We must unlock first, otherwise the producer could never get in to push."),
    C(`if (q.empty()) {
    m.unlock();
    sleep(1);
    m.lock();
}
int value = q.front();`),
    P("This uses no CPU, but put it on a clock. At t = 0 the consumer finds the queue empty and goes to sleep for a second. At t = 1 ms the producer pushes an item. That item then sits in the queue for the next 999 ms while the consumer sleeps."),
    D(`time   0      1 ms                      1 s
cons   empty, unlock, sleep ............| wakes, pops 42
prod          lock, push 42, unlock
              item waits 999 ms`),
    P("Make the nap shorter and the consumer wakes up more often, which is back to burning CPU. Make it longer and items wait longer. There is no good number, because we are guessing when the item will arrive."),
    H("Second attempt: wait for a signal"),
    P("So instead of guessing, let the producer tell the consumer. After pushing, the producer sends a signal, and the consumer sleeps until it receives one. Now look carefully at the gap between unlocking and starting to wait."),
    D(`consumer                  producer
"queue is empty"
unlock
     <- scheduling gap ->
                          push item
                          signal  (nobody is
                                   waiting yet)
start waiting
sleeps forever, item still in the queue`),
    P("Between the consumer's unlock and the moment it starts listening there is a tiny gap. If the producer pushes and signals exactly inside that gap, the signal arrives when nobody is listening and is lost. The consumer then waits for a signal that already came and went, and it sleeps forever with an item sitting in the queue."),
    P("This is called the lost wake-up problem, and it is the real reason condition variables exist. The problem is not the sleeping itself. It is the gap between releasing the mutex and going to sleep."),
    H("What std::condition_variable gives us"),
    P("We need one operation that releases the mutex and starts waiting as a single step, so there is no gap a producer could fall into. That is exactly what cv.wait() does. Follow the mutex through the whole sequence."),
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
    P("Before wait() the consumer owns the mutex. While it sleeps, nobody owns it, which is why the producer can come in and push. When wait() returns, the consumer owns the mutex again, so it can safely look at the queue. Because releasing and sleeping happen together, the producer's notify either finds the consumer already asleep, or happens before the consumer checked the queue, in which case the consumer sees the item and does not sleep at all."),
    H("Always check again after waking"),
    P("When the consumer wakes up, it cannot simply assume the item is there. Another consumer may have woken first and taken it. Threads can also occasionally wake up without any notify at all, which is called a spurious wake-up. So the right mental model is a loop, not an if."),
    C(`// wrong:  if (q.empty())    wait
// right:  while (q.empty()) wait

cv.wait(lock, [&] { return !q.empty(); });
// does the while loop for you`),
    P("The second argument to wait() is called a predicate: a small function that says whether we can continue. wait() checks it before sleeping and again after every wake-up, and only returns when it is true. Here is the queue with both pieces in place."),
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
    int v = q.front();
    q.pop();
    return v;
}`),
    P("wait_and_pop() uses std::unique_lock instead of lock_guard. wait() has to unlock the mutex while it sleeps and lock it again before returning, and a lock_guard cannot be unlocked. unique_lock can. Our queue has grown step by step:"),
    D(`v0  std::queue
v2  std::queue + std::mutex           safe access
v4  std::queue + std::mutex
             + std::condition_variable
                                      efficient waiting`),
    H("Exercises"),
    Q("With wait_and_pop(), how much CPU does a consumer use while the queue stays empty for a minute?",
      "Almost none. Inside cv.wait() the thread is asleep, and the operating system does not give a sleeping thread any time on a core. It only becomes runnable again when a producer calls notify, or on a rare spurious wake-up, after which it checks the predicate, finds the queue still empty, and goes back to sleep. Compare that to 12 million checks a second with the spinning loop."),
    Q("Remove the predicate and call plain cv.wait(lock). The producer pushes and calls notify_one() before the consumer reaches wait(). What happens?",
      "The notify happens while no thread is waiting, so it has no effect: condition variables do not remember past notifications. The consumer then calls wait() and goes to sleep, even though an item is already in the queue. Nobody will notify again, so it sleeps forever. With the predicate, wait() first checks !q.empty(), sees the item, and returns without sleeping."),
    Q("After one push, should the producer call notify_one() or notify_all()?",
      "notify_one(). One push adds one item, and one item can only be taken by one consumer. If you woke all of them, every consumer would wake up, take the lock one after another, check the queue, and all but one would find it empty and go back to sleep. That is wasted work. notify_all() is for news that every waiter needs to hear, like the shutdown we build in v6."),
  ],
},
];
