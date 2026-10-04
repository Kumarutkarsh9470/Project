// v4 must-pass tests: sleeping consumers, count and sum.
#include "check.hpp"
#include "queue.hpp"
#include "stopwatch.hpp"
#include "thread_group.hpp"

TEST(consumers_first_then_wake) {
    Queue queue;
    Stopwatch sw;
    {
        ThreadGroup g;
        for (int c = 0; c < 4; ++c) g.add(std::thread(consumer, std::ref(queue), 250));
        std::this_thread::sleep_for(std::chrono::milliseconds(200));   // consumers asleep
        g.add(std::thread(producer, std::ref(queue), 1000));
    }
    CHECK(queue.empty());
    CHECK(sw.seconds() < 5.0);
}

TEST(one_producer_one_consumer_million) {
    Queue queue;
    const int N = 1'000'000;
    long long sum = 0;
    {
        ThreadGroup g;
        g.add(std::thread(producer, std::ref(queue), N));
        g.add(std::thread([&] { for (int i = 0; i < N; ++i) sum += queue.wait_and_pop(); }));
    }
    CHECK(sum == 1LL * N * (N - 1) / 2);
    CHECK(queue.empty());
}

TEST(four_by_four_sum) {
    Queue queue;
    const int N = 100'000;
    long long total = 0;
    std::mutex total_m;
    {
        ThreadGroup g;
        for (int p = 0; p < 4; ++p) g.add(std::thread(producer, std::ref(queue), N));
        for (int c = 0; c < 4; ++c)
            g.add(std::thread([&] {
                long long local = 0;
                for (int i = 0; i < N; ++i) local += queue.wait_and_pop();
                std::lock_guard<std::mutex> lock(total_m);
                total += local;
            }));
    }
    CHECK(total == 4LL * N * (N - 1) / 2);
}

int main() { return run_all(); }
