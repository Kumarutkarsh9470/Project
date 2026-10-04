// v11 SHOULD FAIL (to scale): every push and every pop takes the SAME mutex.
// Producers and consumers wait for each other even though they touch
// opposite ends of the queue. Compare 1x1 with 4x4 throughput.
// That's v12's problem: one lock for the head, one for the tail.
#include <iostream>
#include <vector>
#include "queue.hpp"
#include "stopwatch.hpp"
#include "thread_group.hpp"

double run(int producers, int consumers, int per_producer) {
    ThreadSafeQueue<int> q;
    Stopwatch sw;
    {
        ThreadGroup cons;
        for (int c = 0; c < consumers; ++c)
            cons.add(std::thread([&] {
                while (q.wait_and_pop()) {}
            }));
        {
            ThreadGroup prod;
            for (int p = 0; p < producers; ++p)
                prod.add(std::thread([&] {
                    for (int i = 0; i < per_producer; ++i)
                        q.push(i);
                }));
        }
        q.shutdown();
    }
    return sw.seconds();
}

int main() {
    const int total = 4'000'000;
    for (int k : {1, 2, 4, 8}) {
        double s = run(k, k, total / k);
        std::cout << k << " producers x " << k << " consumers: "
                  << total / s / 1e6 << " M items/s\n";
    }
}
