# v1 · Multiple threads

**Topic:** thread lifetime and ownership.

## What changed from v0
- The producer and consumer run on their own `std::thread`s.
- The queue is passed with `std::ref(queue)`: `std::thread` copies its arguments.
- New `common/thread_group.hpp`: an RAII owner that joins every thread in its destructor,
  so an exception between starting and joining can't call `std::terminate`.
- The queue code itself is identical to v0.

## Files
| File | Deck step | What it is |
|---|---|---|
| `tiny.cpp` | 3–5 | `terminate`, `detach` (dangling local) and `join` modes |
| `queue.hpp`, `../common/thread_group.hpp` | 8 | Queue v1 + RAII thread owner |
| `tests.cpp` | 8 | Must-pass tests |
| `next_bug.cpp` | should fail | 4 producers at once: crashes or hangs (try `next_bug 1000` too) |

## What you'll see, and why
| Run | You'll see | Why |
|---|---|---|
| `tiny terminate` | the program aborts | A joinable std::thread was destroyed: std::terminate. |
| `next_bug` | segmentation fault or hang | 4 producers push into one unprotected std::queue at once and corrupt it. That's v2. |

## Next
v2: the crash in `next_bug` is a data race. A mutex fixes it.
