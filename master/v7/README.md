# v7 · Generic queue<T>

**Topic:** templates and moving values. **End of Part 1.**

## What changed from v6
- `class Queue` becomes `template <class T> class ThreadSafeQueue`.
- Every transfer is a move: `push(T v)` moves in; `try_pop` and `wait_and_pop` move out.
- `producer()`/`consumer()` helpers are gone; the tests use lambdas.

## Files
| File | Deck step | What it is |
|---|---|---|
| `tiny.cpp` | 3–5 | Copy vs move with `unique_ptr`; `-DSHOW_BUG` shows what can't compile |
| `queue.hpp` | 8 | ThreadSafeQueue<T> |
| `tests.cpp` | 8 | unique_ptr, strings, 4×4 int matrix, move_all_to with unique_ptr |

No `next_bug.cpp`: every test passes. The next requirement is new rather than a
failure: "what if the queue carried work instead of data?"

## Part 1 checkpoint
Peer-review against the checklist in the deck. Point at any line and ask
"what bug does this line fix?"
