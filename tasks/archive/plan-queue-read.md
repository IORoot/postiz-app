# Implementation Plan: Public queue item read

Source spec: `spec/SPEC-queue-read.md`

## Overview

Add `GET /public/v1/pipelines/queue/{id}`. A pure mapper turns one queue item plus its live root posts into the public body: `draft`, `scheduled`, `published`, or `error`, the item time, the queue error, and one channel entry each. `PipelineService.getPublicQueueItem` loads the row, and only for a `QUEUED` or `CREATING` item fills the projected slot from the same upcoming-slot helper the calendar uses. The existing public pipelines controller returns that object, or a 404 when the item is missing or has no live root posts.

## Architecture Decisions

- The mapper lives in `public.queue.read.ts`, same pattern as `public.pipeline.list.ts`. Unit tests cover every status rule, including a draft whose posts already have a `publishDate`. The mapper uses that date on channels. It does not use it as the item `scheduledFor` while the status is `draft`.
- `getItem` stays as it is. It only returns a `QUEUED` row and is a dashboard helper. Date-promote sets the queue row to `REMOVED` and `deletedAt` while leaving the posts live, so a new repository read includes those rows and their non-deleted root posts.
- A user-deleted item soft-deletes the posts. The new read still finds the queue row, sees no live root posts, and the service returns null. The controller turns null into `404 { msg: 'Queue item not found' }`. Another organization's id is the same null. No 403.
- Projection is the queued-item index. The repository returns that pipeline's `QUEUED`, non-deleted item ids ordered by `position`, `createdAt`, `id`. The service calls `getUpcomingPipelineSlots` with that count and takes `[index]`. Inactive pipelines and pipelines with no slots pass no projection. `PUBLISHING`, `PUBLISHED`, `FAILED`, and `REMOVED` do not use a projection.
- No Prisma migration. `GET /public/v1/pipelines` and dashboard `GET /pipelines` stay unchanged.

## Dependency Graph

```
toPublicQueueItem + unit test
        │
        ▼
Repository read + getPublicQueueItem
        │
        ▼
GET /public/v1/pipelines/queue/:id
```

Nothing in this module can be built in parallel. There is no schema step.

## Task List

### Phase 1: Queue read

- [x] Task 1: Status mapper and unit test
- [x] Task 2: Load the row and project a slot
- [x] Task 3: Public route

### Checkpoint: Queue read

- [x] Focused Jest test passes
- [x] `pnpm run build:backend` succeeds
- [ ] Human review before the next module

## Risks and Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| Changing `getItem` hides date-promoted rows or breaks dashboard actions that expect a `QUEUED` item | High | New repository method. Do not change `getItem`. |
| A draft's stored `publishDate` is shown as the item time | High | Mapper tests: `QUEUED` drafts with a post date and no projection return item `scheduledFor: null`. |
| User-deleted and date-promoted rows both have status `REMOVED` | Med | Readable only when a live root post remains. No live posts → null → 404. |
| Projection order drifts from the calendar | Med | Same order as `getActivePipelinesForCalendar`: `position`, `createdAt`, `id`, then `getUpcomingPipelineSlots`. |

## Open Questions

None.
