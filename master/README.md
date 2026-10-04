# Master version · From a Broken Queue to a Thread Pool

The instructor's reference implementation: one self-contained folder per version.
v0–v10 are the concurrency track; v11–v14 continue the bridge (atomics, lock-based
and lock-free structures, benchmarking) toward the project tracks.
Each folder compiles on its own and passes its own tests. Copy a folder to give a
pair that fell behind a clean starting point for the next session.

**Don't show students these files ahead of time.** Reveal one requirement at a time;
use this to stay one or two versions ahead of the room.

| Version | Topic | Main files | Should-fail demo |
|---|---|---|---|
| [v0](v0/) | Ordinary queue · concurrency vs parallelism | `queue.hpp` | none |
| [v1](v1/) | Multiple threads · lifetime, std::ref, RAII | `queue.hpp`, `thread_group.hpp` | 4 producers crash |
| [v2](v2/) | Mutex protected · races | `queue.hpp` | exception leaves the mutex locked |
| [v3](v3/) | RAII locking · interface races | `queue.hpp` | idle consumer spins |
| [v4](v4/) | condition_variable · waiting | `queue.hpp` | wait without a predicate |
| [v5](v5/) | Many producers/consumers · deadlock | `queue.hpp` | consumers never exit |
| [v6](v6/) | Graceful shutdown | `queue.hpp` | int-only queue (compile) |
| [v7](v7/) | Generic ThreadSafeQueue<T> | `queue.hpp` | none (Part 1 checkpoint) |
| [v8](v8/) | Task queue · exceptions across threads | `task_queue.hpp` | results lost |
| [v9](v9/) | Thread pool · sizing, granularity, shared_mutex | `pool.hpp`, `dns_cache.hpp` | results lost |
| [v10](v10/) | Future-based results | `pool.hpp` | `tiny_nested` without helping |
| [v11](v11/) | Atomics · relaxed counters, release/acquire | `pool.hpp` | one mutex doesn't scale |
| [v12](v12/) | Two-lock queue · fine-grained locking | `two_lock_queue.hpp` | still slow for 1P/1C |
| [v13](v13/) | Lock-free SPSC ring buffer · cache lines | `spsc_ring.hpp` | two producers break it |
| [v14](v14/) | Benchmark harness · latency percentiles | `bench.hpp`, `bench.cpp` | none (final) |

## Every folder has
- `main.cpp`: a small complete program using that version (v14 uses `bench.cpp`). The deck shows it, with every header, at the end of each version.
- `tiny*.cpp`: the tiny example from the deck (steps 3–5). Many take a mode argument; run with no argument for usage.
- the project files (step 8): `queue.hpp`, later `task_queue.hpp` / `pool.hpp`.
- `tests.cpp`: the must-pass tests for that version.
- `next_bug.cpp`: the test marked **should fail** in the deck: it crashes, hangs or
  doesn't compile, and that failure is the next version's problem.
- a short **What you'll see, and why** table: the real output of each program and the reason for it.

## What to study
Read and write the version's main file (`queue.hpp`, later `task_queue.hpp`, `pool.hpp`, `two_lock_queue.hpp`, `spsc_ring.hpp`, `bench.hpp`) and the tiny examples. Run the tests and demos and compare with the README table.

`common/` holds the helpers every version uses: `check.hpp` (test macros), `stopwatch.hpp` (timing) and `thread_group.hpp` (joins threads; you meet it in v1). You don't need to study them.

## Build and run
Needs GCC 11+, Clang 14+ or MSVC 2022 with C++20. On this machine use w64devkit's
GCC (`C:\w64devkit\bin`); the old MinGW 6.3 on the PATH has no `std::thread`.

```bash
./build_all.sh            # compile everything, run every version's tests
./build_all.sh --demos    # also run tiny examples and next_bug demos (with timeouts)
```

On Windows without bash: `build_all.bat`.

By hand, one version:
```bash
cd v4
g++ -std=c++20 -O0 -g -pthread -I../common tests.cpp -o tests && ./tests
```
Explore races at `-O0`; measure speed at `-O2`. Demos that deadlock on purpose say so
at the top of the file: stop them with Ctrl+C.

## Notes from verification (GCC 16.2, Windows)
- v1 `next_bug 1000` prints the right total; `next_bug` (100,000) segfaults or hangs.
- v2 `tiny` at -O0: 1.05M–1.78M instead of 2M. The `local` mode is correct and fastest.
- `std::this_thread::sleep_for(1ms)` lasts ~13 ms on Windows, so slow-producer rows take longer than the numbers suggest.
- v10 `tiny_timeout`: times out at ~1 s, leaves the scope at ~3 s.
