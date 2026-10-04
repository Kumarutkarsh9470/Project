// v7: one template, any type, including move-only ones.
#include <iostream>
#include <memory>
#include <string>
#include "queue.hpp"
#include "thread_group.hpp"

int main() {
    ThreadSafeQueue<std::string> words;
    words.push("hello");
    words.push("queue");
    words.shutdown();
    while (auto w = words.wait_and_pop())
        std::cout << *w << '\n';

    ThreadSafeQueue<std::unique_ptr<int>> boxes;
    {
        ThreadGroup g;
        g.add(std::thread([&] {
            for (int i = 0; i < 3; ++i)
                boxes.push(std::make_unique<int>(i));
            boxes.shutdown();
        }));
        g.add(std::thread([&] {
            while (auto b = boxes.wait_and_pop())
                std::cout << "box " << **b << '\n';
        }));
    }
}
