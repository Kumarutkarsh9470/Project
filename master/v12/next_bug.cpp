// v12 SHOULD FAIL (to be fast enough): every push allocates a node and
// takes two mutexes. A feed handler moving millions of messages a second
// between exactly one producer and one consumer can't afford either.
// That's v13's problem: a fixed ring buffer with no locks and no allocation.
#include <iostream>
#include "stopwatch.hpp"
#include "two_lock_queue.hpp"

int main() {
    TwoLockQueue<int> q;
    const int N = 2'000'000;
    Stopwatch sw;
    std::thread producer([&] { for (int i = 0; i < N; ++i) q.push(i); q.shutdown(); });
    long long n = 0;
    while (q.wait_and_pop()) ++n;
    producer.join();
    double s = sw.seconds();
    std::cout << n << " items, " << s * 1e9 / N << " ns per item (1 producer, 1 consumer)\n";
}
