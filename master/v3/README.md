# v3 · RAII locking

**Topics:** exceptions and RAII locks; interface races.

## What changed from v2
- `std::lock_guard` in every member function. No manual `lock()`/`unlock()`.
- `pop()` is gone. `try_pop(int&)` checks, reads and removes under one lock.
- `empty()` and `size()` are `const`, so the mutex is `mutable`.
- `consumer()` loops on `try_pop()`. It works, but spins while the queue is empty.

## Files
| File | Deck step | What it is |
|---|---|---|
| `tiny_raii.cpp` | 3–5 | The lock that never unlocks (prints 0) |
| `tiny_interface.cpp` | 3–5 | SafeStack: every call locks, `top()` still hits an empty stack |
| `queue.hpp` | 8 | Queue v3 |
| `tests.cpp` | 8 | Consumer-first, two consumers with slow producers, 4 producers |
| `next_bug.cpp` | should fail | Counts empty checks per second: a core burned doing nothing |

## Next
v4: a condition variable lets the consumer sleep until a push.
