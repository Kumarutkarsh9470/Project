// v8 SHOULD FAIL: the submitter can't get a result or an error back.
// std::function<void()> happily accepts a lambda that returns 42 and
// silently throws the 42 away. A failing task is logged by the worker,
// but the code that submitted it never finds out. That's v10's problem
// (v9 first adds more workers).
#include <iostream>
#include <stdexcept>
#include "task_queue.hpp"

int main() {
    TaskQueue tq([](std::exception_ptr) { std::cout << "(worker logged an error)\n"; });
    tq.submit([] { return 6 * 7; });            // compiles; where does 42 go?
    tq.submit([] { throw std::runtime_error("bad task"); });
    std::cout << "submitted both. The 42 is gone, and main can't tell a task failed.\n";
}
