// v5: 4 producers and 4 consumers, then move_all_to().
#include <atomic>
#include <functional>
#include <iostream>
#include <vector>
#include "queue.hpp"
#include "thread_group.hpp"

int main() {
    Queue q;
    const int p = 4, c = 4, n = 100'000;
    std::atomic<long long> sum{0};
    {
        ThreadGroup g;
        for (int i = 0; i < c; ++i)
            g.add(std::thread([&] {
                for (int k = 0; k < n; ++k)
                    sum += q.wait_and_pop();
            }));
        for (int i = 0; i < p; ++i)
            g.add(std::thread(producer, std::ref(q), n));
    }
    std::cout << "sum " << sum << " (expected "
              << 4LL * n * (n - 1) / 2 << ")\n";

    Queue a, b;
    a.push_all(std::vector<int>{1, 2, 3});
    a.move_all_to(b);                    // both locks at once
    std::cout << "a: " << a.size() << ", b: " << b.size() << '\n';
}
