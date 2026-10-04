#pragma once
// v1: RAII owner for threads. Every thread added is joined in the
// destructor, on every exit path, including exceptions.
#include <thread>
#include <vector>

class ThreadGroup {
    std::vector<std::thread> ts;
public:
    ThreadGroup() = default;
    ThreadGroup(const ThreadGroup&) = delete;
    ThreadGroup& operator=(const ThreadGroup&) = delete;

    void add(std::thread t) { ts.push_back(std::move(t)); }

    ~ThreadGroup() {
        for (auto& t : ts)
            if (t.joinable()) t.join();
    }
};
