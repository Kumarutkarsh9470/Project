// v6 SHOULD FAIL (to compile): the queue only holds int.
// Next we'll queue tasks, and some values can't be copied at all.
//   g++ -std=c++20 -DSHOW_BUG next_bug.cpp     -> compile error
// That's v7's problem: a generic ThreadSafeQueue<T> that moves.
#include <iostream>
#include <memory>
#include "queue.hpp"

int main() {
#ifdef SHOW_BUG
    Queue q;
    q.push(std::make_unique<int>(42));          // no: Queue holds int only
#else
    std::cout << "Compile with -DSHOW_BUG to see why v7 is needed.\n";
#endif
}
