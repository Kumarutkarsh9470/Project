# v8 · Task queue

**Topic:** work as data; exceptions across threads.

## What changed from v7
- `queue.hpp` is unchanged (ThreadSafeQueue<T>).
- New `task_queue.hpp`: a `ThreadSafeQueue<std::function<void()>>` plus one worker
  thread running the v6 consumer loop.
- The worker catches everything and hands it to an `ErrorHandler`, so one throwing
  task can't call `std::terminate`.

## Files
| File | Deck step | What it is |
|---|---|---|
| `tiny.cpp` | 3–5 | `terminate` (exception in a thread) and `carry` (exception_ptr) |
| `queue.hpp`, `task_queue.hpp` | 8 | Task queue v8 |
| `tests.cpp` | 8 | FIFO order, throwing task survives, capture by value |
| `next_bug.cpp` | should fail | A task's return value and errors never reach the submitter |

## Next
v9: N workers sharing the queue.
