// Part 1 lessons continued (v5 to v7).
const { H, P, C, D, O, Q } = require("./blocks.js");

module.exports = [
{
  ver: "v5", title: "Does it hold up under load?",
  blocks: [
    H("One correct run proves very little"),
    P("One producer and one consumer work. Real systems have several of each, millions of items, and producers or consumers that are sometimes slow. Concurrency bugs depend on timing, so a single run that prints the right number tells you almost nothing."),
    D(`P1 -+                 +-> C1
P2 -+    +--------+   +-> C2
P3 -+--> | queue  | --+-> C3
P4 -+    +--------+   +-> C4`),
    P("Remember that 1,000 items per producer hid the crash in v1. Each thread finished before the next one had even started, so they never overlapped. Race tests need enough work to make threads collide: use 100,000 items per thread."),
    H("The test matrix"),
    P("We run every combination we can think of: 1x1, 4x1, 1x4 and 4x4 threads, tiny and huge item counts, slow producers and slow consumers. Each run checks three things."),
    D(`count  every item arrived           (nothing lost)
sum    the values add up correctly   (a loss and a
                                      duplicate can't
                                      cancel out)
time   no hang, idle threads near 0% CPU`),
    P("The count alone is not enough. If one item is lost and another is delivered twice, the count is still right. With distinct values the sum catches it."),
    H("What the matrix shows: contention"),
    P("The tests pass, but they also show a cost. Four threads add a million numbers each to one shared total, first locking for every item and then locking once at the end."),
    C(`// A: lock for every item
for (int i = 0; i < N; ++i) {
    std::lock_guard<std::mutex> l(m);
    total += i;
}

// B: add locally, lock once
long long local = 0;
for (int i = 0; i < N; ++i) local += i;
std::lock_guard<std::mutex> l(m);
total += local;`),
    O(`$ ./tiny_contention
A lock per item: 413 ms
B lock once:     3 ms`),
    P("Both versions give the same answer, and B is over a hundred times faster. In A the threads spend almost all their time queuing for the mutex, and passing a lock between cores costs far more than one addition. This is contention. The cure is to share less: do the work locally and touch shared state as rarely as possible."),
    D(`T1  ## lock ## ......... ## lock ##
T2  ... waiting ... ## lock ## ......
T3  ....... waiting ....... ## lock ##`),
    P("The queue gets the same treatment. push_all() takes the lock once for a whole batch instead of once per item, which made batches about four times faster than single pushes in the tests."),
    C(`void push_all(const std::vector<int>& xs) {
    {
        std::lock_guard<std::mutex> lock(m);
        for (int x : xs) push_locked(x);
    }
    cv.notify_all();
}`),
    H("Exercises"),
    Q("Four producers push the values 0 to 99,999 each. What sum must the consumers see?", "4 x (99,999 x 100,000 / 2) = 19,999,800,000."),
    Q("Item 5 is lost and item 7 is delivered twice. Does the count catch it? The sum?", "The count does not, it is unchanged. The sum is off by 2, so it does."),
    Q("Producers send bursts of 1,000 items. How do you cut the locking cost?", "Push each burst with push_all, which locks once and notifies once."),
  ],
},
{
  ver: "v5", title: "Two queues, two locks, frozen",
  blocks: [
    H("Rebalancing work"),
    P("With many consumers one queue can pile up while another runs dry, so we add move_all_to(other), which moves every item from one queue to another. It has to hold both queues' locks at once."),
    C(`void move_all_to(Queue& other) {
    std::lock_guard<std::mutex> a(m);
    std::lock_guard<std::mutex> b(other.m);
    while (!q.empty()) {
        other.q.push(q.front());
        q.pop();
    }
}`),
    P("Now thread 1 calls q1.move_all_to(q2) while thread 2 calls q2.move_all_to(q1). Each locks its own queue first and then the other one."),
    D(`T1: q1.move_all_to(q2)        T2: q2.move_all_to(q1)
lock q1.m
                              lock q2.m
want q2.m ... waits
                              want q1.m ... waits
both wait forever`),
    O(`$ ./tiny_deadlock
(frozen, stopped after 10 s)`),
    P("In the tests this froze three runs out of three. In production, with less helpful timing, it might freeze once a week, which is much worse."),
    H("Draw who waits for whom"),
    D(`T1 holds q1.m  --waits for-->  q2.m
     ^                            |
     |                            v
   q1.m  <--waits for--  T2 holds q2.m`),
    P("Each thread holds something the other needs, and the arrows form a cycle. A cycle in this wait-for graph is a deadlock. Break the cycle and the deadlock cannot happen. There are two standard ways."),
    P("The first is to take both locks together. std::scoped_lock locks several mutexes using an algorithm that never deadlocks. The second is to always take locks in one fixed global order, for example lower address first. Either way, check for this == &other first, because locking the same mutex twice is undefined behaviour."),
    C(`void move_all_to(Queue& other) {
    if (this == &other) return;
    std::scoped_lock lock(m, other.m);
    while (!q.empty()) {
        other.q.push(q.front());
        q.pop();
    }
}`),
    H("Locking yourself out"),
    P("There is a second way to deadlock with only one mutex. If push_all() takes the lock and then calls the public push(), push() tries to take the same lock again and the thread waits for itself. The clean fix is a convention: public functions take the lock, and private helpers like push_locked() assume the caller already holds it. Reaching for std::recursive_mutex usually means the lock boundaries do not match the operations."),
    H("Exercises"),
    Q("Three threads each lock two of three mutexes, always lowest address first. Can they deadlock?", "No. With one global order the wait-for graph can never form a cycle."),
    Q("push_all() locks m and then calls push(), which also locks m. Trace it.", "The thread blocks waiting for a lock it already holds. With std::mutex that is undefined behaviour and in practice a hang."),
    Q("Design transfer(a, b, amount) between two bank accounts.", "Return early if a and b are the same account, then std::scoped_lock(a.m, b.m) and move the amount."),
  ],
},
{
  ver: "v6", title: "The producers are done, the program never exits",
  blocks: [
    H("Consumers that never stop"),
    P("Until now consumers knew exactly how many items to expect. Real consumers do not. They loop on wait_and_pop() until there is no more work. The trouble is that nothing ever tells them there is no more work."),
    D(`producers   push ... push ... return
consumers   pop ... pop ... wait_and_pop()  asleep
main        join consumers ... waiting forever`),
    P("The queue needs a way to say \"nothing more is coming\", and every sleeping consumer has to hear it."),
    H("A first try"),
    C(`void shutdown() {
    std::lock_guard<std::mutex> lock(m);
    closed = true;
    cv.notify_one();
}`),
    P("Two consumers are asleep in wait(). Think about how many of them will wake up and leave."),
    O(`$ ./tiny
woke up
(frozen, stopped after 10 s)`),
    P("Only one. notify_one wakes a single waiter, which sees closed and returns. The other keeps sleeping, and main waits for it forever in join(). Changing that one word to notify_all fixes it."),
    H("Shutdown is a protocol"),
    D(`RUNNING   push works, pop waits for items
   | shutdown()
CLOSED    push refused, every waiter woken
   | remaining items are consumed
DRAINED   wait_and_pop() returns "nothing"
   |
consumers return, threads are joined`),
    P("Three rules make it work. Set closed while holding the lock, otherwise the change can fall into the same gap as v4's lost wake-up. Wake every waiter with notify_all. And let each consumer see the new state through its predicate."),
    P("One more problem: how does wait_and_pop() say \"nothing\"? No int value can mean that, because every int could be a real item. So it returns std::optional<int>, which is either a value or empty."),
    C(`bool closed = false;   // guarded by m

std::optional<int> wait_and_pop() {
    std::unique_lock<std::mutex> lock(m);
    cv.wait(lock, [&] {
        return !q.empty() || closed;
    });
    if (q.empty())
        return std::nullopt;   // closed and drained
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
    P("Items already in the queue are still delivered, because wait_and_pop() only returns nothing when the queue is closed and empty. push() checks closed and returns false after shutdown."),
    H("Exercises"),
    Q("1,000 items are queued and then shutdown() is called. How many do consumers still receive?", "All 1,000. nullopt only comes once the queue is closed and empty."),
    Q("closed = true is set without holding the lock. Trace a lost wake-up.", "A consumer checks and sees closed is false, main sets closed and notifies, then the consumer starts waiting and never wakes."),
    Q("In a bounded queue producers wait while it is full. What else must shutdown() do?", "Wake the waiting producers too and make push() return false, or they sleep forever."),
  ],
},
{
  ver: "v7", title: "A queue of anything",
  blocks: [
    H("Why int is no longer enough"),
    P("In Part 2 the queue will carry work, not numbers. Some values are large, and some cannot be copied at all. A std::unique_ptr owns its object, so copying it would mean two owners, and the language forbids it."),
    O(`$ g++ -DSHOW_BUG next_bug.cpp     (v6)
error: cannot convert 'unique_ptr<int>' to 'int'`),
    P("So the queue becomes a template, and it has to move values in and out instead of copying them."),
    H("A trap in returning a value"),
    C(`T pop() {
    T v = std::move(q.front());
    q.pop();          // item is removed here
    return v;
}

x = queue.pop();      // suppose this assignment throws`),
    P("If the caller's assignment throws, the item has already been removed from the queue and was never stored anywhere. It is simply gone. This is the reason std::queue::pop() returns void. Our wait_and_pop() avoids the problem by returning std::optional<T> built by moving, and moving standard types does not throw."),
    H("The generic queue"),
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
    }
};`),
    P("push() takes its argument by value and moves it in, so it works for copyable types and move-only types alike. Values are moved out on the way back. The queue itself cannot be copied, because a mutex and a condition variable cannot be copied, and copying a queue that other threads are using would make no sense anyway."),
    P("This is the end of Part 1. Before going on, run every earlier test against ThreadSafeQueue<int>, and also try it with std::string and std::unique_ptr<int>."),
    H("Exercises"),
    Q("Pushing a 1 MB std::string by copy and by move. How many bytes are copied each time?", "By copy, the whole megabyte. By move, a few pointers."),
    Q("ThreadSafeQueue<std::unique_ptr<int>> q; q.push(p); Does it compile?", "No, p is an lvalue and cannot be copied. q.push(std::move(p)) compiles."),
    Q("List every rule your queue now follows.", "Lock every access, use RAII guards, make check-and-act one call, wait with a predicate, notify after changing state, shut down with closed and notify_all, move values."),
  ],
},
];
