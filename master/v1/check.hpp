#pragma once
// Tiny test harness used by every version's tests.cpp.
//   TEST(name) { CHECK(condition); }
//   int main() { return run_all(); }
#include <iostream>
#include <vector>

struct TestCase { const char* name; void (*fn)(); };
inline std::vector<TestCase>& all_tests() { static std::vector<TestCase> t; return t; }
inline int& failures() { static int f = 0; return f; }
struct Register { Register(const char* n, void (*f)()) { all_tests().push_back({n, f}); } };

#define TEST(name) static void name(); static Register reg_##name(#name, name); static void name()
#define CHECK(cond) do { if (!(cond)) { ++failures(); \
    std::cout << "\n  FAILED: " #cond "  (line " << __LINE__ << ")"; } } while (0)

inline int run_all() {
    for (auto& t : all_tests()) {
        int before = failures();
        std::cout << t.name << " ... " << std::flush;
        t.fn();
        std::cout << (failures() == before ? " ok" : "\n  -> FAILED") << '\n';
    }
    std::cout << (failures() ? "SOME TESTS FAILED\n" : "ALL TESTS PASSED\n");
    return failures() ? 1 : 0;
}
