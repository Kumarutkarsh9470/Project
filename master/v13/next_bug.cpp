// v13 SHOULD FAIL (by design): TWO producers on a single-producer ring.
// Both can read the same 'tail', write the same slot and publish the same
// index, so items are lost, or 'tail' moves backwards and old slots are
// read again. It's also a data race: undefined behaviour. The rule is in
// the name: one producer, one consumer.
#include <cstdlib>
#include <iostream>
#include <thread>
#include "spsc_ring.hpp"
#include "stopwatch.hpp"

int main() {
    static SpscRing<int, 1024> r;
    const int N = 1'000'000;
    auto produce = [] {
        for (int i = 0; i < N; ++i)
            while (!r.try_push(1))
                std::this_thread::yield();
    };
    std::thread p1(produce), p2(produce);
    long long received = 0;
    Stopwatch idle;
    int v;
    while (received < 2LL * N && idle.seconds() < 1.0) {
        if (r.try_pop(v)) {
            ++received;
            idle.reset();
        }
    }
    std::cout << "expected " << 2 * N << " items, the consumer got " << received << std::endl;
    std::_Exit(0);                        // producers may be stuck: don't join
}
