// v8: hand work to one worker thread.
#include <iostream>
#include <stdexcept>
#include "task_queue.hpp"

int main() {
    TaskQueue tq([](std::exception_ptr e) {   // error handler
        try { std::rethrow_exception(e); }
        catch (const std::exception& ex) {
            std::cout << "task failed: " << ex.what() << '\n';
        }
    });
    tq.submit([] { std::cout << "task 1\n"; });
    tq.submit([] { throw std::runtime_error("disk full"); });
    tq.submit([] { std::cout << "task 3 still runs\n"; });
}   // ~TaskQueue: drain, then join the worker
