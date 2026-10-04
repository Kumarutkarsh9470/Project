// v6 tiny example: one flag, two waiters.
//   tiny         notify_one: one waiter wakes, the other sleeps forever (Ctrl+C)
//   tiny fixed   notify_all: both wake
#include <condition_variable>
#include <cstring>
#include <iostream>
#include <mutex>
#include <thread>
using namespace std::chrono_literals;

int main(int argc, char** argv) {
    bool fixed = argc > 1 && std::strcmp(argv[1], "fixed") == 0;
    std::mutex m;
    std::condition_variable cv;
    bool ready = false;
    auto waiter = [&](int id) {
        std::unique_lock<std::mutex> lock(m);
        cv.wait(lock, [&] { return ready; });
        std::cout << "waiter " << id << " woke up\n";
    };
    std::thread a(waiter, 1), b(waiter, 2);
    std::this_thread::sleep_for(100ms);         // both are asleep now
    {
        std::lock_guard<std::mutex> lock(m);
        ready = true;
    }
    if (fixed) cv.notify_all(); else cv.notify_one();
    a.join(); b.join();
    std::cout << "both finished\n";
}
