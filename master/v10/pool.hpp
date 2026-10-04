#pragma once
// v10 · Future-based results
// submit() wraps the callable in a packaged_task and returns its
// future: the caller gets the value, or the exception rethrown by
// get(). wait_helping() runs queued tasks while it waits, so tasks
// can wait for tasks they submitted.
#include <chrono>
#include <functional>
#include <future>
#include <memory>
#include <stdexcept>
#include <thread>
#include "queue.hpp"
#include "thread_group.hpp"

using Task = std::function<void()>;

inline unsigned default_workers() {
    unsigned n = std::thread::hardware_concurrency();
    return n == 0 ? 4 : n;                // 0 means "unknown"
}

class ThreadPool {
    ThreadSafeQueue<Task> tasks;          // destroyed last
    ThreadGroup workers;                  // destroyed (joined) first

    void work() {
        while (auto task = tasks.wait_and_pop())
            (*task)();              // the future stores exceptions
    }

public:
    explicit ThreadPool(unsigned n = default_workers()) {
        for (unsigned i = 0; i < n; ++i)
            workers.add(std::thread([this] { work(); }));
    }

    template <class F>
    auto submit(F f) -> std::future<decltype(f())> {
        using R = decltype(f());
        using Job = std::packaged_task<R()>;   // move-only, so shared
        auto job = std::make_shared<Job>(std::move(f));
        std::future<R> result = job->get_future();
        if (!tasks.push([job] { (*job)(); }))
            throw std::runtime_error("submit() after shutdown");
        return result;
    }

    template <class T>
    T wait_helping(std::future<T>& f) {   // use instead of get()
        using namespace std::chrono_literals;
        while (f.wait_for(0s) != std::future_status::ready) {
            Task t;
            if (tasks.try_pop(t))
                t();                      // help: run a queued task
            else
                std::this_thread::yield();
        }
        return f.get();
    }

    ~ThreadPool() {
        tasks.shutdown();           // then ~workers joins them all
    }
};

inline ThreadPool& default_pool() {
    static ThreadPool pool;               // built once, thread-safely
    return pool;
}
