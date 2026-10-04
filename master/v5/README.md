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

## What you'll see, and why
| Run | You'll see | Why |
|---|---|---|
| `tiny_contention` | lock per item 413 ms, lock once 3 ms | Same answer. The cost is fighting over the lock, not the lock itself. |
| `tests` | 1x4 with 200,000 items: ~3 s; batches 4x faster than single pushes | One mutex shared by every thread is the bottleneck. |
| `tiny_deadlock / next_bug` | hangs | Each thread holds one lock and waits for the other's: a cycle. |

## Next
v6: give the queue a lifecycle (closed, notify_all, std::optional).
