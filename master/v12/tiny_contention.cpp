// v12 tiny example: does a second lock help? Build at -O2.
// 1 producer + 1 consumer move 4,000,000 ints through each queue.
// With one mutex they take turns; with two they can overlap, but every
// push now allocates a node. Measure before believing either story.
#include <iostream>
#include "queue.hpp"
#include "stopwatch.hpp"
#include "thread_group.hpp"
#include "two_lock_queue.hpp"

template <class Q>
double run(int producers, int consumers, int total) {
    Q q;
    Stopwatch sw;
    {
        ThreadGroup cons;
        for (int c = 0; c < consumers; ++c)
            cons.add(std::thread([&] { while (q.wait_and_pop()) {} }));
        {
            ThreadGroup prod;
            for (int p = 0; p < producers; ++p)
                prod.add(std::thread([&] { for (int i = 0; i < total / producers; ++i) q.push(i); }));
        }
        q.shutdown();
    }
    return total / sw.seconds() / 1e6;
}

int main() {
    const int total = 4'000'000;
    for (int k : {1, 4}) {
        std::cout << k << "x" << k << "  one mutex: " << run<ThreadSafeQueue<int>>(k, k, total)
                  << " M/s   two locks: " << run<TwoLockQueue<int>>(k, k, total) << " M/s\n";
    }
}
