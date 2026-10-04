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

## Next
v3: a destructor must release the lock, so exceptions can't skip it.
