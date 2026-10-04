// v9 tiny example 1: how many workers? Build at -O2.
// 64 sleepy tasks vs 64 CPU-bound tasks on pools of different sizes.
#include <cstdint>
#include <iostream>
#include "pool.hpp"
#include "stopwatch.hpp"
using namespace std::chrono_literals;

std::uint64_t burn(std::uint64_t n) {
    std::uint64_t s = 0;
    for (std::uint64_t i = 0; i < n; ++i) s += i % 7;
    return s;
}

int main() {
    unsigned cores = default_workers();
    for (unsigned w : {1u, 4u, cores, 64u}) {
        Stopwatch sw;
        { ThreadPool pool(w); for (int i = 0; i < 64; ++i) pool.submit([] { std::this_thread::sleep_for(100ms); }); }
        double sleepy = sw.seconds();
        sw.reset();
        { ThreadPool pool(w); for (int i = 0; i < 64; ++i) pool.submit([] { volatile auto r = burn(20'000'000); (void)r; }); }
        std::cout << w << " workers: sleepy " << sleepy << " s, busy " << sw.seconds() << " s\n";
    }
}
