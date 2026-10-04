# v0 · Ordinary queue

**Topic:** what concurrency buys (and doesn't).

## What this version is
A plain `std::queue<int>` wrapper plus `producer()` and `consumer()` functions,
run one after the other on one thread. Nothing is concurrent yet. It's the
correct, measured baseline that every later version is compared to.

## Files
| File | Deck step | What it is |
|---|---|---|
| `tiny.cpp` | 3–5 | Two sleeping tasks, sequential vs threads; `tiny burn` for CPU scaling |
| `queue.hpp` | 8 | Queue v0 |
| `tests.cpp` | 8 | Must-pass tests and the baseline timing |

## Expected
- `tiny`: about 4 s sequential, about 2 s on two threads.
- `tiny burn` (build with -O2): speedup grows up to the core count, then flattens.
- `tests`: all pass; write the ns per push+pop in your README.

## Next
v1 puts the producer and consumer on their own threads.
