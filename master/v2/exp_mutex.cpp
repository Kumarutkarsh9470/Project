// v2 experiment: what a mutex does to two threads.
// Each thread locks m, stays inside for 0.5 s, then unlocks.
// Watch the times: the second thread only gets in after the first leaves.
#include <chrono>
#include <iomanip>
#include <iostream>
#include <mutex>
#include <thread>
#include "stopwatch.hpp"

std::mutex m;
std::mutex print_m;
Stopwatch sw;

void say(const char* who, const char* what) {
    std::lock_guard<std::mutex> l(print_m);
    std::cout << std::fixed << std::setprecision(3) << sw.seconds() << " s  " << who << " " << what << '\n';
}

void visit(const char* who) {
    say(who, "wants the mutex");
    m.lock();
    say(who, "is inside");
    std::this_thread::sleep_for(std::chrono::milliseconds(500));
    say(who, "leaves");
    m.unlock();
}

int main() {
    std::thread a(visit, "A"), b(visit, "B");
    a.join();
    b.join();
}
