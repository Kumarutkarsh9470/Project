// v14 must-pass tests: the same correctness check runs against all three
// queues through one adapter, and the harness itself returns sane numbers.
#include <memory>
#include "bench.hpp"
#include "check.hpp"
#include "queue.hpp"
#include "spsc_ring.hpp"
#include "two_lock_queue.hpp"

template <class Q, class Push, class Pop>
bool one_to_one_in_order(Q& q, Push push, Pop pop, long long n) {
    std::thread producer([&] {
        for (long long i = 0; i < n; ++i)
            push(q, i);
    });
    bool ok = true;
    for (long long i = 0; i < n; ++i)
        ok = ok && pop(q) == i;
    producer.join();
    return ok;
}

TEST(all_three_queues_deliver_in_order) {
    const long long n = 1'000'000;
    auto blocking_push = [](auto& q, long long v) { q.push(v); };
    auto blocking_pop = [](auto& q) { return *q.wait_and_pop(); };
    ThreadSafeQueue<long long> a;
    CHECK(one_to_one_in_order(a, blocking_push, blocking_pop, n));
    TwoLockQueue<long long> b;
    CHECK(one_to_one_in_order(b, blocking_push, blocking_pop, n));
    static SpscRing<long long, 1024> c;
    CHECK(one_to_one_in_order(c,
        [](auto& q, long long v) { while (!q.try_push(v)) {} },
        [](auto& q) { long long v; while (!q.try_pop(v)) {} return v; }, n));
}

TEST(harness_reports_sane_numbers) {
    auto r = measure([] { return std::make_unique<ThreadSafeQueue<std::int64_t>>(); },
                     200'000, 3, 200'000,
                     [](auto& q, std::int64_t v) { q.push(v); },
                     [](auto& q) { return *q.wait_and_pop(); });
    CHECK(r.million_per_sec > 0);
    CHECK(r.p50_ns >= 0 && r.p50_ns <= r.p99_ns && r.p99_ns <= r.p999_ns);
    CHECK(clock_resolution_ns() > 0);
}

int main() { return run_all(); }
