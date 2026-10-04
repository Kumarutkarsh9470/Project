// v1 must-pass tests: threads that are passed the queue correctly
// and are always joined.
#include <stdexcept>
#include "check.hpp"
#include "queue.hpp"
#include "thread_group.hpp"

TEST(producer_then_consumer_threads) {
    Queue queue;
    const int N = 1'000'000;
    {
        ThreadGroup g;
        g.add(std::thread(producer, std::ref(queue), N));
    }                                   // joined here
    CHECK(queue.size() == std::size_t(N));
    {
        ThreadGroup g;
        g.add(std::thread(consumer, std::ref(queue), N));
    }
    CHECK(queue.size() == 0);
}

TEST(exception_still_joins) {
    Queue queue;
    bool caught = false;
    try {
        ThreadGroup g;
        g.add(std::thread(producer, std::ref(queue), 1000));
        throw std::runtime_error("report file missing");
    } catch (const std::runtime_error&) {
        caught = true;                  // ~ThreadGroup joined first
    }
    CHECK(caught);
    CHECK(queue.size() == 1000);
}

int main() { return run_all(); }
