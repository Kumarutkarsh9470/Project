// v10 must-pass tests: values, exceptions, volume, shared results,
// cancellation and tasks that wait for tasks.
#include <numeric>
#include <stdexcept>
#include <stop_token>
#include <string>
#include <vector>
#include "check.hpp"
#include "pool.hpp"
#include "stopwatch.hpp"
using namespace std::chrono_literals;

TEST(value_comes_back) {
    ThreadPool pool(4);
    auto f = pool.submit([] { return 6 * 7; });
    CHECK(f.get() == 42);
}

TEST(exception_comes_back_pool_survives) {
    ThreadPool pool(2);
    auto bad = pool.submit([]() -> int { throw std::runtime_error("bad job"); });
    std::string what;
    try { bad.get(); } catch (const std::exception& e) { what = e.what(); }
    CHECK(what == "bad job");
    CHECK(pool.submit([] { return 1; }).get() == 1);
}

TEST(hundred_thousand_tiny_tasks) {
    ThreadPool pool(4);
    std::vector<std::future<int>> fs;
    fs.reserve(100'000);
    for (int i = 0; i < 100'000; ++i) fs.push_back(pool.submit([i] { return i % 3; }));
    long long sum = 0;
    for (auto& f : fs) sum += f.get();
    CHECK(sum == 99'999);               // 33,333 ones + 33,333 twos
}

struct Config { int x = 7; };

TEST(shared_future_eight_readers) {
    ThreadPool pool(4);
    std::shared_future<Config> config =
        pool.submit([] { std::this_thread::sleep_for(20ms); return Config{}; }).share();
    std::vector<std::future<int>> readers;
    for (int i = 0; i < 8; ++i)
        readers.push_back(pool.submit([config] { return config.get().x; }));
    int total = 0;
    for (auto& r : readers) total += r.get();
    CHECK(total == 56);
}

std::string fetch(const std::string&, std::stop_token tok) {     // ~5 s unless cancelled
    for (int i = 0; i < 100; ++i) {
        if (tok.stop_requested()) return "";
        std::this_thread::sleep_for(50ms);
    }
    return "<html>";
}

TEST(cooperative_cancellation) {
    ThreadPool pool(2);
    std::stop_source stop;
    Stopwatch sw;
    auto page = pool.submit([tok = stop.get_token()] { return fetch("example.com", tok); });
    if (page.wait_for(200ms) != std::future_status::ready) stop.request_stop();
    CHECK(page.get().empty());
    CHECK(sw.seconds() < 1.0);
}

long long psum(ThreadPool& pool, const int* b, const int* e) {
    if (e - b < 10'000) return std::accumulate(b, e, 0LL);
    const int* mid = b + (e - b) / 2;
    auto left = pool.submit([&pool, b, mid] { return psum(pool, b, mid); });
    long long right = psum(pool, mid, e);
    return pool.wait_helping(left) + right;
}

TEST(tasks_waiting_for_tasks) {
    std::vector<int> v(2'000'000);
    std::iota(v.begin(), v.end(), 0);
    const long long expected = std::accumulate(v.begin(), v.end(), 0LL);
    for (unsigned w : {1u, 2u}) {
        ThreadPool pool(w);
        auto f = pool.submit([&] { return psum(pool, v.data(), v.data() + v.size()); });
        CHECK(pool.wait_helping(f) == expected);
    }
}

int main() { return run_all(); }
