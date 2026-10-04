#pragma once
// v2 · Mutex protected
// One mutex guards the queue. Locking is manual, on purpose:
// next_bug.cpp shows what an exception does to a manual lock.
#include <cstddef>
#include <mutex>
#include <queue>
#include <stdexcept>

class Queue {
    std::queue<int> q;                    // guarded by m
    std::mutex m;

public:
    void push(int x) {
        m.lock();
        q.push(x);
        m.unlock();
    }

    int pop() {
        m.lock();
        if (q.empty())
            throw std::runtime_error("empty");   // m stays locked!
        int x = q.front();
        q.pop();
        m.unlock();
        return x;
    }

    std::size_t size() {
        m.lock();
        std::size_t n = q.size();
        m.unlock();
        return n;
    }
};

inline void producer(Queue& q, int n) {
    for (int i = 0; i < n; ++i)
        q.push(i);
}

inline void consumer(Queue& q, int n) {
    for (int i = 0; i < n; ++i)
        q.pop();
}
