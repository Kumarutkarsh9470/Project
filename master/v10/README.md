# v10 · Future-based results

**Topics:** future and packaged_task; promise and shared_future; timeouts and
cancellation; tasks waiting on tasks. **Final version.**

## What changed from v9
- `submit(F f)` returns `std::future<decltype(f())>`, built from a
  `std::packaged_task` held in a `shared_ptr` (std::function needs copyable callables).
- The worker loop loses its `try/catch` and the `ErrorHandler`: the
  packaged_task stores the exception and `get()` rethrows it in the caller.
- `submit()` throws after shutdown instead of returning `false`.
- New `wait_helping(future)`: runs queued tasks while waiting, so tasks can wait
  for tasks without deadlocking the pool.
- Cancellation is cooperative: tasks take a `std::stop_token` (see `tests.cpp`).

## Files
| File | Deck step | What it is |
|---|---|---|
| `tiny_future.cpp` | 3–5 | async vs deferred thread ids; get() rethrows |
| `tiny_promise.cpp` | 3–5 | Two readers on one future; `shared`; `broken` |
| `tiny_timeout.cpp` | 3–5 | Times out at 1 s, leaves the scope at 3 s |
| `tiny_nested.cpp` | 3–5 / should fail | get() inside tasks deadlocks; `helping` fixes it |
| `queue.hpp`, `pool.hpp` | 8 | Pool v10 |
| `tests.cpp` | 8 | 42, exceptions, 100k tasks, shared_future, cancellation, recursive psum |

## What you'll see, and why
| Run | You'll see | Why |
|---|---|---|
| `tiny_future` | deferred runs on main's thread; get() rethrew | A future carries a value or an exception, once. |
| `tiny_promise` | second get(): No associated state | get() moves the result out; it's one-shot. |
| `tiny_timeout` | timed out at 1.0 s, left the scope at 3.0 s | A timeout stops waiting, not work. async's future waits in its destructor. |
| `tiny_nested` | hangs | Every worker waits in get() for a task that needs a free worker. |

## Next phase
The memory model and atomics, then lock-based and lock-free structures. The same
queue goes on: head/tail locks, then an SPSC ring buffer (the Feed Handler's core).
