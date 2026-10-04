# v6 · Graceful shutdown

**Topic:** a lifecycle for the queue.

## What changed from v5
- New `closed` flag, guarded by `m`.
- `push()` and `push_all()` return `false` after shutdown.
- `wait_and_pop()` returns `std::optional<int>`; its predicate checks `!q.empty() || closed`.
- New `shutdown()`: set `closed` under the lock, then `cv.notify_all()`.
- `consumer()` no longer needs a count: `while (auto x = q.wait_and_pop())`.

## Files
| File | Deck step | What it is |
|---|---|---|
| `tiny.cpp` | 3–5 | One flag, two waiters: `notify_one` hangs, `fixed` uses `notify_all` |
| `queue.hpp` | 8 | Queue v6 |
| `tests.cpp` | 8 | Wakes 4 waiters fast, drains 1000 items, rejects late pushes, matrix without n |
| `next_bug.cpp` | should fail | `-DSHOW_BUG`: a `unique_ptr` can't go into an int queue |

## What you'll see, and why
| Run | You'll see | Why |
|---|---|---|
| `tiny` | hangs | notify_one woke one waiter; the other sleeps forever. notify_all fixes it. |
| `next_bug` | doesn't compile with -DSHOW_BUG | The queue only holds int. That's v7. |

## Next
v7: `ThreadSafeQueue<T>`, which moves its values.
