// v5 tiny example 2: manufacture a deadlock. Hangs every time. Ctrl+C.
//   tiny_deadlock        t1 locks m1 then m2, t2 locks m2 then m1
//   tiny_deadlock fixed  t2 uses std::scoped_lock(m2, m1)
#include <cstring>
#include <iostream>
#include <mutex>
#include <thread>
using namespace std::chrono_literals;

std::mutex m1, m2;

void t1() {
    std::lock_guard<std::mutex> a(m1);
    std::this_thread::sleep_for(10ms);
    std::lock_guard<std::mutex> b(m2);
}
void t2_broken() {
    std::lock_guard<std::mutex> a(m2);
    std::this_thread::sleep_for(10ms);
    std::lock_guard<std::mutex> b(m1);
}
void t2_fixed() {
    std::this_thread::sleep_for(10ms);
    std::scoped_lock lock(m2, m1);      // takes both, in any order, safely
}

int main(int argc, char** argv) {
    bool fixed = argc > 1 && std::strcmp(argv[1], "fixed") == 0;
    std::thread a(t1), b(fixed ? t2_fixed : t2_broken);
    std::cout << (fixed ? "fixed version: " : "broken version: frozen if nothing follows...\n");
    a.join(); b.join();
    std::cout << "finished\n";
}
