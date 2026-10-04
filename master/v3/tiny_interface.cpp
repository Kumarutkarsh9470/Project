// v3 tiny example 2: every call is safe, the program isn't.
// Two consumers check empty() then call top()/pop() as separate calls.
// top() throws instead of being UB so the race is visible.
#include <iostream>
#include <mutex>
#include <stdexcept>
#include <thread>
#include <vector>

class SafeStack {                       // every method locks m
    std::vector<int> data;
    mutable std::mutex m;
public:
    void push(int x) { std::lock_guard<std::mutex> l(m); data.push_back(x); }
    bool empty() const { std::lock_guard<std::mutex> l(m); return data.empty(); }
    int top() const {
        std::lock_guard<std::mutex> l(m);
        if (data.empty()) throw std::runtime_error("top() on empty stack");
        return data.back();
    }
    void pop() { std::lock_guard<std::mutex> l(m); if (!data.empty()) data.pop_back(); }
};

int main() {
    int races = 0;
    std::mutex rm;
    for (int round = 0; round < 200; ++round) {
        SafeStack s;
        s.push(7);
        auto consumer = [&] {
            if (!s.empty()) {
                std::this_thread::sleep_for(std::chrono::microseconds(200));
                try { s.top(); s.pop(); }
                catch (const std::exception&) { std::lock_guard<std::mutex> l(rm); ++races; }
            }
        };
        std::thread a(consumer), b(consumer);
        a.join(); b.join();
    }
    std::cout << "top() hit an empty stack in " << races << " of 200 rounds\n";
}
