# v2 · Mutex protected

**Topic:** races and mutual exclusion.

## What changed from v1
- `std::mutex m` guards `q`. Every access to `q` happens while holding `m`.
- Locking is manual (`m.lock()` / `m.unlock()`), on purpose.
- `pop()` throws on an empty queue instead of undefined behaviour.

## Files
| File | Deck step | What it is |
|---|---|---|
| `tiny.cpp` | 3–5 | The racy counter (`race`, `mutex`, `local` modes). Build at -O0 |
| `queue.hpp` | 8 | Queue v2 |
| `tests.cpp` | 8 | 4 × 100,000 producers, 10 runs; cost of locking |
| `next_bug.cpp` | should fail | Consumer starts first, the throw leaves `m` locked: frozen |

## What you'll see, and why
| Run | You'll see | Why |
|---|---|---|
| `exp_mutex` | A locks, B waits at lock() until A leaves 0.5 s later | A mutex makes threads take turns: only one is ever inside. |
| `tiny` | 1,556,397 / 1,114,575 / ... never 2,000,000 | ++counter is read, add, write. Two threads interleave those steps and lose updates. |
| `tests` | 1 thread 44 ns/push, 4 threads 141 ns/push | Correct now, but 4 threads queue up for one mutex. |
| `next_bug` | hangs | pop() threw while holding the mutex; unlock() never ran. That's v3. |

## Next
v3: a destructor must release the lock, so exceptions can't skip it.
