# SQLite Queue Hardening Spec

## Goal

Keep SQLite and the custom queue model, but redesign the queue so it can recover from crashes, avoid stale `converting` rows, and stop relying on in-memory flags as the main source of scheduling truth.

## Why This Exists

The current implementation in `app/lib/queue.ts` works as a basic single-process queue, but it has structural reliability gaps:

- `isProcessing` and `shouldProcessAgain` are local memory only.
- `processQueue()` is not triggered on application startup.
- rows can remain in `converting` if the process crashes mid-conversion.
- capacity is computed from `status = converting`, so stale rows can block the entire queue.
- job claiming is a select-then-update pattern, which is weaker than a lease-based design.

This document describes the strongest version of the current architecture that still fits SQLite and the existing application shape.

## Root-Cause Failure Modes

### Stale Converting Rows

If the process dies after setting `status = converting`, the row may never move again. Because active capacity is counted from those rows, the queue can freeze permanently.

### No Boot Recovery

There is no startup pass that looks for abandoned work. A process restart does not automatically resume queued jobs or repair stuck ones.

### In-Process Scheduling Only

The scheduler advances only when runtime code explicitly calls `processQueue()`. That makes recovery dependent on unrelated future events.

### Weak Claim Model

The current claim path reads one queued row and then tries to update it. It avoids duplicate execution in one process most of the time, but it is not a durable worker-lease model.

### No Heartbeat

There is no persistent signal that a conversion is still alive. The only timeout is local `AbortController`, which disappears if the process crashes.

## Target Design

Replace in-memory coordination with database-backed leases and recovery loops.

### Core Rules

- queued work is discovered from SQLite
- execution ownership is represented by a lease stored in SQLite
- every active conversion has an expiry time
- a recovery loop repairs expired leases
- startup always runs a repair pass before accepting normal work
- `conversions` remains the only business-status table

## Proposed Schema Additions

Add fields to `conversions`:

```sql
lease_id TEXT,
lease_holder_instance_id TEXT,
lease_expires_at TEXT,
last_heartbeat_at TEXT,
conversion_attempts INTEGER DEFAULT 0,
recovery_attempt_count INTEGER DEFAULT 0
```

Optional but recommended supporting table:

```sql
CREATE TABLE conversion_recovery_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  conversion_id TEXT NOT NULL,
  event_type TEXT NOT NULL,
  previous_status TEXT,
  new_status TEXT,
  reason TEXT,
  occurred_at TEXT DEFAULT (datetime('now'))
);
```

Why keep lease data on `conversions`:

- simpler read path for status checks
- no join needed for active-job inspection
- fewer moving parts than a separate lease table

## Lease Model

Recommended constants:

```ts
MAX_CONCURRENT_JOBS = 5
CONVERSION_TIMEOUT_MS = 30_000
LEASE_DURATION_MS = 90_000
HEARTBEAT_INTERVAL_MS = 15_000
RECOVERY_INTERVAL_MS = 30_000
MAX_CONVERSION_ATTEMPTS = 3
```

Interpretation:

- converter still has a hard local timeout of 30 seconds
- lease lasts longer than the converter timeout to tolerate DB jitter and shutdown delays
- worker renews lease periodically while conversion is running
- if the lease expires, another recovery pass can safely requeue or fail the row

## Lifecycle

### Enqueue

- update eligible rows from `uploaded` or `pending_payment` to `queued`
- clear any stale lease fields when moving back to `queued`
- trigger the scheduler loop

### Claim

Claim must become a single durable operation.

Required behavior:

- only claim rows with `status = queued`
- select in FIFO order by `createdAt`
- atomically set:
    - `status = converting`
    - `lease_id = <uuid>`
    - `lease_holder_instance_id = <instance id>`
    - `lease_expires_at = now + LEASE_DURATION_MS`
    - `last_heartbeat_at = now`
    - `conversion_started_at = now`
    - `conversion_attempts = conversion_attempts + 1`

If the claim fails because another worker or loop already claimed the row, continue scanning.

### Renew

During conversion, renew the lease on an interval:

- update `lease_expires_at`
- update `last_heartbeat_at`
- only renew if both `id` and `lease_id` still match

If renewal fails, abort the conversion because ownership is no longer guaranteed.

### Complete

Completion must clear lease fields and write the final status atomically.

On success:

- set `status = completed`
- set `expiresAt = now + 1 hour`
- clear lease fields
- set tool metadata and output size
- increment rate limit only if `wasPaid = 0`

On failure or timeout:

- set `status = failed` or `timeout`
- clear lease fields
- write `errorMessage`
- write completion timestamp

## Recovery Algorithm

### On Startup

Before normal queue processing begins:

1. find rows with `status = converting` where `lease_expires_at` is null
2. find rows with `status = converting` where `lease_expires_at < now`
3. for each row:
    - if `conversion_attempts < MAX_CONVERSION_ATTEMPTS`, move back to `queued`
    - otherwise mark `failed` with `errorMessage = 'Conversion abandoned after worker restart.'`
4. clear stale lease fields
5. log a recovery event
6. start the normal scheduler

### Periodic Recovery Loop

Run every 30 seconds:

1. detect expired leases
2. repair rows the same way as startup recovery
3. trigger scheduling if new capacity is available

This is what prevents stale `converting` rows from blocking the queue forever.

## Scheduler Design

The scheduler can still be in-process, but it should no longer rely on `isProcessing` alone as the correctness boundary.

Recommended shape:

- keep a lightweight process-local mutex only to avoid redundant loops in one process
- treat the DB lease as the real ownership mechanism
- drain until active lease count reaches the concurrency limit
- compute active count from non-expired leases, not only `status = converting`

That means capacity should be determined by something like:

- `status = converting`
- and `lease_expires_at > now`

not just the raw count of all converting rows.

## Multi-Instance Limits

What SQLite can reasonably support:

- one web process and one worker loop on the same host
- small concurrency on local disk
- WAL mode enabled

What SQLite should not be expected to handle well here:

- many worker processes across hosts
- distributed queue consumers over networked storage
- high write contention with large retry volumes

This hardening plan makes the queue safer, but it does not turn SQLite into a true distributed queue backend.

## Required Repo Changes

Likely file changes:

- `app/lib/db/schema.ts`
  add lease and recovery fields
- `drizzle/*`
  add migration for the new columns and optional recovery table
- `app/lib/queue.ts`
  replace local-only coordination with lease claim, heartbeat, and recovery logic
- `app/lib/db/index.ts`
  enable WAL mode if not already enabled
- `app/lib/stripe.ts`
  keep enqueue semantics, but ensure requeue clears stale lease fields when necessary
- optional new `app/lib/queue-recovery.ts`
  isolate startup and periodic recovery logic
- optional new `app/lib/queue-types.ts`
  shared queue constants and types

## Phased Implementation Plan

### Phase 1

- add schema fields and migration
- enable WAL mode
- add instance identifier and lease constants

### Phase 2

- rewrite claim flow around leases
- rewrite active-capacity calculation to ignore expired leases
- clear lease fields on all final states

### Phase 3

- add heartbeat renewal during conversion
- abort conversions if lease renewal fails
- add startup recovery pass

### Phase 4

- add periodic recovery loop
- add recovery event logging
- add tests for crash and stale-lease scenarios

## Test Plan

### Unit Tests

- enqueue from `uploaded` moves row to `queued`
- enqueue from `pending_payment` moves row to `queued`
- claim sets lease fields and increments attempts
- complete clears lease fields
- timeout clears lease fields and writes final status

### Concurrency Tests

- two concurrent claims do not both acquire the same row
- expired `converting` rows do not count against active capacity
- repeated enqueue calls do not produce duplicate active execution

### Recovery Tests

- startup requeues stale `converting` rows
- startup fails rows that exceeded max attempts
- periodic recovery repairs expired leases
- rate limit is only incremented after a successful unpaid completion

### Integration Tests

- upload -> convert -> completed end-to-end
- payment_required -> webhook -> queued -> completed
- process restart during conversion -> recovery -> retry or fail as designed

## Non-Goals

- adding Redis
- migrating to BullMQ
- redesigning the public API
- adding distributed multi-host workers
- changing the payment model

## Recommendation

If the project must stay on SQLite for now, implement this hardening plan before adding more conversion types. It fixes the real operational hazards in the current queue with the smallest infrastructure change.

If the project is ready to accept Redis, prefer the BullMQ migration instead of fully investing in this path. The SQLite hardening work is worthwhile, but it is still a local queue design with an upper ceiling.

## Implementation Checklist

- [ ] Add lease fields to `conversions`
- [ ] Add migration for queue hardening fields
- [ ] Enable SQLite WAL mode
- [ ] Introduce `INSTANCE_ID` and lease constants
- [ ] Rewrite claim logic to set durable leases
- [ ] Add heartbeat renewal during execution
- [ ] Clear lease fields on success, failure, and timeout
- [ ] Add startup recovery pass
- [ ] Add periodic stale-lease repair loop
- [ ] Count only live leases toward concurrency
- [ ] Add recovery logging
- [ ] Add race and restart tests
