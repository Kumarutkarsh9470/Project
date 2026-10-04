// v9 tiny example 2: the pool that doesn't scale.
// 64 jobs of (30 ms "download" + 20 ms "calculation") on 8 workers.
//   A: lock held for the whole job     -> about 64 x 50 ms = 3.2 s
//   B: lock held only for push_back    -> about 3.2 s / 8  = 0.4 s
#include <iostream>
#include <mutex>
#include <vector>
#include "pool.hpp"
#include "stopwatch.hpp"
using namespace std::chrono_literals;

int main() {
    for (int version = 0; version < 2; ++version) {
        std::mutex results_m;
        std::vector<int> results;
        Stopwatch sw;
        {
            ThreadPool pool(8);
            for (int job = 0; job < 64; ++job)
                pool.submit([&, job, version] {
                    if (version == 0) {
                        std::lock_guard<std::mutex> lock(results_m);
                        std::this_thread::sleep_for(30ms);      // download
                        std::this_thread::sleep_for(20ms);      // calculate
                        results.push_back(job);
                    } else {
                        std::this_thread::sleep_for(30ms);
                        std::this_thread::sleep_for(20ms);
                        std::lock_guard<std::mutex> lock(results_m);
                        results.push_back(job);
                    }
                });
        }
        std::cout << (version == 0 ? "A lock everything: " : "B lock push_back:  ")
                  << sw.seconds() << " s (" << results.size() << " results)\n";
    }
}
