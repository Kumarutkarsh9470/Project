// v7 must-pass tests: move-only values, strings, and the full matrix.
#include <memory>
#include <string>
#include "check.hpp"
#include "queue.hpp"
#include "thread_group.hpp"

TEST(unique_ptr_values_are_moved) {
    ThreadSafeQueue<std::unique_ptr<int>> q;
    q.push(std::make_unique<int>(42));
    auto v = q.wait_and_pop();
    CHECK(v && *v && **v == 42);
    std::unique_ptr<int> out;
    q.push(std::make_unique<int>(7));
    CHECK(q.try_pop(out) && *out == 7);
}

TEST(strings_across_threads) {
    ThreadSafeQueue<std::string> q;
    std::size_t chars = 0;
    {
        ThreadGroup g;
        g.add(std::thread([&] { for (int i = 0; i < 10'000; ++i) q.push(std::string(10, 'x')); q.shutdown(); }));
        g.add(std::thread([&] { while (auto s = q.wait_and_pop()) chars += s->size(); }));
    }
    CHECK(chars == 100'000);
}

TEST(int_matrix_four_by_four) {
    ThreadSafeQueue<int> queue;
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
            for (int p = 0; p < 4; ++p)
                producers.add(std::thread([&] { for (int i = 0; i < N; ++i) queue.push(i); }));
        }
        queue.shutdown();
    }
    CHECK(total == 4LL * N * (N - 1) / 2);
}

TEST(move_all_to_with_unique_ptr) {
    ThreadSafeQueue<std::unique_ptr<int>> a, b;
    a.push(std::make_unique<int>(1));
    a.push(std::make_unique<int>(2));
    a.move_all_to(b);
    CHECK(a.empty() && b.size() == 2);
}

int main() { return run_all(); }
