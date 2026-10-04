// v4: the consumer starts first and sleeps inside
// wait_and_pop() until the producer pushes.
#include <functional>
#include <iostream>
#include "queue.hpp"
#include "thread_group.hpp"

int main() {
    Queue q;
    const int n = 1'000'000;
    long long sum = 0;
    {
        ThreadGroup g;
        g.add(std::thread([&] {          // consumer
            for (int i = 0; i < n; ++i)
                sum += q.wait_and_pop();
        }));
        g.add(std::thread(producer, std::ref(q), n));
    }
    std::cout << "sum " << sum << " (expected "
              << 1LL * n * (n - 1) / 2 << ")\n";
}
