#pragma once
// v11 · Atomics
// The pool counts submitted and completed tasks with std::atomic, so a
// monitoring thread can read the numbers without touching any lock.
// memory_order_relaxed: each counter is exact on its own, but the two
// are not updated together, so the difference is only a snapshot.
#include <atomic>
#include <chrono>
#include <cstddef>
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
    std::atomic<std::size_t> submitted{0};
    std::atomic<std::size_t> completed{0};
    ThreadGroup workers;                  // destroyed (joined) first

    void run(Task& t) {
        t();
        completed.fetch_add(1, std::memory_order_relaxed);
    }

    void work() {
        while (auto task = tasks.wait_and_pop())
            run(*task);
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
        submitted.fetch_add(1, std::memory_order_relaxed);
        return result;
    }

    template <class T>
    T wait_helping(std::future<T>& f) {   // use in tasks, not get()
        using namespace std::chrono_literals;
        while (f.wait_for(0s) != std::future_status::ready) {
            Task t;
            if (tasks.try_pop(t))
                run(t);                   // help: run a queued task
            else
                std::this_thread::yield();
        }
        return f.get();
    }

    std::size_t tasks_submitted() const {
        return submitted.load(std::memory_order_relaxed);
    }

    std::size_t tasks_completed() const {
        return completed.load(std::memory_order_relaxed);
    }

    ~ThreadPool() {
        tasks.shutdown();                 // then ~workers joins them
    }
};
