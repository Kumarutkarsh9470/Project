// v13 tiny example: false sharing. Build at -O2.
// Two threads each increment their OWN counter. Nothing is shared, yet
// when the counters sit on the same 64-byte cache line the cores keep
// stealing that line from each other. Padding them apart fixes it.
#include <atomic>
#include <iostream>
#include <thread>
#include "stopwatch.hpp"

struct Together {
    std::atomic<long> a{0};
    std::atomic<long> b{0};               // same cache line as a
};

struct Apart {
    alignas(64) std::atomic<long> a{0};
    alignas(64) std::atomic<long> b{0};   // its own cache line
};

template <class S>
double run() {
    S s;
    const long N = 50'000'000;
    Stopwatch sw;
    std::thread t1([&] { for (long i = 0; i < N; ++i) s.a.fetch_add(1, std::memory_order_relaxed); });
    std::thread t2([&] { for (long i = 0; i < N; ++i) s.b.fetch_add(1, std::memory_order_relaxed); });
    t1.join();
    t2.join();
    return sw.seconds();
}

int main() {
    std::cout << "same cache line:     " << run<Together>() << " s\n";
    std::cout << "separate cache lines: " << run<Apart>() << " s\n";
}
