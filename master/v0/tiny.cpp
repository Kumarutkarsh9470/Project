// v0 tiny example: what does a second thread buy us?
//   tiny          two sleeping tasks, sequential vs on threads
//   tiny burn     the same total CPU work split over 1, 2, cores, 4x cores threads
#include <cstdint>
#include <cstring>
#include <iostream>
#include <thread>
#include <vector>
#include "stopwatch.hpp"
using namespace std::chrono_literals;

void taskA() { std::this_thread::sleep_for(2s); }
void taskB() { std::this_thread::sleep_for(2s); }

std::uint64_t burn(std::uint64_t n) {
    std::uint64_t s = 0;
    for (std::uint64_t i = 0; i < n; ++i) s += i % 7;
    return s;
}

int main(int argc, char** argv) {
    if (argc > 1 && std::strcmp(argv[1], "burn") == 0) {
        const std::uint64_t total = 2'000'000'000;
        unsigned cores = std::thread::hardware_concurrency();
        if (cores == 0) cores = 4;
        for (unsigned k : {1u, 2u, cores, 4 * cores}) {
            std::vector<std::uint64_t> out(k);
            Stopwatch sw;
            {
                std::vector<std::thread> ts;
                for (unsigned i = 0; i < k; ++i)
                    ts.emplace_back([&out, i, k, total] { out[i] = burn(total / k); });
                for (auto& t : ts) t.join();
            }
            std::cout << k << " threads: " << sw.seconds() << " s\n";
        }
        return 0;
    }
    Stopwatch sw;
    taskA(); taskB();
    std::cout << "sequential: " << sw.seconds() << " s\n";
    sw.reset();
    std::thread t1(taskA), t2(taskB);
    t1.join(); t2.join();
    std::cout << "two threads: " << sw.seconds() << " s\n";
}
