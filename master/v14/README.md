# v14 · Benchmark harness

**Topic:** measuring concurrent code honestly: throughput, latency percentiles,
warm-up, repeated runs, and the optimizer.

## What changed from v13
- New `bench.hpp`: measures saturated throughput, and per-message latency at a
  paced rate (500k msg/s) so the queue isn't just measuring its own backlog.
  Warm-up run first, five runs, median throughput, p50 / p99 / p99.9 latency.
- New `bench.cpp`: compares `ThreadSafeQueue` (v7), `TwoLockQueue` (v12) and
  `SpscRing` (v13) under the same 1-producer, 1-consumer load.
- `tests.cpp` runs one correctness check against all three queues through one adapter.

## Files
| File | What it is |
|---|---|
| `tiny_optimizer.cpp` | A loop whose result is unused can be deleted by -O2 |
| `bench.hpp`, `bench.cpp` | The harness and the three-queue comparison |
| `queue.hpp`, `two_lock_queue.hpp`, `spsc_ring.hpp` | The queues under test |
| `tests.cpp` | In-order delivery for all three queues; harness sanity |

## Run
```bash
g++ -std=c++20 -O2 -pthread bench.cpp -o bench && ./bench
```

## What you'll see, and why
| Run | You'll see | Why |
|---|---|---|
| `tiny_optimizer (at -O2)` | unused: ~0 ms, used: ~640 ms | The compiler deleted the loop whose result nobody read. |
| `bench (at -O2)` | SpscRing ~105 M msg/s, p50 263 ns; ThreadSafeQueue ~4.8 M msg/s, p50 5.8 µs | No locks, no allocation, no sleeping. Read p99.9 too: the OS still interrupts. |

## Next
The project tracks. The Feed Handler starts from `spsc_ring.hpp` and `bench.hpp`.
