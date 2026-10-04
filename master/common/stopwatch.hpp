#pragma once
// Wall-clock timing for every experiment. steady_clock never jumps.
#include <chrono>

class Stopwatch {
    std::chrono::steady_clock::time_point t0 = std::chrono::steady_clock::now();
public:
    double seconds() const {
        return std::chrono::duration<double>(std::chrono::steady_clock::now() - t0).count();
    }
    void reset() { t0 = std::chrono::steady_clock::now(); }
};
