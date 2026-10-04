# v5 · Many producers and consumers

**Topics:** correctness under load; two locks and deadlock.

## What changed from v4
- `tests.cpp` gains the load-test matrix: count and sum across 1×1 to 4×4,
  small and large N, slow producers and slow consumers.
- New private `push_locked()`. Public functions lock; private helpers assume the lock is held.
- New `push_all()`: one lock per batch (calling `push()` inside would lock `m` twice).
- New `move_all_to()`: `std::scoped_lock(m, other.m)` plus a self-move check.

## Files
| File | Deck step | What it is |
|---|---|---|
| `tiny_contention.cpp` | 3–5 | Lock per item vs local sum + lock once |
| `tiny_deadlock.cpp` | 3–5 | m1→m2 vs m2→m1: hangs; `fixed` uses scoped_lock |
| `queue.hpp` | 8 | Queue v5 |
| `tests.cpp` | 8 | Load matrix, opposite-direction moves, self-move, batching |
| `next_bug.cpp` | should fail | Consumers without a count never exit |

## Next
v6: give the queue a lifecycle (closed, notify_all, std::optional).
