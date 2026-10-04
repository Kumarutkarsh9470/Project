// Part 1 lessons continued (v5 to v7).
const { H, P, C, D, O, Q, A, J } = require("./blocks.js");

module.exports = [
{
  ver: "v5", title: "Does it hold up under load?",
  blocks: [
    H("One correct run proves very little"),
    P("Our queue now works with one producer and one consumer. A real program has several of each, moves millions of items, and has producers or consumers that are sometimes slow. Remember what happened in v1: with 1,000 items per producer the broken queue printed the right answer, because each thread finished before the next one had even started. The threads never overlapped, so the bug never had a chance to show."),
    P("This is the uncomfortable truth about concurrent code. Whether a bug appears depends on the exact timing of the threads, and that timing changes every run. A program can pass a hundred times and fail on the hundred and first. So before we build anything more on this queue, we need tests that are hard for a bug to hide from."),
    A("It passed the test. Isn't that enough?"),
    D(`P1 -+                 +-> C1
P2 -+    +--------+   +-> C2
P3 -+--> | queue  | --+-> C3
P4 -+    +--------+   +-> C4`),
    H("The test matrix"),
    P("We run the queue in every shape we can think of: 1 producer and 1 consumer, 4 and 1, 1 and 4, 4 and 4. We use tiny item counts and huge ones, about 100,000 per thread, because threads only collide when they run long enough to overlap. We also make producers slow in one run and consumers slow in another, so that the queue spends time both empty and full. Every run checks three things."),
    D(`count  every item arrived      (nothing lost)
sum    the values add up        (a loss and a
                                 duplicate can't
                                 hide each other)
time   no hang, and idle threads use ~0% CPU`),
    A("Why check the sum? Isn't the count enough?"),
    P("Why the sum as well as the count? Imagine item 5 is lost and item 7 is delivered twice. The count is still correct, because one missing plus one extra makes the same total. But if every producer pushes different numbers, the sum is now off by 2, and the test catches it."),
    H("What the matrix shows: contention"),
    P("The tests pass. But when we time them, we notice that adding threads can make things slower. To see why, look at a simpler program. Four threads each add a million numbers to one shared total. Version A takes the lock for every single number. Version B adds into a local variable first and takes the lock only once at the end."),
    C(`// A: lock for every item
for (int i = 0; i < N; ++i) {
    std::lock_guard<std::mutex> l(m);
    total += i;
}

// B: add locally, lock once
long long local = 0;
for (int i = 0; i < N; ++i)
    local += i;
std::lock_guard<std::mutex> l(m);
total += local;`),
    A("Both are correct. Which one would you guess is faster, and by how much?"),
    P("Both give the same correct answer, but B is more than a hundred times faster:"),
    O(`$ ./run.sh v5 tiny_contention
A lock per item: 413 ms
B lock once:     3 ms`),
    A("The work is identical. Where did 410 ms go?"),
    P("In version A the four threads spend almost all their time waiting for each other. Only one can hold the mutex, so the other three queue up behind it. And every time the mutex moves from one core to another, the cores have to coordinate, which costs far more than a single addition."),
    D(`T1  ## lock ## ......... ## lock ##
T2  ... waiting ... ## lock ## ......
T3  ....... waiting ....... ## lock ##`),
    P("Threads queuing up for the same lock is called contention. The cure is to share less: do as much work as possible in local variables that only one thread touches, and touch shared data rarely. Version B touches the shared total once per thread instead of a million times."),
    P("Our queue gets the same treatment. A producer that has a batch of items can push them all under one lock instead of locking once per item. In the tests this made batches about four times faster than single pushes."),
    C(`void push_all(const std::vector<int>& xs) {
    {
        std::lock_guard<std::mutex> lock(m);
        for (int x : xs)
            push_locked(x);   // no locking inside
    }
    cv.notify_all();   // several items: wake all
}`),
    J("Every test of our pool later uses this matrix: many submitters, many workers, count and sum. And the lesson about contention is why Part 3 exists."),
    H("Exercises"),
    Q("Four producers each push the values 0 to 99,999. What sum must the consumers see in total?",
      "One producer pushes 0 + 1 + ... + 99,999. The sum of the numbers from 0 to n - 1 is n x (n - 1) / 2, so that is 100,000 x 99,999 / 2 = 4,999,950,000. Four producers push the same values, so the consumers must see 4 x 4,999,950,000 = 19,999,800,000. If they see anything else, an item was lost or duplicated."),
    Q("Item 5 is lost and item 7 is delivered twice. Does the count catch it? Does the sum?",
      "The count does not. One item is missing and one is extra, so the number of items received is exactly what we expected. The sum does: we lost 5 and gained an extra 7, so the total is 2 too high. This is why the tests check both. Each check catches mistakes the other one can miss."),
    Q("Producers receive items in bursts of 1,000. How can you reduce the time spent locking?",
      "Push each burst with push_all() instead of 1,000 separate push() calls. push_all() takes the lock once for the whole burst, so the threads queue for the mutex 1,000 times less often, and it notifies once at the end instead of after every item. The work inside the lock is the same, but all the waiting and handing over of the lock disappears."),
  ],
},
{
  ver: "v5", title: "Two queues, two locks, frozen",
  blocks: [
    H("Rebalancing work"),
    P("With several consumers, it happens that one queue piles up with work while another one runs dry. So we add a function that moves every item from one queue into another. To do that safely it must hold both queues' mutexes at the same time: its own, so nobody changes it while we empty it, and the other one, so nobody changes it while we fill it."),
    C(`void move_all_to(Queue& other) {
    std::lock_guard<std::mutex> a(m);
    std::lock_guard<std::mutex> b(other.m);
    while (!q.empty()) {
        other.q.push(q.front());
        q.pop();
    }
}`),
    P("This works fine on its own. Now let two threads use it in opposite directions at the same time: thread 1 calls q1.move_all_to(q2), and thread 2 calls q2.move_all_to(q1). Both threads start at the same moment. Within the first microsecond, each one takes the first lock it asks for."),
    D(`T1: q1.move_all_to(q2)  T2: q2.move_all_to(q1)
lock q1.m  (got it)
                        lock q2.m  (got it)
lock q2.m ... waits
                        lock q1.m ... waits
both wait forever`),
    A("Nothing is spinning and nothing crashed. Why does it stop?"),
    P("T1 holds q1's mutex and waits for q2's. T2 holds q2's mutex and waits for q1's. Neither can continue until the other gives up its lock, and neither will ever give it up, because each is stuck waiting. The program simply stops, using no CPU and printing nothing:"),
    O(`$ OPT=-O0 ./run.sh v5 tiny_deadlock
(frozen, stopped after 10 s)`),
    P("In our tests this froze three runs out of three. In a real program, with less unlucky timing, it might happen once a week, which is much worse, because it is almost impossible to reproduce when you try to debug it."),
    H("Draw who waits for whom"),
    P("A useful way to see this is a wait-for graph. Draw an arrow from each thread to the lock it is waiting for, and from each lock to the thread that holds it."),
    D(`T1 holds q1.m  --waits for-->  q2.m
     ^                            |
     |                            v
   q1.m  <--waits for--  T2 holds q2.m`),
    A("Couldn't a thread just give up its lock if it can't get the second one?"),
    P("That is close to the real answer, but doing it by hand is easy to get wrong: two threads can keep grabbing and releasing in step forever. First see the shape of the problem."),
    P("Follow the arrows and you come back to where you started. A cycle in this graph is exactly what a deadlock is. If we can make sure the cycle can never form, the deadlock cannot happen. There are two standard ways to do it."),
    P("The first is to take both locks together in one step. std::scoped_lock accepts several mutexes and locks all of them using an algorithm that never deadlocks: if it cannot get all of them, it lets go and tries again. The second way is to agree on one fixed order, for example always lock the queue with the lower memory address first. If every thread uses the same order, nobody can hold the second lock while waiting for the first."),
    P("There is one more detail. If someone calls q.move_all_to(q), both mutexes are the same mutex, and locking the same std::mutex twice is undefined behaviour. So we check for that first."),
    C(`void move_all_to(Queue& other) {
    if (this == &other)
        return;                         // same queue
    std::scoped_lock lock(m, other.m);  // both at once
    while (!q.empty()) {
        other.q.push(q.front());
        q.pop();
    }
}`),
    H("Locking yourself out"),
    P("You can even deadlock with a single mutex. Suppose push_all() takes the lock and then calls our public push() for each item. push() also takes the lock. The thread now waits for a mutex that it is holding itself, and it will wait forever."),
    P("The clean fix is a simple rule. Public functions take the lock. Private helper functions, like push_locked(), assume the caller already holds it and never lock themselves. Then public functions call helpers, never other public functions. std::recursive_mutex would allow the same thread to lock twice, but needing it usually means the code is organised badly, so we avoid it."),
    J("Any time our code must hold two locks at once, for example moving work between two workers' queues, it uses std::scoped_lock, and public functions never call each other while holding a lock."),
    H("Exercises"),
    Q("Three threads each lock two of three mutexes, but always the one with the lowest address first. Can they deadlock?",
      "No. A deadlock needs a cycle: someone has to hold a lock with a higher address while waiting for one with a lower address, or the arrows can never come back around. With everyone locking in increasing address order, a thread only ever waits for a lock that is higher than everything it already holds. The arrows always point upward, so they can never form a loop."),
    Q("push_all() locks m and then calls push(), which also locks m. Trace what happens.",
      "push_all() calls m.lock() and gets it. Then it calls push(), which calls m.lock() again. The mutex is already taken, so the thread waits for whoever holds it to unlock. But the holder is the same thread, which is now stuck waiting and can never reach the unlock. With std::mutex this is undefined behaviour, and in practice the thread hangs forever, and so does every other thread that needs the queue."),
    Q("Design a function transfer(a, b, amount) that moves money from one bank account to another, where each account has its own mutex.",
      "First check whether a and b are the same account, and if so return, because locking one mutex twice is undefined behaviour. Then take both mutexes together with std::scoped_lock lock(a.m, b.m), which can never deadlock even if another thread is transferring from b to a at the same time. While holding both, subtract the amount from a and add it to b, so no other thread ever sees the money in neither account or in both."),
  ],
},
{
  ver: "v6", title: "The producers are done, the program never exits",
  blocks: [
    H("Consumers that never stop"),
    P("Until now our consumers knew in advance exactly how many items to expect, so they could stop after the last one. Real consumers do not know that. A server does not know how many requests will come in. So consumers simply loop on wait_and_pop() for as long as there is work. The trouble is that nothing ever tells them there will be no more work."),
    D(`producers  push ... push ... return
consumers  pop ... pop ... wait_and_pop()  asleep
main       join consumers ... waiting forever`),
    P("When the producers finish, the consumers take the last items and go back to sleep inside wait(), waiting for items that will never come. main then tries to join them, and waits for threads that will never finish. The program never exits."),
    P("The queue needs a way to say \"nothing more is coming\", and every consumer that is asleep has to hear it."),
    A("Why not push a special value, like -1, to mean \"stop\"?"),
    P("That is the first idea most people have. It has two problems. -1 might be a real item one day. And one -1 stops only one consumer: with four consumers you need exactly four, and if a producer is still pushing you might stop a consumer while real work remains. We want the queue itself to know it is closed."),
    H("A first try"),
    P("We add a flag called closed and a shutdown() function that sets it and wakes a consumer, and we make wait_and_pop() return when it sees the flag."),
    C(`void shutdown() {
    std::lock_guard<std::mutex> lock(m);
    closed = true;
    cv.notify_one();
}`),
    P("Two consumers are asleep in wait() when main calls shutdown(). Only one of them leaves, and the program still hangs:"),
    O(`$ OPT=-O0 ./run.sh v6 tiny
woke up
(frozen, stopped after 10 s)`),
    P("Follow it on the clock. Both consumers have been asleep since before t = 1 s. At t = 1 s main calls shutdown(). notify_one() wakes exactly one waiting thread, here C1. C1 sees closed and returns. C2 never received a notification, so it never wakes up to look at the flag, and it sleeps forever. main joins C1 without trouble and then waits on C2 for good."),
    D(`time   0          1 s: shutdown()
C1     asleep ... woken, sees closed, returns
C2     asleep ............................ forever
main   ...        notify_one(), join C1 ok,
                  join C2 waits forever`),
    A("We set the flag and sent a notify. Why didn't C2 see the flag?"),
    P("A sleeping thread does not look at anything. It only checks its predicate when it is woken. C2 was never woken, so it never checked. Changing one word fixes it. notify_all() wakes every waiting thread, and each of them checks the flag for itself."),
    H("Shutdown is a protocol"),
    P("It helps to think of the queue as moving through a few states, one after another."),
    D(`RUNNING   push works, pop waits for items
   | shutdown()
CLOSED    push refused, every waiter woken
   | remaining items are consumed
DRAINED   wait_and_pop() returns "nothing"
   |
consumers return, threads are joined`),
    P("Three rules make it work. First, set closed while holding the mutex. If you set it without the lock, a consumer can check the flag, see false, and then the flag changes and the notify arrives before the consumer is asleep: exactly the lost wake-up from v4. Second, wake everyone with notify_all(). Third, let each consumer see the new state through its wait predicate."),
    H("How do you return \"nothing\"?"),
    A("What should wait_and_pop() return once the queue is closed and empty?"),
    P("There is one more problem. wait_and_pop() returns an int. When the queue is closed and empty, what should it return? Not 0, and not -1, because those could be real items. No int value can mean \"there is nothing\". So we change the return type to std::optional<int>, which holds either an int or nothing at all, written std::nullopt."),
    C(`bool closed = false;   // guarded by m

std::optional<int> wait_and_pop() {
    std::unique_lock<std::mutex> lock(m);
    cv.wait(lock, [&] {
        return !q.empty() || closed;
    });
    if (q.empty())
        return std::nullopt;  // closed and empty
    int v = q.front();
    q.pop();
    return v;
}

void shutdown() {
    {
        std::lock_guard<std::mutex> lock(m);
        closed = true;
    }
    cv.notify_all();
}`),
    P("The predicate now wakes up when there is an item or when the queue is closed. If there are still items, wait_and_pop() returns them as usual, even after shutdown, so no work is lost. Only when the queue is closed and empty does it return nullopt. A consumer can then simply write while (auto x = q.wait_and_pop()) { ... } and the loop ends by itself. push() also checks closed and returns false after shutdown, so producers know their item was not accepted."),
    J("Destroying our thread pool calls shutdown() on its task queue. That is how every worker learns to finish the remaining tasks and leave, so the pool can join them."),
    H("Exercises"),
    Q("1,000 items are still in the queue when shutdown() is called. How many do the consumers receive?",
      "All 1,000. shutdown() only sets the flag and wakes everyone. A woken consumer checks the queue, finds items, and wait_and_pop() returns one, exactly as before. Only once the queue is both closed and empty does wait_and_pop() return nullopt. So the consumers drain everything first, and then each of them gets nullopt and leaves its loop."),
    Q("closed = true is set without holding the lock. Trace how a consumer can end up asleep forever.",
      "The consumer holds the lock, checks its predicate and sees the queue empty and closed false. Before it actually goes to sleep, main sets closed = true without the lock and calls notify_all(). Nobody is asleep yet, so the notification does nothing. Then the consumer finishes going to sleep. It already decided the flag was false and nobody will notify again, so it sleeps forever. Setting the flag under the lock stops main from slipping into that gap."),
    Q("In a bounded queue, producers wait while the queue is full. What else must shutdown() do?",
      "It must also wake the producers that are asleep waiting for space, usually with notify_all() on the condition variable they wait on. Their wait predicate should also include closed, and when they wake and see it, push() should return false instead of waiting for space that will never be needed. Otherwise those producers sleep forever and the program hangs on joining them."),
  ],
},
{
  ver: "v7", title: "A queue of anything",
  blocks: [
    H("Why int is no longer enough"),
    P("In Part 2 we will put work into the queue: functions to run, not numbers. Later we will store objects that are large, and even objects that cannot be copied at all. std::unique_ptr is the classic example. It is the only owner of the object it points to, so copying it would create two owners, and the language forbids it."),
    P("Our queue only holds int, so it cannot hold any of these. If we try to push a unique_ptr into it, the compiler refuses:"),
    O(`$ cd master/v6
$ g++ -std=c++20 -DSHOW_BUG next_bug.cpp
error: cannot convert 'unique_ptr<int>' to 'int'`),
    P("So the queue has to become a template, ThreadSafeQueue<T>, that works for any type T. And because some types cannot be copied, it has to move values in and out instead of copying them. Moving means handing over the contents of an object to a new one, leaving the old one empty. For a unique_ptr it transfers ownership. For a string it transfers the buffer, without copying a single character."),
    A("Can't we just change int to T and be done?"),
    P("Almost. Two details decide whether it really works for every type: how values get in and out, and what happens if something throws on the way out."),
    H("A trap in returning a value"),
    P("There is a subtle problem with a pop() that returns the item. Look at what happens in this order."),
    C(`T pop() {
    T v = std::move(q.front());
    q.pop();          // the item leaves the queue
    return v;
}

x = queue.pop();      // what if this throws?`),
    P("pop() removes the item from the queue and then hands it back. The caller then assigns it to x. If that assignment throws an exception, for example because x needs to allocate memory and there is none, the item is lost: it has already left the queue, and it never arrived in x. Nobody has it any more."),
    P("This is the real reason std::queue::pop() returns void. Our wait_and_pop() avoids the problem a different way: it returns std::optional<T> constructed by moving, and moving standard library types does not throw, so nothing can go wrong between the queue and the caller."),
    H("The generic queue"),
    P("Here is the queue after Part 1, now for any type T. Everything we built so far is still here: the mutex, the condition variable, the closed flag. What changed is the type and the moves."),
    C(`template <class T>
class ThreadSafeQueue {
    std::queue<T> q;               // guarded by m
    mutable std::mutex m;
    std::condition_variable cv;
    bool closed = false;
public:
    bool push(T v) {
        {
            std::lock_guard<std::mutex> l(m);
            if (closed) return false;
            q.push(std::move(v));
        }
        cv.notify_one();
        return true;
    }
    // wait_and_pop() comes next
};`),
    C(`// inside ThreadSafeQueue<T>
std::optional<T> wait_and_pop() {
    std::unique_lock<std::mutex> l(m);
    cv.wait(l, [&] {
        return !q.empty() || closed;
    });
    if (q.empty()) return std::nullopt;
    T v = std::move(q.front());
    q.pop();
    return v;
}`),
    P("push() takes its argument by value. If the caller passes a copyable value, it is copied once into v. If the caller passes something with std::move, it is moved into v. Either way, push() then moves v into the queue. This one function works for both kinds of types. On the way out, the item is moved from the front of the queue, never copied."),
    P("The queue itself cannot be copied. A mutex and a condition variable cannot be copied, and it would make no sense anyway: copying a queue while other threads are pushing and popping from it would give you a snapshot of something that is changing."),
    P("This is the end of Part 1. Before moving on, run all the earlier tests against ThreadSafeQueue<int>, and also try ThreadSafeQueue<std::string> and ThreadSafeQueue<std::unique_ptr<int>>. Part 2 builds a thread pool on top of this queue, so any bug left here would come back later in a much more confusing form."),
    J("In Part 2 this exact class, ThreadSafeQueue<Task>, becomes the channel that carries work from whoever submits it to the pool's workers."),
    H("Exercises"),
    Q("You push a 1 MB std::string once by copy and once by move. How much data is copied each time?",
      "By copy, the whole megabyte: a new buffer is allocated and every character is copied into it. By move, only a few pointers and a size, a couple of dozen bytes: the new string takes over the old string's buffer, and the old string is left empty. For large objects moving is dramatically cheaper, and for objects like unique_ptr it is the only option."),
    Q("ThreadSafeQueue<std::unique_ptr<int>> q; auto p = std::make_unique<int>(5); q.push(p); Does this compile?",
      "No. push() takes its argument by value, so the compiler has to create a copy of p for the parameter, and unique_ptr cannot be copied. You have to write q.push(std::move(p)). That moves the pointer into the parameter, leaving p empty, which is exactly what should happen: the queue now owns the integer, and p no longer does."),
    Q("List the rules your queue now follows, and the version that taught each one.",
      "Every access to the data takes the mutex (v2). Locks are always released by a destructor, never by hand (v3). A check and the action that depends on it happen in one call, under one lock (v3). Consumers wait with a condition variable and a predicate instead of spinning (v4). Several locks are taken together or in a fixed order (v5). Shutdown sets a flag under the lock and wakes everyone (v6). Values are moved, never copied, so any type works (v7)."),
  ],
},
];
