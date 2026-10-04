# v13 · Lock-free SPSC ring buffer

**Topic:** lock-free single-producer single-consumer queue; cache lines.

## What changed from v12
- New `spsc_ring.hpp`: `SpscRing<T, N>`, a fixed array of N slots (N a power of
  two) with two atomic indices. No mutex, no condition variable, no allocation.
- The producer writes a slot, then publishes it with `tail.store(..., release)`.
  The consumer sees it with `tail.load(acquire)` (the v11 publish pattern).
- `head` and `tail` are each `alignas(64)`, so they live on separate cache lines.
- The price: exactly one producer and one consumer, and `try_` functions only
  (the caller decides whether to spin, yield or sleep).

## Files
| File | What it is |
|---|---|
| `tiny_false_sharing.cpp` | Two private counters on one cache line vs two (-O2) |
| `spsc_ring.hpp` | The ring buffer |
| `tests.cpp` | Full/empty edges, wrap-around, unique_ptr, 10M items in order |
| `next_bug.cpp` | should fail: two producers lose or duplicate items |

## What you'll see, and why
| Run | You'll see | Why |
|---|---|---|
| `tiny_false_sharing` | same cache line 1.5 s, separate lines 0.4 s | Nothing is shared, but the cores keep stealing one 64-byte line. |
| `next_bug` | expected 2,000,000 items, got 1,255,101 | Two producers on a single-producer ring overwrite each other. |

## Next
v14: measure all three queues properly.
