#pragma once
// v5 · Many producers and consumers
// push_all() takes the lock once per batch. move_all_to() needs two
// locks, taken together with scoped_lock.
#include <condition_variable>
#include <cstddef>
#include <mutex>
#include <queue>
#include <vector>

class Queue {
    std::queue<int> q;                    // guarded by m
    mutable std::mutex m;
    std::condition_variable cv;

    void push_locked(int x) {             // caller holds m
        q.push(x);
    }

public:
    void push(int x) {
        {
            std::lock_guard<std::mutex> lock(m);
            push_locked(x);
        }
        cv.notify_one();
    }

    void push_all(const std::vector<int>& xs) {
        {
            std::lock_guard<std::mutex> lock(m);
            for (int x : xs)
                push_locked(x);           // not push(): m is held
        }
        cv.notify_all();
    }

    bool try_pop(int& out) {
        std::lock_guard<std::mutex> lock(m);
        if (q.empty())
            return false;
        out = q.front();
        q.pop();
        return true;
    }

    int wait_and_pop() {
        std::unique_lock<std::mutex> lock(m);
        cv.wait(lock, [&] { return !q.empty(); });
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

inline void consumer(Queue& q, int n) { // sleeps while empty
    for (int i = 0; i < n; ++i)
        q.wait_and_pop();
}
