// v13 must-pass tests: order, full/empty edges, wrap-around, move-only
// values, and ten million items between one producer and one consumer.
#include <memory>
#include <thread>
#include "check.hpp"
#include "spsc_ring.hpp"

TEST(full_and_empty_edges) {
    SpscRing<int, 4> r;
    int x;
    CHECK(!r.try_pop(x));
    for (int i = 0; i < 4; ++i) CHECK(r.try_push(i));
    CHECK(!r.try_push(99));               // full
    CHECK(r.size() == 4);
    for (int i = 0; i < 4; ++i) CHECK(r.try_pop(x) && x == i);
    CHECK(!r.try_pop(x));                 // empty again
}

TEST(wraps_around_many_times) {
    SpscRing<int, 8> r;
    bool ok = true;
    int x;
    for (int i = 0; i < 1000; ++i) {
        ok = ok && r.try_push(i) && r.try_pop(x) && x == i;
    }
    CHECK(ok);
}

TEST(move_only_values) {
    SpscRing<std::unique_ptr<int>, 16> r;
    CHECK(r.try_push(std::make_unique<int>(5)));
    std::unique_ptr<int> out;
    CHECK(r.try_pop(out) && *out == 5);
}

TEST(ten_million_in_order) {
    static SpscRing<long long, 1024> r;   // static: keeps the array off the stack
    const long long N = 10'000'000;
    bool in_order = true;
    std::thread producer([] {
        for (long long i = 0; i < N; ++i)
            while (!r.try_push(i))
                std::this_thread::yield();
    });
    long long expected = 0, v;
    while (expected < N) {
        if (r.try_pop(v)) {
            in_order = in_order && v == expected;
            ++expected;
        }
    }
    producer.join();
    CHECK(in_order);
}

int main() { return run_all(); }
