// v11 must-pass tests: the counters add up, and v10 behaviour is unchanged.
#include <vector>
#include "check.hpp"
#include "pool.hpp"
#include "stopwatch.hpp"

TEST(counters_match_after_ten_thousand_tasks) {
    ThreadPool pool(4);
    const std::size_t N = 10'000;
    std::vector<std::future<int>> fs;
    for (std::size_t i = 0; i < N; ++i)
        fs.push_back(pool.submit([] { return 1; }));
    int sum = 0;
    for (auto& f : fs) sum += f.get();
    CHECK(sum == int(N));
    CHECK(pool.tasks_submitted() == N);
    // A future becomes ready inside the task, just before 'completed' is
    // incremented, so give the last increments a moment to land.
    Stopwatch sw;
    while (pool.tasks_completed() < N && sw.seconds() < 1.0)
        std::this_thread::yield();
    CHECK(pool.tasks_completed() == N);
}

TEST(monitor_reads_without_locks) {
    ThreadPool pool(4);
    std::size_t last = 0;
    bool monotonic = true;
    std::thread monitor([&] {
        for (int i = 0; i < 1000; ++i) {
            std::size_t now = pool.tasks_completed();
            monotonic = monotonic && now >= last;
            last = now;
        }
    });
    std::vector<std::future<int>> fs;
    for (int i = 0; i < 5000; ++i)
        fs.push_back(pool.submit([i] { return i; }));
    for (auto& f : fs) f.get();
    monitor.join();
    CHECK(monotonic);
}

TEST(values_and_exceptions_still_come_back) {
    ThreadPool pool(2);
    CHECK(pool.submit([] { return 6 * 7; }).get() == 42);
    bool caught = false;
    try {
        pool.submit([]() -> int { throw std::runtime_error("bad job"); }).get();
    } catch (const std::exception&) {
        caught = true;
    }
    CHECK(caught);
}

int main() { return run_all(); }
