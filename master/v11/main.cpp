// v11: counters any thread can read without a lock.
#include <iostream>
#include <vector>
#include "pool.hpp"

int main() {
    ThreadPool pool(4);
    std::vector<std::future<int>> fs;
    for (int i = 0; i < 1000; ++i)
        fs.push_back(pool.submit([i] { return i; }));

    long long sum = 0;
    for (auto& f : fs)
        sum += f.get();

    std::cout << "sum " << sum << '\n'
              << "submitted " << pool.tasks_submitted() << '\n'
              << "completed " << pool.tasks_completed() << '\n';
}
