// v1: producer and consumer each get their own thread.
// ThreadGroup joins both at the end of the scope.
// The producer finishes before the consumer starts, so this
// is still safe: only one thread touches the queue at a time.
#include <functional>
#include <iostream>
#include "queue.hpp"
#include "thread_group.hpp"

int main() {
    Queue q;
    const int n = 1'000'000;
    {
        ThreadGroup g;
        g.add(std::thread(producer, std::ref(q), n));
    }   // joined here: the producer is done
    std::cout << "after producer: " << q.size() << " items\n";
    {
        ThreadGroup g;
        g.add(std::thread(consumer, std::ref(q), n));
    }
    std::cout << "after consumer: " << q.size() << " items\n";
}
