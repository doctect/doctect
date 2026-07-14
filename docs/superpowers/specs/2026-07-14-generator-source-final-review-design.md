# Generator Source Final Review Design

**Goal:** Close whole-branch security, consistency, transaction, validation, typing, protocol, and accessibility findings without changing source persistence semantics or 10,000 ms sandbox timeout.

## Preview And Sandbox

Each modal preview owns one `AbortController`. Source changes, accepted preset/reset changes, accepted close/Escape, successful Apply/Detach, unmount, and a replacement preview abort that controller. Cancellation reaches `runGeneratorSandbox`, which disposes iframe, Worker, MessagePort, URL, timeout, and listeners exactly once.

Worker captures trusted result port and methods before evaluating source. Source sees `Worker`, `SharedWorker`, `BroadcastChannel`, `MessageChannel`, and global `postMessage` as unavailable. Result delivery remains on captured private `MessagePort`; CSP remains network backstop. Chromium tests observe Worker termination, frame removal, fan-out denial, message-spam denial, and stable resource counts across repeated previews.

## Generated Data Safety

Generated validation requires every reference target, rejects reference cycles, and bounds reference depth. Grid traversal paths must be arrays of bounded depth containing non-negative safe-integer slice values. PDF reference lookup and grid traversal use iterative visited/depth-bounded loops, preserving output for valid chains and grids while terminating malformed persisted input.

## Publish Consistency And Accessibility

Disclosure readiness retains exact fetched cloud-head state. Page list, default selection, active variant, and thumbnails derive only from that retained state. Local editor state is explanatory context only and cannot affect published previews. Head changes invalidate all retained head-derived state.

Publish modal uses labelled modal dialog semantics, initial focus, Tab containment, Escape/overlay/accessible close, focus restoration, and alert semantics for operational errors.

Client sends `If-Match` as a quoted strong entity tag. Server accepts one quoted entity tag, extracts its opaque value, and rejects malformed forms.

## Transactions

`server/db.js` exposes `withTransaction(txQuery => ...)`. PostgreSQL pins one pool client for `BEGIN` through `COMMIT`/`ROLLBACK`. SQLite serializes top-level operations, starts `BEGIN IMMEDIATE`, and uses async-local transaction context so helper calls share transaction while unrelated requests wait and cannot leak writes into it.

Publish validates input before entering transaction, locks/serializes project row, compares expected head, updates metadata, replaces thumbnails, and reads result in one transaction. Any error rolls back all visibility, metadata, and thumbnail changes.

MR merge computes candidate outside transaction, then transaction-locks MR and target project, verifies target head equals computed head, inserts merge commit, advances target, and marks MR merged atomically. Head mismatch returns stable 409 with no MR or commit mutation. Any later failure rolls back commit and head changes.

## Metadata And Repository Hygiene

`generatedAt` accepts only canonical `Date.prototype.toISOString()` text. Lenient metadata strips unknown fields; exact UTF-8 boundaries remain accepted. Current-v9 loading leaves input immutable. Tracked Task-4 report is removed from index but remains ignored in workspace. Existing Task-6 design/plan stay unchanged.

## Verification

Every behavior begins with focused RED regression, then minimal GREEN implementation. Final gates: complete unit suite, production build, `npx tsc --noEmit --pretty false` compared to `main`, complete isolated Chromium and Firefox e2e, and explicit WebKit status. Final ignored report records RED/GREEN evidence, transaction/security models, commands, counts, commits, and residuals.
