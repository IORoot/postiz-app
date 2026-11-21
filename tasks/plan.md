# Implementation Plan: Idempotent pipeline enqueue

Source spec: `spec/SPEC-pipeline-enqueue.md`

## Overview

Add `POST /public/v1/pipelines/enqueue`. A pure function accepts a missing key or a 64-character SHA-256 hex digest and stores it lowercase. The public controller passes that key into the existing `PipelineService.enqueue`, which already returns the original queue item when the key matches and does not update the draft. The Prisma unique on `idempotencyKey` becomes `(pipelineId, idempotencyKey)`, so the same file can be queued on two pipelines. The schema file changes. `prisma db push` is not run.

## Architecture Decisions

- `normalizeIdempotencyKey` lives in `public.pipeline.enqueue.ts`. Unit tests cover it. The manager's replay branch is already implemented and is not wrapped in a new database test.
- The controller calls `PipelineService.enqueue(orgId, body, 'API', key)`. No new create path. The body passed through is the request without `idempotencyKey`, so the manager still receives `pipelineId` and `post`.
- `getQueueItemByIdempotencyKey` is left without a `deletedAt` filter. A date-promote keeps the key on a soft-deleted row, and that row stays the replay. Clearing the key is `queue-delete`.
- `PipelinesController.enqueue` is not edited. The dashboard route keeps ignoring the key.
- The schema edit removes `@unique` from the field and adds `@@unique([pipelineId, idempotencyKey])`. Null keys stay allowed. No push, no migration directory.

## Dependency Graph

```
normalizeIdempotencyKey + unit test
        │
        ├── schema unique (pipelineId, idempotencyKey)
        │
        └── POST /public/v1/pipelines/enqueue
```

The normalizer comes first. The schema edit and the route both depend on that contract and can land in either order after it. This plan does them in that order: normalizer, schema, route.

## Task List

### Phase 1: Idempotent enqueue

- [x] Task 1: Key normalizer and unit test
- [x] Task 2: Per-pipeline unique index in the schema
- [x] Task 3: Public enqueue route

### Checkpoint: Idempotent enqueue

- [x] Focused Jest test passes
- [x] `pnpm run build:backend` succeeds
- [x] `schema.prisma` shows the composite unique and no field-level `@unique` on `idempotencyKey`
- [ ] Human review before the next module

## Risks and Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| `prisma db push` against production | High | Do not run it. The schema file is the only schema change. |
| Adding `deletedAt: null` to the key lookup makes a date-promote replay create a second draft, then fail the unique index | High | Do not change `getQueueItemByIdempotencyKey`. |
| The dashboard route starts storing keys and changes current callers | Med | Do not edit `PipelinesController.enqueue`. |
| A replay overwrites the saved draft | High | Pass the key into the existing manager argument. Do not add an update on the replay branch. |

## Open Questions

None.
