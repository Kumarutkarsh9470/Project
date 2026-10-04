// v3 must-pass tests: no freeze, no "empty" exceptions, each item once.
#include "check.hpp"
#include "queue.hpp"
#include "thread_group.hpp"

TEST(consumer_first_no_freeze) {
    Queue queue;
    {
        ThreadGroup g;
        g.add(std::thread(consumer, std::ref(queue), 1000));
        std::this_thread::sleep_for(std::chrono::milliseconds(20));
        g.add(std::thread(producer, std::ref(queue), 1000));
    }
    CHECK(queue.empty());
}

TEST(two_consumers_slow_producers_each_item_once) {
    Queue queue;
    const int N = 2000;
    long long total = 0;
    std::mutex total_m;
    {
        ThreadGroup g;
        for (int p = 0; p < 2; ++p)
            g.add(std::thread([&queue] {
                for (int i = 0; i < N; ++i) {
                    queue.push(i);
                    if (i % 100 == 0) std::this_thread::sleep_for(std::chrono::milliseconds(1));
                }
            }));
        for (int c = 0; c < 2; ++c)
            g.add(std::thread([&] {
                long long local = 0;
                int x;
                for (int got = 0; got < N; )
                    if (queue.try_pop(x)) { local += x; ++got; }
                std::lock_guard<std::mutex> lock(total_m);
                total += local;
            }));
    }
    CHECK(total == 2LL * N * (N - 1) / 2);
    CHECK(queue.empty());
}

TEST(four_producers_still_correct) {
    Queue queue;
    {
        ThreadGroup g;
        for (int i = 0; i < 4; ++i)
            g.add(std::thread(producer, std::ref(queue), 100'000));
    }
    CHECK(queue.size() == 400'000);
}

int main() { return run_all(); }
