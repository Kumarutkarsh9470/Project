// v9 SHOULD FAIL: same gap as v8, now with N workers.
// submit() returns bool, so a task's value and its errors never reach
// the caller. That's v10's problem: future-based results.
#include <iostream>
#include <stdexcept>
#include "pool.hpp"

int main() {
    ThreadPool pool(4, [](std::exception_ptr) { std::cout << "(a worker logged an error)\n"; });
    pool.submit([] { return 6 * 7; });           // the 42 is thrown away
    pool.submit([] { throw std::runtime_error("bad task"); });
    std::cout << "how would main get the 42, or learn that a task failed?\n";
}
