// Part 3 lessons (v11 to v14).
const { H, P, C, D, O, Q } = require("./blocks.js");

module.exports = [
{
  ver: "v11", title: "Counting without a lock",
  blocks: [
    H("A dashboard that slows the workers"),
    P("We want a monitoring thread to show how many tasks were submitted and how many completed, refreshed every 100 ms. If the two counters sit behind a mutex, every worker that finishes a task has to take that mutex, and so does the dashboard. Is a lock really the only way to make ++ safe?"),
    C(`int plain = 0;                  // A: no lock
int locked = 0; std::mutex m;   // B: mutex
std::atomic<int> counter{0};    // C: atomic

// two threads, 1,000,000 times each
++plain;
{ std::lock_guard<std::mutex> l(m); ++locked; }
counter.fetch_add(1);`),
    O(`$ ./tiny_atomic          (-O0)
no lock:     1056548   (4 ms)
std::mutex:  2000000   (212 ms)
std::atomic: 2000000   (27 ms)`),
    P("The plain int loses updates, exactly as in v2. The mutex and the atomic are both correct, and the atomic is several times faster because nobody ever waits for it."),
    H("One indivisible step"),
    D(`++n on a plain int:   read -> add -> write
                      three steps, can interleave
n.fetch_add(1):       read+add+write
                      one step, nobody in between`),
    P("std::atomic<int> asks the hardware to do the read, the add and the write as one indivisible operation. Another thread can only see the value before or after it, never in the middle. Be careful though: counter = counter + 1 on an atomic is an atomic read followed by a separate atomic write. That is two steps again, and updates get lost again."),
    H("The second question: what else does the other thread see?"),
    P("Atomics also matter when one thread prepares data and then raises a flag to say it is ready."),
    D(`writer                         reader
data = 42;          plain int
ready = true;       atomic
                               sees ready == true
                               reads data: 42 or 0?`),
    P("Without more care the reader can see the flag but still read the old data, because compilers and CPUs are allowed to reorder memory operations. Memory order controls this. memory_order_relaxed only promises that the operation itself is atomic, which is enough for a counter. A store with memory_order_release paired with a load with memory_order_acquire promises that everything written before the store is visible after the load that reads it. That is how one thread publishes data to another. When unsure, leave out the memory order: the default is always correct, just slower."),
    C(`std::atomic<std::size_t> submitted{0};
std::atomic<std::size_t> completed{0};

void run(Task& t) {
    t();
    completed.fetch_add(1, std::memory_order_relaxed);
}

std::size_t tasks_completed() const {
    return completed.load(std::memory_order_relaxed);
}`),
    H("Exercises"),
    Q("After 10,000 tasks have finished, what must submitted and completed read?", "Both read 10,000."),
    Q("The dashboard reads submitted and then completed. Can it ever show completed greater than submitted?", "Yes. Two separate loads are not one snapshot. Read completed first, or treat the pair as an estimate."),
    Q("Make v9's default_pool() lazily created using an atomic pointer.", "Load with acquire, and if it is null take a mutex, check again, create the pool and store with release."),
  ],
},
{
  ver: "v12", title: "Two locks instead of one",
  blocks: [
    H("Producers and consumers share one lock"),
    P("A producer only ever touches the back of the queue and a consumer only the front. With one mutex they still wait for each other. Measuring v11's queue shows it getting slower as threads are added."),
    O(`$ ./next_bug          (v11, one mutex)
1x1: 5.7 M items/s
4x4: 3.0 M items/s
8x8: 2.0 M items/s`),
    H("A linked list with a dummy node"),
    P("Give each end its own lock. To make that safe, the queue becomes a singly linked list that always ends in an empty dummy node. Producers fill the dummy and append a new one under tail_m. Consumers take from the front under head_m. Because the tail always points at an empty dummy, the head and the tail never refer to the same real item, so the two locks never guard the same node."),
    D(`head_m                         tail_m
  v                              v
[ a ] -> [ b ] -> [ c ] -> [ dummy ]
consumers take here       producers fill here`),
    C(`bool push(T v) {
    auto dummy = std::make_unique<Node>();
    {
        std::lock_guard<std::mutex> l(tail_m);
        tail->value = std::move(v);
        Node* new_tail = dummy.get();
        tail->next = std::move(dummy);
        tail = new_tail;
    }
    { std::lock_guard<std::mutex> l(head_m); }
    cv.notify_one();
    return true;
}`),
    H("The lost wake-up comes back"),
    P("Consumers wait on the condition variable while holding head_m, but producers now only hold tail_m. That reopens the gap from v4."),
    D(`consumer (holds head_m)     producer (holds tail_m)
checks: queue is empty
                            appends item, notifies
                            (nobody is waiting yet)
starts waiting, never wakes`),
    P("That is why push() briefly takes head_m before notifying. The empty block looks strange, but it means the producer cannot notify while a consumer is between its check and its sleep."),
    H("Did it help?"),
    O(`$ ./tiny_contention     (-O2)
1x1 one mutex: 6.1 M/s   two locks: 0.9 M/s
4x4 one mutex: 3.7 M/s   two locks: 1.1 M/s`),
    P("Most people expect the two-lock queue to win. On this machine it lost. It removed waiting, but every push now allocates a node and takes two locks, and that costs more than the contention it saved. Finer locking is a trade, and only a measurement tells you which side wins."),
    H("Exercises"),
    Q("A million pushes. Roughly how many heap allocations in v7, and in v12?", "v7 allocates a block every few hundred items. v12 allocates one node per push, a million in total."),
    Q("Remove the empty head_m block. Trace a consumer that never wakes.", "The consumer sees an empty queue, the producer appends and notifies, then the consumer starts waiting and misses the signal."),
    Q("Apply the same idea to a hash map. What do you lock?", "One mutex per bucket, so threads working on different buckets never wait for each other."),
  ],
},
{
  ver: "v13", title: "No locks at all",
  blocks: [
    H("One producer, one consumer"),
    P("A feed handler has exactly one thread reading the network and one thread parsing messages. v12 spent between one and four microseconds per item, while a message should cost about 100 nanoseconds. Locks, allocation and sleeping each cost more than the message. With exactly one producer and one consumer we can drop all three."),
    D(`slots: [ . | a | b | c | . | . | . | . ]
              ^           ^
             head        tail
the consumer owns head, the producer owns tail
each only reads the other's index`),
    P("The queue becomes a fixed array of N slots, a ring buffer. Only the producer ever writes tail and only the consumer ever writes head. Since each index has a single writer, there is nothing to lock. The atomics are only there to tell the other side that a slot changed."),
    D(`producer                       consumer
write slot 5
tail.store(6, release)  ---->  tail.load(acquire) == 6
                               slot 5 is visible
                               read slot 5
                               head.store(6, release)`),
    P("That is v11's publish pattern used twice. The release store on tail publishes the slot the producer just wrote, and the acquire load on the other side is what makes that slot visible."),
    C(`bool try_push(T v) {               // producer only
    auto t = tail.load(std::memory_order_relaxed);
    auto h = head.load(std::memory_order_acquire);
    if (t - h == N)
        return false;                  // full
    slots[t & (N - 1)] = std::move(v);
    tail.store(t + 1, std::memory_order_release);
    return true;
}`),
    P("N is a power of two, so t & (N - 1) wraps the index around the array cheaply. try_pop is the mirror image on head. There are no blocking calls, so the caller decides whether to spin, yield or sleep when the ring is empty or full."),
    H("False sharing"),
    P("There is one more cost, and it is invisible in the source code. Two threads each increment their own counter, so nothing is shared."),
    C(`struct Together {
    std::atomic<long> a, b;
};
struct Apart {
    alignas(64) std::atomic<long> a;
    alignas(64) std::atomic<long> b;
};`),
    O(`$ ./tiny_false_sharing
same cache line:      1.53 s
separate cache lines: 0.39 s`),
    P("Caches move memory around in 64-byte lines. When a and b share a line, every write by one core takes the whole line away from the other core, and back again. The ring buffer gives head and tail a line each with alignas(64)."),
    P("The price of all this speed is a strict rule: one producer and one consumer. With two producers both read the same tail and write the same slot, and in the test the consumer received 1,255,101 of 2,000,000 items."),
    H("Exercises"),
    Q("N = 1024, tail = 5000, head = 4000. How full is the ring, and can the producer push?", "1,000 items. Yes, because 1,000 is less than 1,024."),
    Q("Two producers both read tail = 7. Trace it.", "Both write slot 7 and both store tail = 8, so one item is overwritten and lost."),
    Q("The consumer finds the ring empty. Should it spin, yield or sleep?", "Spinning gives the lowest latency, yielding is fairer to other threads, sleeping suits long idle periods. The caller chooses."),
  ],
},
{
  ver: "v14", title: "Measuring honestly",
  blocks: [
    H("Which queue is fastest?"),
    P("We now have three queues and plenty of opinions about them. Every number so far came from a single run, at whatever load happened to be there. That is an anecdote, not a measurement."),
    H("The compiler can delete your benchmark"),
    C(`Stopwatch sw;
std::uint64_t unused = 0;
for (std::uint64_t i = 0; i < 500'000'000; ++i)
    unused += i % 7;        // never used again
std::cout << sw.seconds();`),
    O(`$ ./tiny_optimizer       (-O2)
result unused: 0.0002 ms
result used:   640 ms`),
    P("Nothing reads unused, so the optimiser removed the whole loop and the timer measured nothing. A benchmark has to use its result, and it has to be built with the same optimisation level you ship."),
    H("Throughput and latency are different questions"),
    D(`throughput  how many messages per second, flat out
latency     how long one message waits

p50    the typical message
p99    1 in 100 messages is slower than this
p99.9  1 in 1,000: where the trouble is`),
    P("Running a queue flat out measures throughput, but latency measured that way is mostly time spent behind the backlog. To measure latency the harness sends messages at a steady 500,000 per second, below what the queue can handle, and timestamps each one."),
    P("It also follows three habits. Run once to warm up and throw that result away, because the first run pays for cold caches and page faults. Repeat five times and report the median, since one noisy run can move a mean but not a median. And always look at the tail, not only the typical case."),
    H("The result"),
    D(`                 M msg/s    latency at 500k msg/s
queue            saturated  p50        p99
ThreadSafeQueue     4.8     5.8 us     0.9 ms
TwoLockQueue        0.8    18.3 us     3.6 ms
SpscRing          104.8     0.26 us    0.05 ms`),
    P("Your numbers will differ from these. What should stay the same is the ranking and the reason for it. The ring has no locks, no allocation and no sleeping, and it is about twenty times faster than v7 on both measures. Even so its p99.9 reaches about a millisecond, which is the operating system pausing a thread. Dealing with that is the Feed Handler's first problem."),
    H("Exercises"),
    Q("Five runs give 4.1, 4.8, 4.9, 5.0 and 12.0 M/s. What are the mean and the median, and which do you report?", "The mean is 6.16 and the median 4.9. Report the median, because one outlier pulled the mean up."),
    Q("You have 1,000,000 sorted latencies. Which one is p99?", "The one at index 990,000."),
    Q("Design a fair comparison between your queue and a friend's.", "Same machine and build flags, the same load, a warm-up, at least five runs, median throughput, and p50, p99 and p99.9 at a paced rate."),
  ],
},
];
