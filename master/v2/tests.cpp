// v2 must-pass tests: four concurrent producers, every run.
#include "check.hpp"
#include "queue.hpp"
#include "stopwatch.hpp"
#include "thread_group.hpp"

TEST(four_producers_ten_runs) {
    const int N = 100'000;
    bool all_ok = true;
    for (int run = 0; run < 10; ++run) {
        Queue queue;
        {
            ThreadGroup g;
            for (int i = 0; i < 4; ++i)
                g.add(std::thread(producer, std::ref(queue), N));
        }
        all_ok = all_ok && queue.size() == std::size_t(4 * N);
    }
    CHECK(all_ok);
}

TEST(cost_of_locking) {
    const int N = 1'000'000;
    Queue a;
    Stopwatch sw;
    producer(a, N);
    double one = sw.seconds();
    Queue b;
    sw.reset();
    {
        ThreadGroup g;
        for (int i = 0; i < 4; ++i)
            g.add(std::thread(producer, std::ref(b), N / 4));
    }
    double four = sw.seconds();
    CHECK(b.size() == std::size_t(N));
    std::cout << "[1 thread " << one * 1e9 / N << " ns/push, 4 threads "
              << four * 1e9 / N << " ns/push]";
}

int main() { return run_all(); }
