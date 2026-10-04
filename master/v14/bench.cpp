// v14: one producer, one consumer, three queues. Build with -O2:
//   g++ -std=c++20 -O2 -pthread bench.cpp -o bench && ./bench
#include <cstdio>
#include <memory>
#include "bench.hpp"
#include "queue.hpp"
#include "spsc_ring.hpp"
#include "two_lock_queue.hpp"

using Msg = std::int64_t;

void print_row(const char* name, const Result& r) {
    std::printf("%-22s %9.2f %9.0f %9.0f %9.0f\n", name,
                r.million_per_sec, r.p50_ns, r.p99_ns, r.p999_ns);
}

int main() {
    const std::size_t N = 2'000'000;      // messages per throughput run
    const int runs = 5;
    const double rate = 500'000;          // latency runs: msg/s

    auto block_push = [](auto& q, Msg v) { q.push(v); };
    auto block_pop = [](auto& q) { return *q.wait_and_pop(); };
    auto spin_push = [](auto& q, Msg v) {
        while (!q.try_push(v)) {}
    };
    auto spin_pop = [](auto& q) {
        Msg v;
        while (!q.try_pop(v)) {}
        return v;
    };

    using QueueA = ThreadSafeQueue<Msg>;
    using QueueB = TwoLockQueue<Msg>;
    using QueueC = SpscRing<Msg, 4096>;
    auto make_a = [] { return std::make_unique<QueueA>(); };
    auto make_b = [] { return std::make_unique<QueueB>(); };
    auto make_c = [] { return std::make_unique<QueueC>(); };
    Result a = measure(make_a, N, runs, rate, block_push, block_pop);
    Result b = measure(make_b, N, runs, rate, block_push, block_pop);
    Result c = measure(make_c, N, runs, rate, spin_push, spin_pop);

    std::printf("clock resolution: %lld ns (below that reads as 0)\n\n",
                static_cast<long long>(clock_resolution_ns()));
    std::printf("%-22s %9s   latency at 500k msg/s, ns\n",
                "", "M msg/s");
    std::printf("%-22s %9s %9s %9s %9s\n",
                "queue (1P/1C)", "saturated", "p50", "p99", "p99.9");
    print_row("ThreadSafeQueue (v7)", a);
    print_row("TwoLockQueue (v12)", b);
    print_row("SpscRing (v13)", c);
}
