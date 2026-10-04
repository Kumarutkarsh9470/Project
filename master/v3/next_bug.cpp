// v3 SHOULD FAIL: an idle consumer spinning on try_pop() burns a core.
// Counts how many times it checked an empty queue in one second.
// That's v4's problem: let the consumer sleep until a push.
#include <iostream>
#include "queue.hpp"
#include "stopwatch.hpp"

int main() {
    Queue queue;
    long long spins = 0;
    int x;
    Stopwatch sw;
    while (sw.seconds() < 1.0)
        if (!queue.try_pop(x)) ++spins;
    std::cout << "checked an empty queue " << spins << " times in 1 s\n";
}
