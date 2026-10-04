// v8 tiny example: where did the exception go?
//   tiny terminate   throw inside a std::thread: main's catch never runs.
//                    std::terminate aborts (on some Windows setups the abort
//                    hangs in error reporting instead: Ctrl+C)
//   tiny carry       catch in the thread, store an exception_ptr, rethrow in main
#include <cstring>
#include <exception>
#include <iostream>
#include <stdexcept>
#include <thread>

int main(int argc, char** argv) {
    const char* mode = argc > 1 ? argv[1] : "";
    if (std::strcmp(mode, "terminate") == 0) {
        try {
            std::thread t([] { throw std::runtime_error("disk full"); });
            t.join();
        } catch (const std::exception& e) {
            std::cout << "caught: " << e.what() << '\n';   // never printed
        }
    } else if (std::strcmp(mode, "carry") == 0) {
        std::exception_ptr error;
        std::thread t([&error] {
            try { throw std::runtime_error("disk full"); }
            catch (...) { error = std::current_exception(); }
        });
        t.join();
        try {
            if (error) std::rethrow_exception(error);
        } catch (const std::exception& e) {
            std::cout << "caught in main: " << e.what() << '\n';
        }
    } else {
        std::cout << "usage: tiny terminate | carry\n";
    }
}
