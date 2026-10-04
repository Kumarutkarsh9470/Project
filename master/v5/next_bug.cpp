// v5 SHOULD FAIL: consumers that aren't told how many items to expect.
// They loop forever in wait_and_pop(); ~ThreadGroup waits forever to
// join them. All items get handled, then the program never exits.
// That's v6's problem: a shutdown protocol.
#include <iostream>
#include "queue.hpp"
#include "thread_group.hpp"

int main() {
    Queue queue;
    long long handled = 0;
    std::mutex hm;
    {
        ThreadGroup g;
        for (int p = 0; p < 4; ++p) g.add(std::thread(producer, std::ref(queue), 1000));
        for (int c = 0; c < 4; ++c)
            g.add(std::thread([&] {
                while (true) {                  // no idea when to stop
                    queue.wait_and_pop();
                    std::lock_guard<std::mutex> l(hm);
                    if (++handled == 4000) std::cout << "all 4000 handled... now exit?\n";
                }
            }));
    }
    std::cout << "exited\n";                    // never printed
}
