#pragma once
// v14 · Benchmark harness
// Two questions, measured separately:
//   throughput: messages per second at full speed (saturated)
//   latency:    time for ONE message, at a steady rate the queue can
//               sustain (at full speed you'd only measure the backlog)
// Rules: warm up first, repeat runs, report the median, read the tail.
#include <algorithm>
#include <chrono>
#include <cstdint>
#include <thread>
#include <vector>

struct Result {
    double million_per_sec;               // saturated throughput
    double p50_ns, p99_ns, p999_ns;       // latency at the paced rate
};

inline std::int64_t now_ns() {
    using namespace std::chrono;
    auto t = steady_clock::now().time_since_epoch();
    return duration_cast<nanoseconds>(t).count();
}

// The smallest step the clock can show. Latencies below it read as 0:
// on some Windows toolchains steady_clock only ticks every microsecond.
inline std::int64_t clock_resolution_ns() {
    std::int64_t best = 1'000'000'000;
    for (int i = 0; i < 1000; ++i) {
        std::int64_t t0 = now_ns();
        std::int64_t t1 = now_ns();
        while (t1 == t0)
            t1 = now_ns();
        best = std::min(best, t1 - t0);
    }
    return best;
}

inline double percentile(std::vector<std::int64_t>& v, double p) {
    std::size_t k = static_cast<std::size_t>(p * (v.size() - 1));
    std::nth_element(v.begin(), v.begin() + k, v.end());
    return static_cast<double>(v[k]);
}

// push(q, value) and pop(q) adapt each queue to one interface.
template <class Q, class Push, class Pop>
double throughput_once(Q& q, std::size_t n, Push push, Pop pop) {
    std::int64_t start = now_ns();
    std::thread producer([&] {
        for (std::size_t i = 0; i < n; ++i)
            push(q, static_cast<std::int64_t>(i));
    });
    for (std::size_t i = 0; i < n; ++i)
        pop(q);
    producer.join();
    double seconds = (now_ns() - start) / 1e9;
    return n / seconds / 1e6;
}

template <class Q, class Push, class Pop>
void latency_once(Q& q, std::size_t n, double per_sec,
                  Push push, Pop pop, std::vector<std::int64_t>& out) {
    const auto gap = static_cast<std::int64_t>(1e9 / per_sec);
    std::thread producer([&] {
        std::int64_t next = now_ns();
        for (std::size_t i = 0; i < n; ++i) {
            while (now_ns() < next) {}    // wait for the send time
            push(q, now_ns());            // the message: its send time
            next += gap;
        }
    });
    for (std::size_t i = 0; i < n; ++i) {
        std::int64_t sent = pop(q);
        out.push_back(now_ns() - sent);
    }
    producer.join();
}

template <class MakeQueue, class Push, class Pop>
Result measure(MakeQueue make, std::size_t n, int runs,
               double per_sec, Push push, Pop pop) {
    {
        auto warm = make();               // warm-up run, discarded
        throughput_once(*warm, n / 10, push, pop);
    }
    std::vector<double> tp;
    std::vector<std::int64_t> lat;
    for (int r = 0; r < runs; ++r) {
        auto q1 = make();
        tp.push_back(throughput_once(*q1, n, push, pop));
        auto q2 = make();
        latency_once(*q2, n / 10, per_sec, push, pop, lat);
    }
    std::sort(tp.begin(), tp.end());
    Result res;
    res.million_per_sec = tp[tp.size() / 2];   // the median run
    res.p50_ns = percentile(lat, 0.50);
    res.p99_ns = percentile(lat, 0.99);
    res.p999_ns = percentile(lat, 0.999);
    return res;
}
