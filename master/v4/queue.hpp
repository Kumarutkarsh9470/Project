#pragma once
// v4 · condition_variable
// wait_and_pop() sleeps until a push. cv.wait() releases the mutex
// while asleep; the predicate re-checks the queue.
#include <condition_variable>
#include <cstddef>
#include <mutex>
#include <queue>

class Queue {
    std::queue<int> q;                    // guarded by m
    mutable std::mutex m;
    std::condition_variable cv;

public:
    void push(int x) {
        {
            std::lock_guard<std::mutex> lock(m);
            q.push(x);
        }
        cv.notify_one();                  // wake one waiter
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
