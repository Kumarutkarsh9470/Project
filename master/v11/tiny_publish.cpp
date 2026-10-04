// v11 tiny example 2: publishing data with release / acquire.
// The writer fills 'data', then sets 'ready' with memory_order_release.
// The reader waits for 'ready' with memory_order_acquire, and is then
// guaranteed to see everything written before the release: data == 42.
// With memory_order_relaxed on both sides that guarantee disappears
// (x86 hides the bug in practice; ARM phones and Apple chips don't).
#include <atomic>
#include <iostream>
#include <thread>

int data = 0;                             // plain int, not atomic
std::atomic<bool> ready{false};

int main() {
    std::thread writer([] {
        data = 42;                                        // 1. write the data
        ready.store(true, std::memory_order_release);     // 2. publish it
    });
    std::thread reader([] {
        while (!ready.load(std::memory_order_acquire))    // 3. wait for it
            std::this_thread::yield();
        std::cout << "reader sees data = " << data << '\n';   // 4. always 42
    });
    writer.join();
    reader.join();
}
