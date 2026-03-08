# BullMQ Migration Spec

## Goal

Replace the in-process queue in `app/lib/queue.ts` with a Redis-backed BullMQ worker model so conversion scheduling, retries, and stalled-job recovery are handled by queue infrastructure instead of local process state.

## Why This Exists

The current queue mixes durable database state with in-memory scheduler state:

- Conversion status is stored in SQLite.
- Scheduling coordination depends on `isProcessing` and `shouldProcessAgain` in process memory.
- Restarted or crashed processes can leave rows stuck in `converting`.
- There is no startup recovery pass that resumes or repairs abandoned work.
- The queue only advances when `enqueueJob()` or `runConversion()` calls `processQueue()`.

BullMQ addresses the specific reliability gaps the current design leaves open:

- durable queued work in Redis
- worker concurrency managed outside the web request process
- stalled-job detection and recovery
- built-in retries and backoff
- cleaner process separation between HTTP and conversion execution

## Recommended Architecture

Run three services in development and production:

1. `app-server`
   Handles SSR, upload, checkout creation, Stripe webhook processing, status polling, and downloads.
2. `app-worker`
   Runs BullMQ workers and executes conversions.
3. `redis`
   Stores queue state, delayed jobs, retry state, and worker heartbeats.

SQLite remains the business database. The `conversions` table remains the source of truth for user-visible state. BullMQ owns dispatching, retries, and worker coordination.

## Responsibility Split

### Web Server

- create conversion rows on upload
- check rate limits on `/api/convert`
- mark `payment_required` or `pending_payment` when needed
- enqueue BullMQ jobs after free-usage approval or Stripe confirmation
- return immediately to the client after enqueue
- serve status from the database, not from Redis

### Worker

- receive conversion jobs from BullMQ
- claim and update conversion rows to `converting`
- execute the appropriate converter with timeout and cancellation
- write `completed`, `failed`, or `timeout` back to SQLite
- increment the free quota only after a successful unpaid conversion

## Queue Contract

Use one queue named `conversions`.

Suggested BullMQ payload:

```ts
type ConversionJobData = {
    fileId: string
    conversionType: string
    inputFilePath: string
    sourceFormat: string
    targetFormat: string
    wasPaid: boolean
    ipAddress: string
}
```

Use `jobId = fileId` to make enqueueing idempotent. That prevents the same conversion from being scheduled multiple times due to repeated API calls or webhook replays.

## Business State Rules

Keep these status transitions in SQLite:

- `uploaded -> queued`
- `uploaded -> payment_required`
- `payment_required -> pending_payment`
- `pending_payment -> queued`
- `queued -> converting`
- `converting -> completed | failed | timeout`
- `completed -> expired`

Redis job state should not be treated as user-facing truth. UI polling should continue to read `conversions.status` from SQLite.

## BullMQ Behavior

Recommended initial configuration:

```ts
attempts: 3
backoff: { type: 'exponential', delay: 2000 }
removeOnComplete: { age: 3600 }
removeOnFail: false
concurrency: 5
```

Operational interpretation:

- Retry only transient worker failures.
- Do not retry invalid conversion types, missing source files, or unsupported tool configurations.
- Keep failed jobs available for inspection until an explicit cleanup decision is made.

## Idempotency Model

Idempotency must be enforced at two layers:

### Enqueue Idempotency

- BullMQ `jobId` must equal `fileId`.
- Replayed Stripe webhooks should not create duplicate jobs.
- Repeat `/api/convert` requests should not schedule duplicate work for the same conversion row.

### Worker Idempotency

- Worker must re-read the conversion row before execution.
- If row status is already `completed`, worker exits without doing work.
- If row status is not `queued`, worker should log and no-op unless explicitly recovering a retry.
- Output file naming should stay deterministic: `{fileId}-output.{ext}`.

## Required Repo Changes

Likely file changes:

- `package.json`
  Add BullMQ and Redis client dependencies. Add a worker script.
- `docker-compose.yml`
  Add a Redis service and a worker service.
- `Dockerfile`
  Support server and worker roles from the same image.
- `app/lib/queue.ts`
  Replace with a thin enqueue wrapper or remove after migration.
- `app/lib/db/index.ts`
  Enable SQLite WAL mode for safer concurrent access from web and worker processes.
- `app/lib/stripe.ts`
  Continue calling enqueue, but through the BullMQ-backed wrapper.
- `app/server/api/convert.ts`
  Queue via BullMQ instead of invoking local processing.
- `app/server/api/webhook/stripe.ts`
  Keep webhook logic, but rely on BullMQ enqueue idempotency.
- new `app/lib/queue-config.ts`
  Central Redis and BullMQ configuration.
- new `app/server/worker.ts`
  BullMQ Worker entrypoint and job processor.
- optional new `app/lib/queue-events.ts`
  Shared queue event listeners for logging and metrics.

## Environment Changes

Add:

```bash
REDIS_URL=redis://redis:6379
PROCESS_TYPE=server
```

The worker should run with `PROCESS_TYPE=worker` or an equivalent dedicated entrypoint.

## Deployment Model

### Small VPS Recommendation

For the current project size, a single VPS is enough:

- one app server process
- one BullMQ worker process
- one local Redis container

This is a good fit for a $5-10 VPS as long as conversion tools are installed locally and conversion concurrency stays capped at 5.

### SQLite Note

SQLite can remain in place for now, but enable WAL mode and keep the database file on local disk. Networked volumes or shared filesystem setups will make this fragile.

## Startup and Shutdown Requirements

### Worker Startup

- connect to Redis
- connect to SQLite
- start BullMQ worker with concurrency 5
- optionally register queue event listeners for failed, completed, and stalled jobs
- run a one-time recovery pass on rows left in `converting` from the pre-BullMQ implementation during migration

### Worker Shutdown

- stop accepting new BullMQ jobs
- allow in-flight conversions to finish or abort cleanly
- close Redis and DB connections
- ensure child process termination on SIGTERM/SIGINT

## Failure Handling Rules

### Retryable

- transient subprocess failures
- worker process crash during conversion
- temporary OS-level resource pressure

### Non-Retryable

- unknown conversion slug
- converter missing from registry
- source file missing
- conversion produced no output file
- invalid conversion state for the job row

On the final failed attempt, the worker must write `failed` with a user-safe `errorMessage` into the `conversions` row.

## API Integration Touchpoints

### Upload Flow

No change. Upload still creates a row with `status = uploaded`.

### Convert Flow

Current behavior should stay semantically identical:

1. read conversion row
2. check rate limit
3. if blocked, mark `payment_required`
4. if allowed, enqueue BullMQ job and mark `queued`

### Stripe Flow

After verified payment:

1. mark payment completed
2. mark conversion `wasPaid = 1`
3. enqueue BullMQ job idempotently
4. set conversion `status = queued` if still waiting for work

## Rollout Plan

### Phase 1

- add Redis service
- add BullMQ dependencies
- create BullMQ config and worker entrypoint
- keep old queue code intact

### Phase 2

- route new enqueue operations through BullMQ
- keep status polling and download paths unchanged
- run worker locally and in staging

### Phase 3

- deploy BullMQ worker in production
- verify conversions complete end to end
- confirm webhook replay does not duplicate work
- monitor failed, stalled, and completed job counts

### Phase 4

- remove direct `processQueue()` execution path
- simplify or delete the old in-process scheduler code

## Risks and Tradeoffs

### Benefits

- stronger delivery model than in-process scheduling
- clearer failure semantics
- easier horizontal scaling later
- better observability and operations

### Costs

- adds Redis to the stack
- increases deployment complexity
- introduces another moving part for a small project
- keeps SQLite as a separate durability layer, so queue and business state live in different systems

## Non-Goals

- migrating from SQLite to Postgres in the same change
- changing public API response shapes
- redesigning conversion tools or converter registry behavior
- adding user accounts or history features

## Implementation Checklist

- [ ] Add BullMQ and Redis dependencies
- [ ] Add Redis service to Docker Compose
- [ ] Enable SQLite WAL mode
- [ ] Create BullMQ queue config module
- [ ] Create worker entrypoint
- [ ] Port `runConversion()` into worker processor
- [ ] Make enqueue idempotent with `jobId = fileId`
- [ ] Update `/api/convert` to enqueue BullMQ jobs
- [ ] Update Stripe webhook path to enqueue BullMQ jobs
- [ ] Add graceful shutdown for worker
- [ ] Add queue failure logging and metrics
- [ ] Remove or isolate legacy `processQueue()` flow
