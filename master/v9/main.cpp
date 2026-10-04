// v9: many workers share one task queue.
#include <chrono>
#include <iostream>
#include <mutex>
#include <thread>
#include <vector>
#include "pool.hpp"

int main() {
    std::mutex m;
    std::vector<int> results;            // guarded by m
    {
        ThreadPool pool(4);
        for (int i = 0; i < 16; ++i)
            pool.submit([&, i] {
                std::this_thread::sleep_for(
                    std::chrono::milliseconds(100));
                std::lock_guard<std::mutex> l(m);
                results.push_back(i * i);
            });
    }   // ~ThreadPool: run the rest, join the workers
    std::cout << results.size() << " results\n";
}
