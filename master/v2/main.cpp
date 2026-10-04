// v2: four producers push into one queue at the same time.
// The mutex inside push() makes them take turns.
#include <functional>
#include <iostream>
#include "queue.hpp"
#include "thread_group.hpp"

int main() {
    Queue q;
    const int producers = 4, n = 100'000;
    {
        ThreadGroup g;
        for (int p = 0; p < producers; ++p)
            g.add(std::thread(producer, std::ref(q), n));
    }
    std::cout << "expected " << producers * n
              << ", queue has " << q.size() << '\n';
}
