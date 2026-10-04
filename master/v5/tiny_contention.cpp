// v5 tiny example 1: lock per item, or lock once?
// Build at -O2. Both are correct; compare the times.
#include <iostream>
#include <mutex>
#include <thread>
#include <vector>
#include "stopwatch.hpp"

int main() {
    const int N = 1'000'000;
    for (int version = 0; version < 2; ++version) {
        std::mutex m;
        long long total = 0;
        Stopwatch sw;
        std::vector<std::thread> ts;
        for (int t = 0; t < 4; ++t)
            ts.emplace_back([&] {
                if (version == 0) {
                    for (int x = 0; x < N; ++x) { std::lock_guard<std::mutex> l(m); total += x; }
                } else {
                    long long local = 0;
                    for (int x = 0; x < N; ++x) local += x;
                    std::lock_guard<std::mutex> l(m);
                    total += local;
                }
            });
        for (auto& t : ts) t.join();
        std::cout << (version == 0 ? "A lock per item: " : "B lock once:     ")
                  << total << "  " << sw.seconds() * 1000 << " ms\n";
    }
}
