// v0 must-pass tests: correct, single-threaded, and timed.
#include "check.hpp"
#include "queue.hpp"
#include "stopwatch.hpp"

TEST(fifo_order) {
    Queue q;
    for (int i = 0; i < 10; ++i) q.push(i);
    bool in_order = true;
    for (int i = 0; i < 10; ++i) in_order = in_order && q.pop() == i;
    CHECK(in_order);
    CHECK(q.empty());
}

TEST(million_items_baseline) {
    Queue q;
    const int N = 1'000'000;
    Stopwatch sw;
    producer(q, N);
    consumer(q, N);
    double s = sw.seconds();
    CHECK(q.size() == 0);
    std::cout << "[" << s * 1e9 / N << " ns per push+pop]";
}

int main() { return run_all(); }
