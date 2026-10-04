#pragma once
// v8 · Task queue
// The queue carries work: std::function<void()>. One worker thread
// runs tasks in order. A throwing task is caught in the worker (an
// exception can't cross threads by itself), so it can't kill it.
#include <exception>
#include <functional>
#include <thread>
#include "queue.hpp"

using Task = std::function<void()>;
using ErrorHandler = std::function<void(std::exception_ptr)>;

inline void ignore_error(std::exception_ptr) {}

class TaskQueue {
    ThreadSafeQueue<Task> tasks;
    ErrorHandler on_error;
    std::thread worker;

    void work() {                         // v6's consumer loop
        while (auto task = tasks.wait_and_pop()) {
            try {
                (*task)();
            } catch (...) {
                on_error(std::current_exception());
            }
        }
    }

public:
    explicit TaskQueue(ErrorHandler handler = ignore_error)
        : on_error(std::move(handler)) {
        worker = std::thread([this] { work(); });
    }

    TaskQueue(const TaskQueue&) = delete;
    TaskQueue& operator=(const TaskQueue&) = delete;

    bool submit(Task t) {
        return tasks.push(std::move(t));
    }

    ~TaskQueue() {
        tasks.shutdown();                 // drain, then the worker leaves
        worker.join();
    }
};
