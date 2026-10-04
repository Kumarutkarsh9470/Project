#pragma once
// v3 · RAII locking
// lock_guard releases the mutex on every path. try_pop() replaces
// pop(): check, read and remove happen under ONE lock.
#include <cstddef>
#include <mutex>
#include <queue>

class Queue {
    std::queue<int> q;                    // guarded by m
    mutable std::mutex m;

public:
    void push(int x) {
        std::lock_guard<std::mutex> lock(m);
        q.push(x);
    }

    bool try_pop(int& out) {
        std::lock_guard<std::mutex> lock(m);
        if (q.empty())
            return false;
        out = q.front();
        q.pop();
        return true;
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

inline void consumer(Queue& q, int n) { // spins while empty
    int x;
    for (int i = 0; i < n; )
        if (q.try_pop(x))
            ++i;
}
