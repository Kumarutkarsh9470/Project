// v3 tiny example 1: the lock that never unlocks.
// Prints 0: the exception skipped unlock(). (Deliberately broken program.)
#include <iostream>
#include <mutex>
#include <stdexcept>
#include <thread>

std::mutex m;
void do_something() { throw std::runtime_error("oops"); }

void worker_manual() {
    m.lock();
    do_something();
    m.unlock();                         // never reached
}

int main() {
    try { worker_manual(); } catch (...) {}
    std::thread t([] {
        std::cout << "try_lock after the exception: " << m.try_lock() << '\n';
    });
    t.join();
    std::cout << "Fix: std::lock_guard<std::mutex> lock(m); unlocks in its destructor.\n";
}
