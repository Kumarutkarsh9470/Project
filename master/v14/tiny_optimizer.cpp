// v14 tiny example: the benchmark that measures nothing. Build at -O2.
// The first loop's result is never used, so the compiler may delete the
// loop entirely and report a time near zero. Using the result (here,
// printing it) forces the work to happen.
#include <cstdint>
#include <iostream>
#include "stopwatch.hpp"

int main() {
    const std::uint64_t N = 500'000'000;
    Stopwatch sw;
    [[maybe_unused]] std::uint64_t unused = 0;
    for (std::uint64_t i = 0; i < N; ++i)
        unused += i % 7;
    double deleted = sw.seconds();

    sw.reset();
    std::uint64_t used = 0;
    for (std::uint64_t i = 0; i < N; ++i)
        used += i % 7;
    double real = sw.seconds();

    std::cout << "result unused: " << deleted * 1000 << " ms\n";
    std::cout << "result used:   " << real * 1000 << " ms  (sum " << used << ")\n";
}
