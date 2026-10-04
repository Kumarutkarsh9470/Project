#pragma once
// v13 · Lock-free SPSC ring buffer
// Exactly ONE producer thread and ONE consumer thread. No locks, no
// allocation after construction. The producer owns 'tail', the
// consumer owns 'head'; each only reads the other's index.
#include <array>
#include <atomic>
#include <cstddef>
#include <utility>

template <class T, std::size_t N>         // N: a power of two
class SpscRing {
    static_assert(N >= 2 && (N & (N - 1)) == 0, "N: power of two");

    // Each index on its own 64-byte cache line, so the producer
    // writing 'tail' doesn't keep stealing the line holding 'head'.
    alignas(64) std::atomic<std::size_t> head{0};   // next to read
    alignas(64) std::atomic<std::size_t> tail{0};   // next to write
    alignas(64) std::array<T, N> slots{};

public:
    bool try_push(T v) {                  // producer thread only
        std::size_t t = tail.load(std::memory_order_relaxed);
        if (t - head.load(std::memory_order_acquire) == N)
            return false;                 // full
        slots[t & (N - 1)] = std::move(v);
        tail.store(t + 1, std::memory_order_release);   // publish
        return true;
    }

    bool try_pop(T& out) {                // consumer thread only
        std::size_t h = head.load(std::memory_order_relaxed);
        if (h == tail.load(std::memory_order_acquire))
            return false;                 // empty
        out = std::move(slots[h & (N - 1)]);
        head.store(h + 1, std::memory_order_release);   // free slot
        return true;
    }

    std::size_t size() const {            // a snapshot
        return tail.load(std::memory_order_acquire) -
               head.load(std::memory_order_acquire);
    }
};
