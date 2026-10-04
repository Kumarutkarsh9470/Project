// v10 tiny example 4: tasks that wait for tasks.
//   tiny_nested           get() inside tasks on a 2-worker pool: deadlock (Ctrl+C)
//   tiny_nested helping   wait_helping() runs queued tasks while waiting
#include <cstring>
#include <iostream>
#include "pool.hpp"

int main(int argc, char** argv) {
    bool helping = argc > 1 && std::strcmp(argv[1], "helping") == 0;
    ThreadPool pool(2);
    auto outer = [&pool, helping] {
        auto inner = pool.submit([] { return 1; });
        return helping ? pool.wait_helping(inner) : inner.get();
    };
    auto a = pool.submit(outer);
    auto b = pool.submit(outer);
    std::cout << (helping ? "helping: " : "get() inside tasks: frozen if nothing follows...\n");
    std::cout << a.get() + b.get() << '\n';
}
