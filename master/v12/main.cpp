// v12: the two-lock queue with 4 producers and 4 consumers.
#include <atomic>
#include <iostream>
#include "thread_group.hpp"
#include "two_lock_queue.hpp"

int main() {
    TwoLockQueue<int> q;
    const int n = 100'000;
    std::atomic<long long> sum{0};
    {
        ThreadGroup consumers;
        for (int i = 0; i < 4; ++i)
            consumers.add(std::thread([&] {
                while (auto x = q.wait_and_pop())
                    sum += *x;
            }));
        {
            ThreadGroup producers;
            for (int i = 0; i < 4; ++i)
                producers.add(std::thread([&] {
                    for (int k = 0; k < n; ++k) q.push(k);
                }));
        }
        q.shutdown();
    }
    std::cout << "sum " << sum << " (expected "
              << 4LL * n * (n - 1) / 2 << ")\n";
}
