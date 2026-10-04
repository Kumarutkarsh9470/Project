#pragma once
// v7 · Generic queue<T>
// Values are moved in and out, so move-only types (unique_ptr, tasks)
// work and no item can be lost to a throwing copy.
#include <condition_variable>
#include <cstddef>
#include <mutex>
#include <optional>
#include <queue>
#include <utility>
#include <vector>

template <class T>
class ThreadSafeQueue {
    std::queue<T> q;                      // guarded by m
    mutable std::mutex m;
    std::condition_variable cv;
    bool closed = false;                  // guarded by m

    void push_locked(T v) {               // caller holds m
        q.push(std::move(v));
    }

public:
    bool push(T v) {                      // by value, then moved in
        {
            std::lock_guard<std::mutex> lock(m);
            if (closed)
                return false;
            push_locked(std::move(v));
        }
        cv.notify_one();
        return true;
    }

    bool push_all(std::vector<T> vs) {
        {
            std::lock_guard<std::mutex> lock(m);
            if (closed)
                return false;
            for (auto& v : vs)
                push_locked(std::move(v));
        }
        cv.notify_all();
        return true;
    }

    bool try_pop(T& out) {
        std::lock_guard<std::mutex> lock(m);
        if (q.empty())
            return false;
        out = std::move(q.front());
        q.pop();
        return true;
    }

    std::optional<T> wait_and_pop() {
        std::unique_lock<std::mutex> lock(m);
        cv.wait(lock, [&] { return !q.empty() || closed; });
        if (q.empty())                    // closed and drained
            return std::nullopt;
        T v = std::move(q.front());
        q.pop();
        return v;
    }

    void move_all_to(ThreadSafeQueue& other) {
        if (this == &other)
            return;
        {
            std::scoped_lock lock(m, other.m);
            while (!q.empty()) {
                other.q.push(std::move(q.front()));
                q.pop();
            }
        }
        other.cv.notify_all();
    }

    void shutdown() {
        {
            std::lock_guard<std::mutex> lock(m);
            closed = true;
        }
        cv.notify_all();
    }

    bool empty() const {
        std::lock_guard<std::mutex> lock(m);
        return q.empty();
    }

    std::size_t size() const {
        std::lock_guard<std::mutex> lock(m);
        return q.size();
    }
};
