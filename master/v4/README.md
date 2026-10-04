# v4 · condition_variable

**Topic:** waiting without burning a core.

## What changed from v3
- New `std::condition_variable cv`.
- `push()` releases the lock, then calls `cv.notify_one()`.
- New `wait_and_pop()`: `unique_lock` + `cv.wait(lock, predicate)`.
- `consumer()` uses `wait_and_pop()`, so idle consumers sleep at ~0% CPU.

## Files
| File | Deck step | What it is |
|---|---|---|
| `tiny.cpp` | 3–5 | `spin` (wasted checks), `nap` (latency), `locked` (deadlock) |
| `queue.hpp` | 8 | Queue v4 |
| `tests.cpp` | 8 | Consumers first, 1 × 1 million, 4 × 4 sum |
| `next_bug.cpp` | should fail | A wait without a predicate misses an early notify: frozen |

## Next
v5: prove it under load, then add a second queue and a second lock.
