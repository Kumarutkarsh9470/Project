// v2 SHOULD FAIL: a consumer starts before the producer.
// pop() throws "empty" while holding the mutex, so unlock() never runs.
// The retry locks a mutex this thread already owns (undefined behaviour,
// in practice a hang) and the producer blocks forever. Ctrl+C to stop.
// That's v3's problem: RAII locks.
#include <iostream>
#include "queue.hpp"
#include "thread_group.hpp"

int main() {
    Queue queue;
    ThreadGroup g;
    g.add(std::thread([&queue] {
        int got = 0;
        while (got < 10) {
            try { queue.pop(); ++got; }
            catch (const std::runtime_error&) { /* empty: try again */ }
        }
        std::cout << "consumer finished\n";
    }));
    std::this_thread::sleep_for(std::chrono::milliseconds(50));
    g.add(std::thread([&queue] { producer(queue, 10); std::cout << "producer finished\n"; }));
    std::cout << "waiting... (if nothing prints, the program is frozen)\n";
}
