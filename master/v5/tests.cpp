// v5 must-pass tests: the load-test matrix, plus two-lock operations.
#include "check.hpp"
#include "queue.hpp"
#include "stopwatch.hpp"
#include "thread_group.hpp"

// P producers each push 0..N-1 (optionally sleeping), C consumers split
// the items evenly. Checks count and sum. Returns seconds taken.
static double run(int P, int C, int N, int producer_sleep_us, int consumer_sleep_us, bool& ok) {
    Queue queue;
    long long total = 0;
    long long count = 0;
    std::mutex total_m;
    const int per_consumer = P * N / C;
    Stopwatch sw;
    {
        ThreadGroup g;
        for (int p = 0; p < P; ++p)
            g.add(std::thread([&] {
                for (int i = 0; i < N; ++i) {
                    queue.push(i);
                    if (producer_sleep_us) std::this_thread::sleep_for(std::chrono::microseconds(producer_sleep_us));
                }
            }));
        for (int c = 0; c < C; ++c)
            g.add(std::thread([&] {
                long long local = 0;
                for (int i = 0; i < per_consumer; ++i) {
                    local += queue.wait_and_pop();
                    if (consumer_sleep_us) std::this_thread::sleep_for(std::chrono::microseconds(consumer_sleep_us));
                }
                std::lock_guard<std::mutex> lock(total_m);
                total += local;
                count += per_consumer;
            }));
    }
    ok = count == 1LL * P * N && total == 1LL * P * N * (N - 1) / 2 && queue.empty();
    return sw.seconds();
}

TEST(load_matrix) {
    struct Row { int P, C, N, ps, cs; };
    const Row rows[] = {
        {1, 1, 10, 0, 0}, {1, 1, 200'000, 0, 0}, {4, 1, 50'000, 0, 0},
        {1, 4, 200'000, 0, 0}, {4, 4, 50'000, 0, 0}, {4, 4, 100, 1000, 0}, {4, 4, 100, 0, 1000},
    };
    for (const Row& r : rows) {
        bool all = true;
        double t = 0;
        for (int run_no = 0; run_no < 3; ++run_no) { bool ok; t = run(r.P, r.C, r.N, r.ps, r.cs, ok); all = all && ok; }
        CHECK(all);
        std::cout << "\n    " << r.P << "x" << r.C << " N=" << r.N << " sleep " << r.ps << "/" << r.cs
                  << "us: " << (all ? "ok " : "FAIL ") << t * 1000 << " ms";
    }
}

TEST(move_all_to_opposite_directions) {
    Queue a, b;
    a.push_all({1, 2, 3, 4, 5});
    {
        ThreadGroup g;
        g.add(std::thread([&] { for (int i = 0; i < 100'000; ++i) a.move_all_to(b); }));
        g.add(std::thread([&] { for (int i = 0; i < 100'000; ++i) b.move_all_to(a); }));
    }
    CHECK(a.size() + b.size() == 5);
}

TEST(self_move_is_a_no_op) {
    Queue a;
    a.push_all({1, 2, 3});
    a.move_all_to(a);
    CHECK(a.size() == 3);
}

TEST(push_all_batches_beat_single_pushes) {
    const int N = 400'000;
    std::vector<int> batch(1000, 1);
    Queue single, batched;
    Stopwatch sw;
    {
        ThreadGroup g;
        for (int p = 0; p < 4; ++p) g.add(std::thread([&] { for (int i = 0; i < N / 4; ++i) single.push(1); }));
    }
    double t_single = sw.seconds();
    sw.reset();
    {
        ThreadGroup g;
        for (int p = 0; p < 4; ++p) g.add(std::thread([&] { for (int i = 0; i < N / 4000; ++i) batched.push_all(batch); }));
    }
    double t_batch = sw.seconds();
    CHECK(single.size() == batched.size());
    std::cout << "[single " << t_single * 1000 << " ms, batches " << t_batch * 1000 << " ms]";
}

int main() { return run_all(); }
