#pragma once
// v9 · Thread pool
// N workers share one task queue. tasks is declared first, so it is
// destroyed last; workers is declared last, so it is joined first.
#include <exception>
#include <functional>
#include <thread>
#include "queue.hpp"
#include "thread_group.hpp"

using Task = std::function<void()>;
// Called from worker threads, so it must be thread-safe.
using ErrorHandler = std::function<void(std::exception_ptr)>;

inline void ignore_error(std::exception_ptr) {}

inline unsigned default_workers() {
    unsigned n = std::thread::hardware_concurrency();
    return n == 0 ? 4 : n;                // 0 means "unknown"
}

class ThreadPool {
    ThreadSafeQueue<Task> tasks;          // destroyed last
    ErrorHandler on_error;
    ThreadGroup workers;                  // destroyed (joined) first

    void work() {
        while (auto task = tasks.wait_and_pop()) {
            try {
                (*task)();
            } catch (...) {
                on_error(std::current_exception());
            }
        }
    }

public:
    explicit ThreadPool(unsigned n = default_workers(),
                        ErrorHandler handler = ignore_error)
        : on_error(std::move(handler)) {
        for (unsigned i = 0; i < n; ++i)
            workers.add(std::thread([this] { work(); }));
    }

    bool submit(Task t) {
        return tasks.push(std::move(t));
    }

    ~ThreadPool() {
        tasks.shutdown();                 // then ~workers joins them all
    }
};

inline ThreadPool& default_pool() {
    static ThreadPool pool;               // built once, thread-safely
    return pool;
}
