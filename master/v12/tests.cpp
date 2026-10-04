// v12 must-pass tests: FIFO order, the full matrix, shutdown, move-only
// values, and destroying a queue that still holds a million nodes.
#include <memory>
#include <mutex>
#include "check.hpp"
#include "thread_group.hpp"
#include "two_lock_queue.hpp"

TEST(fifo_single_thread) {
    TwoLockQueue<int> q;
    for (int i = 0; i < 100; ++i) q.push(i);
    bool ok = true;
    int x;
    for (int i = 0; i < 100; ++i) ok = ok && q.try_pop(x) && x == i;
    CHECK(ok);
    CHECK(!q.try_pop(x));
    CHECK(q.empty());
}

TEST(four_by_four_count_and_sum) {
    for (int run = 0; run < 3; ++run) {
        TwoLockQueue<int> q;
        const int N = 100'000;
        long long total = 0, count = 0;
        std::mutex m;
        {
            ThreadGroup consumers;
            for (int c = 0; c < 4; ++c)
                consumers.add(std::thread([&] {
                    long long local = 0, n = 0;
                    while (auto x = q.wait_and_pop()) { local += *x; ++n; }
                    std::lock_guard<std::mutex> lock(m);
                    total += local;
                    count += n;
                }));
            {
                ThreadGroup producers;
                for (int p = 0; p < 4; ++p)
                    producers.add(std::thread([&] { for (int i = 0; i < N; ++i) q.push(i); }));
            }
            q.shutdown();
        }
        CHECK(count == 4LL * N);
        CHECK(total == 4LL * N * (N - 1) / 2);
    }
}

TEST(shutdown_wakes_waiters_and_refuses_pushes) {
    TwoLockQueue<int> q;
    {
        ThreadGroup g;
        for (int c = 0; c < 4; ++c) g.add(std::thread([&] { while (q.wait_and_pop()) {} }));
        std::this_thread::sleep_for(std::chrono::milliseconds(50));
        q.shutdown();
    }
    CHECK(!q.push(1));
}

TEST(move_only_values) {
    TwoLockQueue<std::unique_ptr<int>> q;
    q.push(std::make_unique<int>(7));
    auto v = q.wait_and_pop();
    CHECK(v && **v == 7);
}

TEST(destroy_with_a_million_nodes) {
    auto q = std::make_unique<TwoLockQueue<int>>();
    for (int i = 0; i < 1'000'000; ++i) q->push(i);
    q.reset();                            // would overflow the stack if recursive
    CHECK(true);
}

int main() { return run_all(); }
