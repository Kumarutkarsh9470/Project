// v6: consumers run until the queue is closed and drained.
#include <functional>
#include <iostream>
#include "queue.hpp"
#include "thread_group.hpp"

int main() {
    Queue q;
    {
        ThreadGroup consumers;
        for (int i = 0; i < 4; ++i)
            consumers.add(std::thread(consumer, std::ref(q)));
        {
            ThreadGroup producers;
            for (int i = 0; i < 4; ++i)
                producers.add(std::thread(producer, std::ref(q), 1000));
        }                        // all producers have finished
        q.shutdown();            // wake every consumer
    }                            // consumers drain, then join
    std::cout << "push after shutdown: " << q.push(1) << '\n';
}
