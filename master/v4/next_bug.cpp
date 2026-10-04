// v4 SHOULD FAIL (experiment): wait without a predicate.
// The producer pushes and notifies BEFORE the consumer waits. A bare
// cv.wait(lock) ignores the queue's state, so the notify is lost and
// the consumer sleeps forever with an item in the queue. Ctrl+C.
// Put the predicate back: cv.wait(lock, [&] { return !q.empty(); });
#include <condition_variable>
#include <iostream>
#include <mutex>
#include <queue>
#include <thread>

std::queue<int> q;
std::mutex m;
std::condition_variable cv;

int main() {
    {
        std::lock_guard<std::mutex> lock(m);
        q.push(42);
    }
    cv.notify_one();                    // nobody is waiting yet: lost
    std::thread consumer([] {
        std::unique_lock<std::mutex> lock(m);
        cv.wait(lock);                  // no predicate
        std::cout << "got " << q.front() << '\n';
    });
    std::cout << "consumer waiting... (frozen if nothing follows)\n";
    consumer.join();
}
