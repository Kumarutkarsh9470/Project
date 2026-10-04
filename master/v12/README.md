# v12 · Two-lock queue

**Topic:** fine-grained locking; a linked list with a dummy node.

## What changed from v11
- New `two_lock_queue.hpp`: `TwoLockQueue<T>` with the same API as
  `ThreadSafeQueue<T>` (push, try_pop, wait_and_pop, shutdown, empty).
- Producers lock only `tail_m`; consumers lock only `head_m`. The dummy node at
  the end means the head and the tail never point at the same real item.
- `closed` is a `std::atomic<bool>` (v11), so `push()` can read it without the head lock.
- Subtle part: `push()` briefly locks `head_m` before `notify_one()`, so a wake-up
  can't be lost between a consumer's check and its sleep.
- The destructor frees nodes in a loop, not recursively.

## Files
| File | What it is |
|---|---|
| `tiny_contention.cpp` | One mutex vs two locks, 1x1 and 4x4 (-O2) |
| `two_lock_queue.hpp` | The new queue |
| `tests.cpp` | FIFO, 4x4 matrix, shutdown, unique_ptr, 1M-node destruction |
| `next_bug.cpp` | ns per item for 1 producer + 1 consumer: still too slow for a feed |

## What you'll see, and why
| Run | You'll see | Why |
|---|---|---|
| `tiny_contention (at -O2)` | 1x1: one mutex 6.1 M/s, two locks 0.9 M/s | Two locks remove waiting but add an allocation and two lock pairs per item. Measure. (At -O0 it is very slow: build it at -O2.) |
| `next_bug` | about 1-4 microseconds per item | Far too slow for one producer and one consumer. That's v13. |

## Next
v13: a lock-free single-producer, single-consumer ring buffer.
