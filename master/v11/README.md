# v11 · Atomics

**Topic:** std::atomic, read-modify-write operations, memory ordering.

## What changed from v10
- The pool counts tasks with two `std::atomic<std::size_t>` counters.
  `submit()` increments `submitted`; a new private `run()` executes a task and
  increments `completed`. Both are read by `tasks_submitted()` / `tasks_completed()`
  without taking any lock.
- `memory_order_relaxed` is enough: each counter only has to be exact on its own.

## Files
| File | What it is |
|---|---|
| `tiny_atomic.cpp` | The v2 counter: no lock (wrong), mutex, atomic. Build at -O2 |
| `tiny_publish.cpp` | release/acquire: publishing plain data through an atomic flag |
| `pool.hpp`, `queue.hpp`, `thread_group.hpp` | Pool v11 |
| `tests.cpp` | Counters match, lock-free monitoring, v10 behaviour unchanged |
| `next_bug.cpp` | should fail to scale: one mutex for both ends of the queue |

## Next
v12: a queue with separate head and tail locks.
