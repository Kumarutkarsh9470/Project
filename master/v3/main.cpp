// v3: two consumers take items with try_pop(), which checks
// and removes under one lock, so neither can get an item twice.
#include <atomic>
#include <functional>
#include <iostream>
#include "queue.hpp"
#include "thread_group.hpp"

int main() {
    Queue q;
    const int n = 100'000;
    producer(q, n);                      // fill it first

    std::atomic<int> taken{0};
    auto take_all = [&] {
        int x;
        while (q.try_pop(x))             // false once empty
            ++taken;
    };
    {
        ThreadGroup g;
        g.add(std::thread(take_all));
        g.add(std::thread(take_all));
    }
    std::cout << "pushed " << n << ", taken " << taken << '\n';
}
