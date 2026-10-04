// v8 must-pass tests: tasks run in order; a throwing task can't kill the worker.
#include <stdexcept>
#include <string>
#include <vector>
#include "check.hpp"
#include "task_queue.hpp"

TEST(ten_thousand_tasks_in_order) {
    std::vector<int> seen;              // only the single worker touches it
    {
        TaskQueue tq;
        for (int i = 0; i < 10'000; ++i)
            tq.submit([&seen, i] { seen.push_back(i); });
    }                                   // ~TaskQueue drains and joins
    bool in_order = seen.size() == 10'000;
    for (int i = 0; in_order && i < 10'000; ++i) in_order = seen[i] == i;
    CHECK(in_order);
}

TEST(throwing_task_does_not_kill_the_worker) {
    std::string last_error;
    bool ran_after = false;
    {
        TaskQueue tq([&](std::exception_ptr e) {
            try { std::rethrow_exception(e); }
            catch (const std::exception& ex) { last_error = ex.what(); }
        });
        tq.submit([] { throw std::runtime_error("bad task"); });
        tq.submit([&] { ran_after = true; });
    }
    CHECK(last_error == "bad task");
    CHECK(ran_after);
}

TEST(capture_by_value_outlives_the_caller) {
    std::vector<int> out;
    {
        TaskQueue tq;
        auto submit_job = [&tq, &out] {
            int x = 5;                  // dies when submit_job returns
            tq.submit([&out, x] { out.push_back(x); });   // copy of x: safe
        };
        submit_job();
    }
    CHECK(out.size() == 1 && out[0] == 5);
}

int main() { return run_all(); }
