// v10: submit() returns a future with the value or the error.
#include <iostream>
#include <stdexcept>
#include "pool.hpp"

int main() {
    ThreadPool pool(4);

    auto f = pool.submit([] { return 6 * 7; });
    std::cout << "result: " << f.get() << '\n';

    auto bad = pool.submit([]() -> int {
        throw std::runtime_error("bad job");
    });
    try {
        bad.get();
    } catch (const std::exception& e) {
        std::cout << "get() rethrew: " << e.what() << '\n';
    }

    auto outer = pool.submit([&pool] {   // a task that waits
        auto inner = pool.submit([] { return 1; });
        return pool.wait_helping(inner) + 1;
    });
    std::cout << "nested: " << outer.get() << '\n';
}
