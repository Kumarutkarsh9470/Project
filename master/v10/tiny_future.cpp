// v10 tiny example 1: std::async and std::future.
// Shows which thread runs the task under each launch policy, and that
// an exception comes out of get().
#include <future>
#include <iostream>
#include <stdexcept>
#include <thread>

int calculate() {
    std::cout << "  calculate() runs on thread " << std::this_thread::get_id() << '\n';
    return 42;
}

int main() {
    std::cout << "main is thread " << std::this_thread::get_id() << '\n';
    std::cout << "launch::async:\n";
    auto a = std::async(std::launch::async, calculate);
    int ra = a.get();
    std::cout << "  result " << ra << '\n';
    std::cout << "launch::deferred (runs inside get(), on main):\n";
    auto d = std::async(std::launch::deferred, calculate);
    int rd = d.get();                   // calculate() runs now, right here
    std::cout << "  result " << rd << '\n';
    auto bad = std::async(std::launch::async, []() -> int { throw std::runtime_error("calculate failed"); });
    try { bad.get(); } catch (const std::exception& e) { std::cout << "get() rethrew: " << e.what() << '\n'; }
}
