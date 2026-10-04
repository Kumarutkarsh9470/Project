// Part 3 lessons (v11 to v14).
const { H, P, C, D, O, Q, A, J } = require("./blocks.js");

module.exports = [
{
  ver: "v11", title: "Counting without a lock",
  blocks: [
    H("A dashboard that slows the workers"),
    P("Our pool works. In Part 3 we look at what all that safety costs, and how to pay less. We start small. We want a monitoring thread to show how many tasks have been submitted and how many have completed, refreshed ten times a second. That means two counters, and every worker increments completed each time it finishes a task."),
    P("From v2 we know that ++ on a shared int is a data race, so the obvious answer is a mutex. But then every worker has to take that mutex after every task, and so does the dashboard. We are adding contention just to count. Is a lock really the only way to make ++ safe?"),
    P("Let us compare three versions of v2's counter. A uses a plain int with no lock, B uses a mutex, and C uses std::atomic<int>, which we have not seen before."),
    C(`int plain = 0;                  // A: no lock
int locked = 0; std::mutex m;   // B: mutex
std::atomic<int> counter{0};    // C: atomic

// two threads, 1,000,000 times each:
++plain;
{ std::lock_guard<std::mutex> l(m); ++locked; }
counter.fetch_add(1);`),
    O(`$ OPT=-O0 ./run.sh v11 tiny_atomic
no lock:     1056548   (4 ms)
std::mutex:  2000000   (212 ms)
std::atomic: 2000000   (27 ms)`),
    P("The plain int loses updates, exactly as in v2. The mutex and the atomic are both correct. But the atomic is about eight times faster, because no thread ever has to wait for another one to give back a lock."),
    H("One indivisible step"),
    A("Why is the atomic both correct and faster than the mutex?"),
    P("Remember that ++ on a plain int is three steps: read, add, write, and another thread can sneak in between them. An atomic variable asks the processor to do all three as one single operation that cannot be interrupted halfway. Another thread can see the value before the operation or after it, but never in the middle."),
    D(`++n on a plain int:   read -> add -> write
                      three steps, can interleave
n.fetch_add(1):       read+add+write
                      one step, nobody in between`),
    P("fetch_add(1) adds one and returns the old value. ++counter on an atomic does the same thing. But be careful with this: counter = counter + 1 on an atomic is not one step. It is an atomic read, followed by a separate atomic write, and another thread can increment in between. The lost updates come back. Only single operations on an atomic are indivisible, not whole expressions."),
    H("The second question: what else does the other thread see?"),
    P("Atomics also solve a less obvious problem. Often one thread prepares some data and then sets a flag to say it is ready, and another thread waits for the flag and then reads the data."),
    D(`writer                         reader
data = 42;        (plain int)
ready = true;     (atomic)
                               sees ready == true
                               reads data: 42 or 0?`),
    A("The flag is atomic. Isn't the reader safe now?"),
    P("You would expect the reader to always see 42. It is not guaranteed. To run faster, both the compiler and the processor are allowed to reorder memory operations when it makes no difference to a single thread. So the reader might see ready become true before the write of 42 has become visible to it, and read 0."),
    P("Memory order is how you tell the compiler and the processor which reorderings are not allowed. memory_order_relaxed only promises that the operation itself is atomic, nothing more: fine for a counter, where we only care about the number. memory_order_release on the writer's store, paired with memory_order_acquire on the reader's load, promises that everything the writer did before the store is visible to the reader after the load that sees it. That is how one thread safely hands data to another. If you leave the memory order out, you get the strictest one, which is always correct, just a bit slower."),
    C(`std::atomic<std::size_t> submitted{0};
std::atomic<std::size_t> completed{0};

void run(Task& t) {
    t();
    completed.fetch_add(1,
        std::memory_order_relaxed);
}

std::size_t tasks_completed() const {
    return completed.load(
        std::memory_order_relaxed);
}`),
    P("For our two counters relaxed is enough. Each counter only needs to count correctly on its own, and the dashboard does not use them to decide when some other data is ready."),
    J("The pool's statistics counters are atomics with relaxed order. Release and acquire come back in v13, where they carry every item through the lock-free ring."),
    H("Exercises"),
    Q("After 10,000 tasks have been submitted and have all finished, what must submitted and completed read?",
      "Both must read exactly 10,000. Every submit() does one fetch_add on submitted and every finished task does one fetch_add on completed, and an atomic fetch_add can never lose an update, no matter how many threads do it at the same time. With a plain int, both counters would usually end up below 10,000, by a different amount every run."),
    Q("The dashboard reads submitted, then reads completed. Can it ever show completed greater than submitted?",
      "Yes. The two loads happen at two different moments, so they are not a snapshot of one instant. Say submitted reads 100. Before the dashboard reads completed, ten more tasks are submitted and finished. Now completed reads 105, more than the 100 it showed for submitted. Reading completed first and submitted second avoids this, or you can accept that the dashboard shows an estimate."),
    Q("Make v9's default_pool() create its pool lazily using an atomic pointer instead of a static variable.",
      "Keep a std::atomic<ThreadPool*> that starts as nullptr, plus a mutex. First load the pointer with acquire. If it is not null, the pool exists, so return it. If it is null, lock the mutex and load it again, because another thread may have created it while you were waiting. If it is still null, create the pool and store the pointer with release. The release store makes sure any thread that later sees the pointer also sees a fully built pool. This is called double-checked locking."),
  ],
},
{
  ver: "v12", title: "Two locks instead of one",
  blocks: [
    H("Producers and consumers share one lock"),
    P("Look at how threads use our queue. A producer only ever adds at the back. A consumer only ever takes from the front. They work on opposite ends. Yet with one mutex, a producer has to wait whenever a consumer holds the lock, and the other way round. When we measure, the queue gets slower as we add threads:"),
    O(`$ ./run.sh v11 next_bug     (one mutex)
1x1: 5.7 M items/s
4x4: 3.0 M items/s
8x8: 2.0 M items/s`),
    A("Producers and consumers touch different ends. Why should they share one key?"),
    P("So the idea is to give each end its own lock: one for producers, one for consumers. Then a push and a pop could run at the same time."),
    H("A linked list with a dummy node"),
    P("std::queue does not let us lock its two ends separately, so we build the queue ourselves as a linked list. Each item lives in a node, and each node points to the next one. head points to the first node, where consumers take from. tail points to the last one, where producers add."),
    A("Would two locks be safe on a normal linked list?"),
    P("There is one problem. When the queue has exactly one item, head and tail point to the same node, so a producer and a consumer would both touch it, under two different locks. That is a data race again. The trick is to always keep one extra empty node at the end, called a dummy. The tail always points to the dummy, so the tail never points to a real item, and the two locks never protect the same node."),
    D(`head_m                          tail_m
  v                               v
[ a ] -> [ b ] -> [ c ] -> [ dummy ]
consumers take here        producers fill
                           the dummy here`),
    P("To push, a producer puts the new value into the current dummy and attaches a fresh empty node behind it, which becomes the new dummy. It only needs tail_m to do that. To pop, a consumer takes the first node under head_m."),
    C(`bool push(T v) {
    auto dummy = std::make_unique<Node>();
    {
        std::lock_guard<std::mutex> l(tail_m);
        tail->value = std::move(v);  // fill dummy
        Node* new_tail = dummy.get();
        tail->next = std::move(dummy);
        tail = new_tail;             // new dummy
    }
    { std::lock_guard<std::mutex> l(head_m); }
    cv.notify_one();
    return true;
}`),
    P("Notice that the new node is created before the lock is taken. Allocating memory is slow, and doing it outside the lock means other producers do not have to wait for it."),
    H("The lost wake-up comes back"),
    P("What is that strange empty block with head_m near the end of push()? Consumers wait on the condition variable while holding head_m. Producers now only hold tail_m. So the gap from v4 opens up again."),
    D(`consumer (holds head_m)   producer (holds tail_m)
checks: queue is empty
                          appends item, notifies
                          (nobody waiting yet)
starts waiting, never wakes`),
    P("The consumer has checked the queue but has not started waiting yet. The producer, which does not need head_m, appends and notifies right in that gap, and the notification is lost. By briefly taking and releasing head_m before notifying, the producer has to wait until the consumer has either finished checking and is properly asleep, or has not checked yet. Either way the notification can no longer fall into the gap."),
    H("Did it help?"),
    A("Less waiting must mean faster. Right?"),
    O(`$ ./run.sh v12 tiny_contention
1x1 one mutex: 6.1 M/s   two locks: 0.9 M/s
4x4 one mutex: 3.7 M/s   two locks: 1.1 M/s`),
    P("Most people expect the two-lock queue to win. On this machine it lost, by a lot. It did remove the waiting between producers and consumers. But every push now allocates a node on the heap, and takes two locks instead of one, and those costs turned out to be bigger than the waiting we saved. Finer locking is always a trade between less waiting and more work per operation, and only a measurement can tell you which side wins on your machine. That is a lesson worth more than the queue itself."),
    J("The idea of a lock per part comes back in our Allocator and Simulator projects: a lock per bucket, a lock per order book side. Measure it every time."),
    H("Exercises"),
    Q("You push a million items. Roughly how many heap allocations happen in the v7 queue, and how many in v12?",
      "std::queue in v7 stores its items in fixed-size blocks, each holding many items, so it only allocates when a block fills up, a few thousand times for a million ints. The v12 queue allocates one node for every single push, so a million allocations. Each allocation costs tens of nanoseconds, which is a big part of why the two-lock queue was slower."),
    Q("Remove the empty head_m block from push(). Trace how a consumer can sleep forever.",
      "The consumer holds head_m and checks: the queue is empty, so it decides to wait. Before wait() actually puts it to sleep, the producer, holding only tail_m, appends an item and calls notify_one(). No thread is waiting yet, so the notification is lost. Then the consumer goes to sleep. The item is in the queue, but nobody will notify again, so the consumer sleeps forever. That is the lost wake-up from v4."),
    Q("Use the same idea, separate locks for separate parts, for a hash map. What do you lock?",
      "Give each bucket of the hash map its own mutex. A key always lives in one bucket, chosen by its hash, so an operation on a key only needs to lock that one bucket. Two threads working on keys in different buckets never wait for each other, and with many buckets most operations do not collide at all. Only operations that touch the whole map, like resizing, need to lock every bucket."),
  ],
},
{
  ver: "v13", title: "No locks at all",
  blocks: [
    H("One producer, one consumer"),
    P("Some programs have a very particular shape. A market data feed handler, for example, has exactly one thread reading messages from the network and exactly one thread parsing them. Millions of messages a second go from the first thread to the second. In v12 each item cost between one and four microseconds, but parsing a message takes about 100 nanoseconds. The queue costs far more than the work."),
    A("If the work is 100 ns, where are the other microseconds going?"),
    P("Where does that time go? Into locks, into allocating nodes, and into putting threads to sleep and waking them up. With exactly one producer and one consumer we can get rid of all three. This version only works for that one shape, which is why its name says it: SPSC, single producer, single consumer."),
    H("A ring buffer"),
    P("Instead of a linked list we use a fixed array of N slots, allocated once. Two counters say where we are. tail is the next slot the producer will write. head is the next slot the consumer will read. When either one reaches the end of the array, it wraps around to the start, which is why this is called a ring buffer."),
    D(`slots: [ . | a | b | c | . | . | . | . ]
              ^           ^
             head        tail
only the consumer writes head
only the producer writes tail`),
    A("Two threads, shared memory, and no lock. How can that possibly be safe?"),
    P("Here is the key observation. Only the producer ever changes tail, and only the consumer ever changes head. Each one only reads the other's counter. A data race needs two threads writing the same variable, or one writing while another reads without coordination. Each counter has exactly one writer, so there is nothing to lock. We only need a safe way to tell the other side that something changed."),
    P("That is the release and acquire pattern from v11. Follow one item through the ring."),
    D(`producer                     consumer
write slot 5
tail.store(6, release) ----> tail.load(acquire)
                             sees 6
                             slot 5 is visible
                             read slot 5
                             head.store(6, release)`),
    P("The producer first writes the item into slot 5, then stores tail = 6 with release. The consumer loads tail with acquire and sees 6. Because of the release and acquire pair, the write to slot 5 is guaranteed to be visible to the consumer now, so it can read the slot safely. Then it stores head = 6 with release, which tells the producer that slot 5 is free to be used again."),
    C(`bool try_push(T v) {           // producer only
    auto t = tail.load(std::memory_order_relaxed);
    auto h = head.load(std::memory_order_acquire);
    if (t - h == N)
        return false;              // ring is full
    slots[t & (N - 1)] = std::move(v);
    tail.store(t + 1, std::memory_order_release);
    return true;
}`),
    P("The counters only ever grow. t - h is the number of items in the ring, and if it equals N the ring is full. N is always a power of two, like 1024, so t & (N - 1) gives the same result as t % N, the position inside the array, but much more cheaply. try_pop() is the mirror image: it reads the slot at head and then increases head. Neither function ever waits. If the ring is full or empty, they just return false, and the caller decides whether to try again immediately, yield, or sleep."),
    H("False sharing"),
    P("There is one more cost, and you cannot see it in the source code at all. Here two threads each increment their own counter. They never touch each other's variable, so nothing is shared."),
    C(`struct Together {
    std::atomic<long> a, b;   // side by side
};
struct Apart {
    alignas(64) std::atomic<long> a;
    alignas(64) std::atomic<long> b;
};`),
    O(`$ ./run.sh v13 tiny_false_sharing
same cache line:      1.53 s
separate cache lines: 0.39 s`),
    A("Nothing is shared. Why would one be slower?"),
    P("The only difference is where the two counters sit in memory, yet one version is four times slower. The reason is the cache. A core does not read single bytes from memory. It copies memory in blocks of 64 bytes, called cache lines, into its own fast cache. Before a core can write to a line, it must have the only copy of that line."),
    D(`core 0  writes a: takes the line from core 1
core 1  writes b: takes the line from core 0
        ... the same 64 bytes bounce back and
            forth fifty million times`),
    P("When a and b sit side by side, they are in the same cache line. Every time core 0 writes a, it takes the line away from core 1, and every time core 1 writes b, it takes it back. The two threads share nothing in the code, but they share a cache line, so they slow each other down. This is called false sharing. alignas(64) puts each counter at the start of its own 64-byte line, and the problem disappears. Our ring puts head and tail on separate lines for exactly this reason."),
    P("The price of all this speed is a strict rule: exactly one producer and one consumer. If two producers use the ring, both can read the same tail and write into the same slot, and one item silently replaces the other. In the test, the consumer received 1,255,101 of the 2,000,000 items that were pushed."),
    J("This ring is the starting point of the Feed Handler project: the network thread is the producer, the parser thread is the consumer."),
    H("Exercises"),
    Q("A ring has N = 1024 slots, tail = 5000 and head = 4000. How many items are in it, and can the producer push one more?",
      "The number of items is tail - head = 5000 - 4000 = 1000. The ring can hold 1024, and 1000 is less than 1024, so try_push() succeeds. The new item goes into slot 5000 & 1023 = 904, and then tail becomes 5001. The producer could push 24 items in total before the ring is full."),
    Q("Two producers use the ring at the same time, and both read tail = 7. Trace what happens.",
      "Both producers check that there is space, and both see that slot 7 is the next free one. Both write their item into slot 7, so the second write replaces the first. Then both store tail = 8. The consumer will read slot 7 once and get only one of the two items. The other is lost, with no error at all. Writing the same variable from two threads without coordination is also a data race, which is undefined behaviour. That is why the ring must only have one producer."),
    Q("The consumer calls try_pop() and finds the ring empty. Should it spin, yield or sleep before trying again?",
      "It depends on what matters most. Spinning, trying again immediately, gives the lowest delay when the next item arrives, but uses a whole core. Yielding lets other threads run for a moment and is fairer, at the cost of a little delay. Sleeping saves the most CPU when the ring is often empty for a long time, but adds the most delay. A feed handler usually spins, because every microsecond counts. That is why the ring leaves the choice to the caller."),
  ],
},
{
  ver: "v14", title: "Measuring honestly",
  blocks: [
    H("Which queue is fastest?"),
    P("We now have three queues: the mutex queue from v7, the two-lock queue from v12, and the ring from v13. Most people have an opinion about which is fastest. But look at how we measured so far: one run, on whatever the machine happened to be doing, reporting one average number. That is not good enough to decide anything. In this last version we build a small benchmark harness that measures properly."),
    H("The compiler can delete your benchmark"),
    P("The first trap surprises almost everyone. Here we time a loop that adds up half a billion numbers."),
    C(`Stopwatch sw;
std::uint64_t unused = 0;
for (std::uint64_t i = 0; i < 500'000'000; ++i)
    unused += i % 7;        // never used again
std::cout << sw.seconds();`),
    O(`$ ./run.sh v14 tiny_optimizer
result unused: 0.0002 ms
result used:   640 ms`),
    A("Half a billion additions in 0.0002 ms? What happened?"),
    P("Half a billion additions in 0.0002 ms is impossible. What happened is that the compiler noticed nobody ever reads unused after the loop. Removing the loop does not change what the program prints, so with optimisation turned on, the compiler removed it. The timer measured an empty piece of code. As soon as we print the sum, the loop has to run, and it takes 640 ms. So a benchmark must always use the result of the work it measures, and it must be built with the same optimisation level, -O2, that you will really use."),
    H("Throughput and latency are different questions"),
    D(`throughput  how many messages per second,
            running flat out
latency     how long one message waits
            from push to pop

p50    the typical message
p99    1 in 100 messages is slower
p99.9  1 in 1,000: where the trouble is`),
    P("Throughput tells you how much the queue can move in total. Latency tells you how long each single message spends waiting. A feed handler cares about both, but especially about latency, and not just the typical one. p50 is the median: half the messages are faster, half are slower. p99 is the time that 99 out of 100 messages beat. The slow ones at the end, the tail, are the messages that cause real trouble."),
    A("Why not just push as fast as possible and time each message?"),
    P("You cannot measure latency by running the queue flat out. If the producer pushes as fast as it can, the queue fills up, and each message mostly waits behind the thousands in front of it. You end up measuring the length of the line, not the cost of the queue. So the harness sends messages at a steady rate of 500,000 per second, less than any of the queues can handle, stamps each one with the time it was pushed, and records how long it took to arrive."),
    P("The harness follows three more habits. It does one warm-up run and throws the result away, because the first run pays extra for empty caches and memory being set up. It repeats every measurement five times and reports the median, because one disturbed run can drag an average around but barely moves a median. And it always reports the tail as well as the typical case."),
    H("The result"),
    D(`                 M msg/s    latency at 500k/s
queue            saturated  p50       p99
ThreadSafeQueue     4.8     5.8 us    0.9 ms
TwoLockQueue        0.8    18.3 us    3.6 ms
SpscRing          104.8     0.26 us   0.05 ms`),
    P("Your numbers will be different, because they depend on your machine. What should stay the same is the ranking, and the reason behind it. The ring has no locks, no allocation and no sleeping, and it is about twenty times faster than the v7 queue on both throughput and typical latency."),
    P("Even so, look at its tail: the ring's p99.9 reaches about a millisecond. That is not the queue. It is the operating system pausing one of the threads to run something else. Dealing with that, by giving the threads their own cores, is the first problem of the Feed Handler project, which starts from exactly this ring and this harness."),
    J("Every performance claim in our projects is backed by this harness: warm-up, five runs, median, and p50, p99, p99.9."),
    H("Exercises"),
    Q("Five runs give 4.1, 4.8, 4.9, 5.0 and 12.0 million messages per second. What are the mean and the median, and which should you report?",
      "The mean is (4.1 + 4.8 + 4.9 + 5.0 + 12.0) / 5 = 30.8 / 5 = 6.16. The median is the middle value after sorting, 4.9. Report the median. Four of the five runs are close to 5, and the 12.0 is one unusual run, maybe a measurement mistake. It pulls the mean up by more than a whole million, while the median stays where most runs actually are."),
    Q("You recorded 1,000,000 latencies and sorted them from fastest to slowest. Which one is p99?",
      "p99 is the value that 99% of the measurements are at or below. 99% of 1,000,000 is 990,000, so it is the value at position 990,000 in the sorted list. Only the 10,000 measurements after it are slower. In the same way, p50 is at position 500,000 and p99.9 at position 999,000."),
    Q("You want to compare your queue with a friend's fairly. What do you need to keep the same, and what do you report?",
      "Run both on the same machine, built with the same compiler and the same flags, -O2, with the same message type and the same number of producers and consumers. Do a warm-up run first and repeat each measurement at least five times. Report the median throughput, and p50, p99 and p99.9 latency measured at the same paced rate. Then the numbers tell you about the queues, not about the conditions they ran in."),
  ],
},
];
