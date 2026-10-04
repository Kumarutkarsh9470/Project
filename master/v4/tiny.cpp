// v4 tiny example: three ways to wait.
//   tiny spin     spin on try_pop for 1 s: counts wasted checks
//   tiny nap      nap 10 ms between checks: measures delivery latency
//   tiny locked   spin INSIDE the locked wait: deadlock (Ctrl+C)
#include <cstring>
#include <iostream>
#include <mutex>
#include <queue>
#include <thread>
#include "stopwatch.hpp"
using namespace std::chrono_literals;

std::queue<int> q;
std::mutex m;

bool try_pop(int& x) {
    std::lock_guard<std::mutex> lock(m);
    if (q.empty())
        return false;
    x = q.front();
    q.pop();
    return true;
}

void push(int x) {
    std::lock_guard<std::mutex> lock(m);
    q.push(x);
}

int locked_wait_and_pop() {
    std::lock_guard<std::mutex> lock(m);
    while (q.empty()) { }               // waits while HOLDING m
    int x = q.front();
    q.pop();
    return x;
}

int main(int argc, char** argv) {
    const char* mode = argc > 1 ? argv[1] : "";
    int x;
    if (std::strcmp(mode, "spin") == 0) {
        long long spins = 0;
        Stopwatch sw;
        while (sw.seconds() < 1.0) if (!try_pop(x)) ++spins;
        std::cout << spins << " wasted checks in 1 s (one core at 100%)\n";
    } else if (std::strcmp(mode, "nap") == 0) {
        Stopwatch sw;
        std::thread p([] { std::this_thread::sleep_for(3ms); push(1); });
        while (!try_pop(x)) std::this_thread::sleep_for(10ms);
        std::cout << "pushed at ~3 ms, consumer saw it at " << sw.seconds() * 1000 << " ms\n";
        p.join();
    } else if (std::strcmp(mode, "locked") == 0) {
        std::thread c([] { std::cout << locked_wait_and_pop() << '\n'; });
        std::this_thread::sleep_for(50ms);
        std::cout << "producer trying to push... (frozen if nothing follows)\n";
        push(1);
        c.join();
    } else {
        std::cout << "usage: tiny spin | nap | locked\n";
    }
}
