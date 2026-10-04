#pragma once
// v12 · Two-lock queue
// A singly linked list with a dummy node at the end. Producers lock
// only the tail, consumers only the head, so a push and a pop can run
// at the same time (Williams, C++ Concurrency in Action, chapter 6).
#include <atomic>
#include <condition_variable>
#include <memory>
#include <mutex>
#include <optional>
#include <utility>

template <class T>
class TwoLockQueue {
    struct Node {
        std::optional<T> value;           // empty in the dummy node
        std::unique_ptr<Node> next;
    };

    std::unique_ptr<Node> head;           // guarded by head_m
    Node* tail;                           // guarded by tail_m
    std::mutex head_m;
    std::mutex tail_m;
    std::condition_variable cv;           // waits under head_m
    std::atomic<bool> closed{false};

    Node* get_tail() {
        std::lock_guard<std::mutex> lock(tail_m);
        return tail;
    }

    bool has_items() {                    // caller holds head_m
        return head.get() != get_tail();
    }

    T pop_head() {                        // caller holds head_m
        T v = std::move(*head->value);
        head = std::move(head->next);     // frees the old first node
        return v;
    }

public:
    TwoLockQueue() : head(std::make_unique<Node>()), tail(head.get()) {}

    TwoLockQueue(const TwoLockQueue&) = delete;
    TwoLockQueue& operator=(const TwoLockQueue&) = delete;

    ~TwoLockQueue() {                     // a loop, not recursion
        while (head)
            head = std::move(head->next);
    }

    bool push(T v) {
        if (closed.load())
            return false;
        auto dummy = std::make_unique<Node>();   // no lock held yet
        {
            std::lock_guard<std::mutex> lock(tail_m);
            tail->value = std::move(v);   // the old dummy gets it
            Node* new_tail = dummy.get();
            tail->next = std::move(dummy);
            tail = new_tail;              // the new node is the dummy
        }
        {
            std::lock_guard<std::mutex> lock(head_m);   // see below
        }
        cv.notify_one();
        return true;
    }

    bool try_pop(T& out) {
        std::lock_guard<std::mutex> lock(head_m);
        if (!has_items())
            return false;
        out = pop_head();
        return true;
    }

    std::optional<T> wait_and_pop() {
        std::unique_lock<std::mutex> lock(head_m);
        cv.wait(lock, [&] { return has_items() || closed; });
        if (!has_items())                 // closed and drained
            return std::nullopt;
        return pop_head();
    }

    void shutdown() {
        {
            std::lock_guard<std::mutex> lock(head_m);
            closed = true;
        }
        cv.notify_all();
    }

    bool empty() {
        std::lock_guard<std::mutex> lock(head_m);
        return !has_items();
    }
};

// Why push() briefly locks head_m before notifying: a consumer checks
// for data while holding head_m and only then goes to sleep. Taking
// head_m in push() means the notify cannot slip in between that check
// and the sleep, which would lose the wake-up.
