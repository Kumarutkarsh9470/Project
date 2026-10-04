#pragma once
// v1 · Multiple threads
// The queue is unchanged from v0. What's new is how we run it:
// on std::threads, passed with std::ref, owned by a ThreadGroup.
#include <cstddef>
#include <queue>

class Queue {
    std::queue<int> q;

public:
    void push(int x) {
        q.push(x);
    }

    int pop() {                           // undefined if empty
        int x = q.front();
        q.pop();
        return x;
    }

    bool empty() const { return q.empty(); }
    std::size_t size() const { return q.size(); }
};

inline void producer(Queue& q, int n) {
    for (int i = 0; i < n; ++i)
        q.push(i);
}

inline void consumer(Queue& q, int n) {
    for (int i = 0; i < n; ++i)
        q.pop();
}
