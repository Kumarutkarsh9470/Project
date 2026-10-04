// v10 tiny example 3: the timeout that doesn't time out.
// wait_for gives up after 1 s, but the future from std::async blocks in
// its destructor until the 3 s task finishes.
#include <future>
#include <iostream>
#include <optional>
#include <string>
#include "stopwatch.hpp"
using namespace std::chrono_literals;

std::string fetch() { std::this_thread::sleep_for(3s); return "<html>"; }

int main() {
    Stopwatch sw;
    std::optional<std::string> page;
    {
        auto f = std::async(std::launch::async, fetch);
        if (f.wait_for(1s) == std::future_status::ready) page = f.get();
        std::cout << "timed out at " << sw.seconds() << " s\n";
    }                                   // ~future waits for fetch()
    std::cout << "left the scope at " << sw.seconds() << " s\n";
}
