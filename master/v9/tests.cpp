// v9 must-pass tests: workers run everything, drain on destruction,
// survive throwing tasks; one default pool; concurrent cache reads.
#include <mutex>
#include <set>
#include <stdexcept>
#include "check.hpp"
#include "dns_cache.hpp"
#include "pool.hpp"

TEST(eight_tasks_on_four_workers) {
    std::mutex m;
    int ran = 0;
    {
        ThreadPool pool(4);
        for (int i = 0; i < 8; ++i)
            pool.submit([&] { std::lock_guard<std::mutex> l(m); ++ran; });
    }
    CHECK(ran == 8);
}

TEST(destructor_drains_queued_tasks) {
    std::mutex m;
    int ran = 0;
    {
        ThreadPool pool(2);
        for (int i = 0; i < 1000; ++i)
            pool.submit([&] { std::lock_guard<std::mutex> l(m); ++ran; });
    }
    CHECK(ran == 1000);
}

TEST(throwing_tasks_reach_the_handler) {
    std::mutex m;
    int errors = 0, ran = 0;
    {
        ThreadPool pool(4, [&](std::exception_ptr) { std::lock_guard<std::mutex> l(m); ++errors; });
        for (int i = 0; i < 100; ++i) {
            pool.submit([] { throw std::runtime_error("bad"); });
            pool.submit([&] { std::lock_guard<std::mutex> l(m); ++ran; });
        }
    }
    CHECK(errors == 100);
    CHECK(ran == 100);
}

TEST(default_pool_is_created_once) {
    std::mutex m;
    std::set<ThreadPool*> seen;
    {
        ThreadGroup g;
        for (int i = 0; i < 8; ++i)
            g.add(std::thread([&] {
                ThreadPool* p = &default_pool();
                std::lock_guard<std::mutex> l(m);
                seen.insert(p);
            }));
    }
    CHECK(seen.size() == 1);
}

TEST(cache_many_readers) {
    DnsCache cache;
    cache.update("example.com", "93.184.216.34");
    std::mutex m;
    int hits = 0;
    {
        ThreadPool pool(8);
        for (int i = 0; i < 10'000; ++i)
            pool.submit([&] {
                if (cache.find("example.com") == "93.184.216.34") { std::lock_guard<std::mutex> l(m); ++hits; }
            });
        pool.submit([&] { cache.update("other.org", "1.2.3.4"); });
    }
    CHECK(hits == 10'000);
    CHECK(cache.find("other.org") == "1.2.3.4");
}

int main() { return run_all(); }
