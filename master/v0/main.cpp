// v0: the whole program on one thread.
// The producer fills the queue, then the consumer empties it.
#include <iostream>
#include "queue.hpp"

int main() {
    Queue q;
    const int n = 1'000'000;

    producer(q, n);      // push 0 .. n-1
    std::cout << "after producer: " << q.size() << " items\n";

    consumer(q, n);      // pop them all
    std::cout << "after consumer: " << q.size() << " items\n";
}
