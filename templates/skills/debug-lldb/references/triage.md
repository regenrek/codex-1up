# Stack Trace Triage (Quick Patterns)

Keep this brief. Use it to classify the hang before deep dive.

## Deadlock or lock inversion
- Main/UI thread waiting on a mutex/lock or condition variable.
- Worker/background thread holding that lock while waiting on the main thread (e.g., blocking IPC, event emit, or UI eval).
- Symptom: both threads stuck; repeating stack captures show the same frames.

## Busy loop / high CPU
- Same thread repeatedly shows tight loop frames with no blocking syscall.
- Repeating stack captures change quickly or show identical hot frames.

## Blocking I/O or IPC
- Thread waiting in read/recv/poll/select/epoll/kqueue.
- Another thread may be waiting on a response or callback that never arrives.

## Main-thread reentrancy
- UI thread shows nested event loop calls or re-entrant dispatch.
- Usually caused by synchronous calls into UI from background threads.

## Next actions
- Take 3-5 stack samples 0.2–1s apart.
- Compare main thread vs worker threads for lock ownership/wait.
- Correlate with app logs around the stall time.
