// v13: exactly one producer and one consumer, no locks.
#include <iostream>
#include <thread>
#include "spsc_ring.hpp"

int main() {
    static SpscRing<int, 1024> ring;
    const int n = 10'000'000;

    std::thread producer([] {
        for (int i = 0; i < n; ++i)
            while (!ring.try_push(i))        // full: try again
                std::this_thread::yield();
    });

    long long sum = 0;
    for (int got = 0; got < n;) {
        int x;
        if (ring.try_pop(x)) { sum += x; ++got; }
        else std::this_thread::yield();      // empty: try again
    }
    producer.join();
    std::cout << "sum " << sum << " (expected "
              << 1LL * n * (n - 1) / 2 << ")\n";
}
