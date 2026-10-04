// v2 tiny example: the counter that can't count.
// Build at -O0 to see lost updates (at -O2 the loop may collapse into one add).
//   tiny          no lock: 5 runs, different wrong answers
//   tiny mutex    lock per increment
//   tiny local    sum locally, lock once
#include <cstring>
#include <iostream>
#include <mutex>
#include <thread>
#include "stopwatch.hpp"

int counter = 0;
std::mutex m;

void racy()  { for (int i = 0; i < 1'000'000; ++i) ++counter; }
void locked() {
    for (int i = 0; i < 1'000'000; ++i) { m.lock(); ++counter; m.unlock(); }
}
void local() {
    int mine = 0;
    for (int i = 0; i < 1'000'000; ++i) ++mine;
    std::lock_guard<std::mutex> lock(m);
    counter += mine;
}

int main(int argc, char** argv) {
    const char* mode = argc > 1 ? argv[1] : "race";
    void (*fn)() = racy;
    if (std::strcmp(mode, "mutex") == 0) fn = locked;
    if (std::strcmp(mode, "local") == 0) fn = local;
    for (int run = 0; run < 5; ++run) {
        counter = 0;
        Stopwatch sw;
        std::thread t1(fn), t2(fn);
        t1.join(); t2.join();
        std::cout << mode << ": " << counter << "  (" << sw.seconds() * 1000 << " ms)\n";
    }
}
