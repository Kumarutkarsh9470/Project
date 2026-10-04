// v11 tiny example 1: the v2 counter, fixed three ways. Build at -O2.
//   no lock          wrong (and a data race: undefined behaviour)
//   std::mutex       correct, slowest
//   std::atomic      correct: fetch_add is one indivisible read-add-write
#include <atomic>
#include <iostream>
#include <mutex>
#include <thread>
#include "stopwatch.hpp"

int plain = 0;
std::mutex m;
int locked = 0;
std::atomic<int> atomic_counter{0};

template <class F>
void run(const char* name, F body, const int& result_ref) {
    Stopwatch sw;
    std::thread a(body), b(body);
    a.join();
    b.join();
    std::cout << name << result_ref << "   (" << sw.seconds() * 1000 << " ms)\n";
}

int main() {
    const int N = 1'000'000;
    run("no lock:     ", [] {
        for (int i = 0; i < N; ++i)
            ++plain;
    }, plain);
    run("std::mutex:  ", [] {
        for (int i = 0; i < N; ++i) {
            std::lock_guard<std::mutex> lock(m);
            ++locked;
        }
    }, locked);
    Stopwatch sw;
    std::thread a([] {
        for (int i = 0; i < N; ++i)
            atomic_counter.fetch_add(1, std::memory_order_relaxed);
    });
    std::thread b([] {
        for (int i = 0; i < N; ++i)
            atomic_counter.fetch_add(1, std::memory_order_relaxed);
    });
    a.join();
    b.join();
    std::cout << "std::atomic: " << atomic_counter.load() << "   (" << sw.seconds() * 1000 << " ms)\n";
}
