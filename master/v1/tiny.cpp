// v1 tiny example: thread lifetime and ownership.
//   tiny terminate   destroy a joinable thread       -> std::terminate (crash)
//   tiny detach      detached thread reads a dead local -> undefined behaviour
//   tiny join        the fix
// Passing an int& without std::ref doesn't compile: try it in your editor.
#include <cstring>
#include <iostream>
#include <thread>
using namespace std::chrono_literals;

void work() {
    std::this_thread::sleep_for(1s);
    std::cout << "done\n";
}

void launch() {
    int x = 10;
    std::thread t([&x] {
        std::this_thread::sleep_for(1s);
        std::cout << "x = " << x << "  (x is already destroyed!)\n";
    });
    t.detach();
}   // x destroyed here, the thread still running

int main(int argc, char** argv) {
    const char* mode = argc > 1 ? argv[1] : "";
    if (std::strcmp(mode, "terminate") == 0) {
        std::thread t(work);
    }                                   // ~thread() on a joinable thread
    else if (std::strcmp(mode, "detach") == 0) {
        launch();
        std::this_thread::sleep_for(3s);
    } else if (std::strcmp(mode, "join") == 0) {
        std::thread t(work);
        t.join();
    } else {
        std::cout << "usage: tiny terminate | detach | join\n";
    }
}
