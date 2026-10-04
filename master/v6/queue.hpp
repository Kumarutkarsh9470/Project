#pragma once
// v6 · Graceful shutdown
// RUNNING -> CLOSED -> DRAINED. shutdown() sets closed under the lock
// and wakes every waiter; wait_and_pop() then returns nullopt.
#include <condition_variable>
#include <cstddef>
#include <mutex>
#include <optional>
#include <queue>
#include <vector>

class Queue {
    std::queue<int> q;                    // guarded by m
    mutable std::mutex m;
    std::condition_variable cv;
    bool closed = false;                  // guarded by m

    void push_locked(int x) {             // caller holds m
        q.push(x);
    }

public:
    bool push(int x) {                    // false after shutdown()
        {
            std::lock_guard<std::mutex> lock(m);
            if (closed)
                return false;
            push_locked(x);
        }
        cv.notify_one();
        return true;
    }

    bool push_all(const std::vector<int>& xs) {
        {
            std::lock_guard<std::mutex> lock(m);
            if (closed)
                return false;
            for (int x : xs)
                push_locked(x);           // not push(): m is held
        }
        cv.notify_all();
        return true;
    }

    bool try_pop(int& out) {
        std::lock_guard<std::mutex> lock(m);
        if (q.empty())
            return false;
        out = q.front();
        q.pop();
        return true;
    }

    std::optional<int> wait_and_pop() {
        std::unique_lock<std::mutex> lock(m);
        cv.wait(lock, [&] { return !q.empty() || closed; });
        if (q.empty())                    // closed and drained
            return std::nullopt;
        int x = q.front();
        q.pop();
        return x;
    }

    void move_all_to(Queue& other) {
        if (this == &other)               // locking m twice is UB
            return;
        {
            std::scoped_lock lock(m, other.m);   // both, deadlock-free
            while (!q.empty()) {
                other.q.push(q.front());
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
        cv.notify_all();                  // every waiter must wake
    }

    bool empty() const {                  // a snapshot only
        std::lock_guard<std::mutex> lock(m);
        return q.empty();
    }

    std::size_t size() const {
        std::lock_guard<std::mutex> lock(m);
        return q.size();
    }
};

inline void producer(Queue& q, int n) {
    for (int i = 0; i < n; ++i)
        q.push(i);
}

inline void handle(int) {}               // stand-in for real work

inline void consumer(Queue& q) {        // until closed and drained
    while (auto x = q.wait_and_pop())
        handle(*x);
}
