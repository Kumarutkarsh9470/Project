// v10 tiny example 2: a promise and two readers.
//   tiny_promise          two readers share ONE future: the second get() fails
//   tiny_promise shared   each reader gets its own shared_future copy
//   tiny_promise broken   the promise is destroyed unset: broken_promise
#include <cstring>
#include <future>
#include <iostream>
#include <syncstream>
#include <thread>
using namespace std::chrono_literals;

int main(int argc, char** argv) {
    const char* mode = argc > 1 ? argv[1] : "";
    std::promise<int> p;
    if (std::strcmp(mode, "broken") == 0) {
        std::future<int> f = p.get_future();
        std::thread net([p = std::move(p)]() mutable { std::this_thread::sleep_for(100ms); });
        net.join();                     // promise destroyed without a value
        try { f.get(); } catch (const std::future_error& e) { std::cout << "get(): " << e.what() << '\n'; }
        return 0;
    }
    std::thread net([&p] { std::this_thread::sleep_for(200ms); p.set_value(42); });
    if (std::strcmp(mode, "shared") == 0) {
        std::shared_future<int> sf = p.get_future().share();
        auto reader = [sf] { std::osyncstream(std::cout) << "reader got " << sf.get() << '\n'; };
        std::thread a(reader), b(reader);
        a.join(); b.join();
    } else {
        std::future<int> f = p.get_future();
        std::cout << "first reader got " << f.get() << '\n';
        try { f.get(); }                // second get(): invalid future
        catch (const std::future_error& e) { std::cout << "second get(): " << e.what() << '\n'; }
    }
    net.join();
}
