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

## What you'll see, and why
| Run | You'll see | Why |
|---|---|---|
| `tiny_raii` | try_lock after the exception: 0 | The mutex is still locked. lock_guard would have unlocked it in its destructor. |
| `tiny_interface` | top() hit an empty stack in 186 of 200 rounds | empty() and top() each lock, but the gap between the two calls is a race. |
| `next_bug` | checked an empty queue ~10 million times in 1 s | An idle consumer spinning on try_pop burns a whole core. That's v4. |

## Next
v4: a condition variable lets the consumer sleep until a push.
