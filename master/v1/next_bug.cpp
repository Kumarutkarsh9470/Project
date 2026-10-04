// v1 SHOULD FAIL: four producers push into the unsafe queue at once.
// Verified with GCC 16: N = 1,000 looked correct 8 times out of 8;
// N = 100,000 crashed or hung on every run. That's v2's problem.
#include <cstdlib>
#include <iostream>
#include "queue.hpp"
#include "thread_group.hpp"

int main(int argc, char** argv) {
    const int N = argc > 1 ? std::atoi(argv[1]) : 100'000;
    Queue queue;
    {
        ThreadGroup g;
        for (int i = 0; i < 4; ++i)
            g.add(std::thread(producer, std::ref(queue), N));
    }
    std::cout << "expected " << 4 * N << ", got " << queue.size() << '\n';
}
