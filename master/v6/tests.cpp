// v6 must-pass tests: shutdown wakes everyone, drains, rejects pushes.
#include "check.hpp"
#include "queue.hpp"
#include "stopwatch.hpp"
#include "thread_group.hpp"

TEST(shutdown_wakes_four_waiters) {
    Queue queue;
    Stopwatch sw;
    {
        ThreadGroup g;
        for (int c = 0; c < 4; ++c) g.add(std::thread(consumer, std::ref(queue)));
        std::this_thread::sleep_for(std::chrono::milliseconds(50));
        sw.reset();
        queue.shutdown();
    }                                   // joins: all four must have left
    CHECK(sw.seconds() < 0.1);
}

TEST(shutdown_drains_queued_items) {
    Queue queue;
    for (int i = 0; i < 1000; ++i) queue.push(i);
    queue.shutdown();
    int got = 0;
    while (auto x = queue.wait_and_pop()) ++got;
    CHECK(got == 1000);
}

TEST(push_after_shutdown_is_rejected) {
    Queue queue;
    queue.shutdown();
    CHECK(!queue.push(1));
    CHECK(!queue.push_all({1, 2}));
    CHECK(queue.empty());
}

TEST(matrix_without_telling_consumers_n) {
    for (int run = 0; run < 3; ++run) {
        Queue queue;
        const int N = 50'000;
        long long total = 0;
        std::mutex total_m;
        {
            ThreadGroup consumers;
            for (int c = 0; c < 4; ++c)
                consumers.add(std::thread([&] {
                    long long local = 0;
                    while (auto x = queue.wait_and_pop()) local += *x;
                    std::lock_guard<std::mutex> lock(total_m);
                    total += local;
                }));
            {
                ThreadGroup producers;
                for (int p = 0; p < 4; ++p) producers.add(std::thread(producer, std::ref(queue), N));
            }                           // producers done
            queue.shutdown();           // consumers drain, then leave
        }                               // consumers joined
        CHECK(total == 4LL * N * (N - 1) / 2);
    }
}

int main() { return run_all(); }
