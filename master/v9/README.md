# v9 · Thread pool

**Topics:** workers and sizing; real workloads (granularity, shared_mutex, call_once).

## What changed from v8
- `task_queue.hpp` becomes `pool.hpp`: `std::thread worker` → `ThreadGroup workers`
  (from v1) running N copies of the worker loop.
- Member order: `tasks` first (destroyed last), `workers` last (joined first).
- `default_workers()` handles `hardware_concurrency() == 0`.
- `default_pool()`: a function-local static, built once, thread-safely.
- New `dns_cache.hpp`: `shared_mutex` with `shared_lock` / `unique_lock`.

## Files
| File | Deck step | What it is |
|---|---|---|
| `tiny_workers.cpp` | 3–5 | Sleepy vs busy tasks on 1, 4, cores, 64 workers (-O2) |
| `tiny_granularity.cpp` | 3–5 | Lock around the whole job vs only push_back |
| `queue.hpp`, `pool.hpp`, `dns_cache.hpp` | 8 | Pool v9 + workload |
| `tests.cpp` | 8 | 8 tasks, drain 1000, handler gets errors, one default pool, cache readers |
| `next_bug.cpp` | should fail | Results and errors still can't reach the submitter |

## Next
v10: `submit()` returns a `std::future`.
