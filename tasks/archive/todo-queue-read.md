# Tasks: Public queue item read

Source spec: `spec/SPEC-queue-read.md`
Source plan: `tasks/plan.md`

## Task 1: Status mapper and unit test ✓

**Description:** Add `toPublicQueueItem`. It maps live root posts to channels (`postId`, `integrationId`, `name`, `identifier`, `state`, `scheduledFor`, `error`) in input order. Item `status` is `error` if the queue item is `FAILED` or any channel is `error`; otherwise `published` if the item is `PUBLISHED` or every channel is `published`; otherwise `scheduled` if the item is `PUBLISHING` or any channel is `scheduled`; otherwise `draft`. Item `scheduledFor` is the projected slot for `draft`, and the earliest channel time otherwise. A missing projection or a missing post time becomes `null`.

**Acceptance criteria:**
- [x] A `QUEUED` item with a projected `Date` is `draft` with that ISO time, even when a post has its own `publishDate`
- [x] A `QUEUED` item with no projection is `draft` with `scheduledFor: null`
- [x] `PUBLISHING` is `scheduled` at the post time, `PUBLISHED` is `published`, and `FAILED` or a mixed published/error pair is `error`
- [x] A `REMOVED` item with `QUEUE` posts is `scheduled`, and one with all `PUBLISHED` posts is `published`
- [x] The item and each channel have only the keys in the spec

**Verification:**
- [x] Tests pass: `pnpm exec jest libraries/nestjs-libraries/src/database/prisma/pipelines/public.queue.read.spec.ts --coverage=false --config /tmp/postiz-pipeline-list.jest.config.js`

**Dependencies:** None

**Files likely touched:**
- `libraries/nestjs-libraries/src/database/prisma/pipelines/public.queue.read.ts`
- `libraries/nestjs-libraries/src/database/prisma/pipelines/public.queue.read.spec.ts`

**Estimated scope:** Small (2 files)

## Task 2: Load the row and project a slot ✓

**Description:** Add a repository read that finds the queue item by id inside the organization, including `REMOVED` rows, with live root posts and the pipeline's `active`, `timezone`, and schedule slots. Add `getPublicQueueItem`. For `QUEUED` and `CREATING` only, it takes this item's index in the pipeline's queued ids and passes `getUpcomingPipelineSlots(...)[index]` when the pipeline is active. No live root posts, or no such item, returns null. `getItem` and `getPipelines` stay as they are.

**Acceptance criteria:**
- [x] The new read includes a soft-deleted queue row when its posts are still live
- [x] `getPublicQueueItem` passes a projection only for `QUEUED` and `CREATING` on an active pipeline
- [x] `getItem` still requires status `QUEUED` and `deletedAt: null`

**Verification:**
- [x] Tests pass: `pnpm exec jest libraries/nestjs-libraries/src/database/prisma/pipelines/public.queue.read.spec.ts --coverage=false --config /tmp/postiz-pipeline-list.jest.config.js`
- [x] `pnpm run build:backend` succeeds

**Dependencies:** Task 1

**Files likely touched:**
- `libraries/nestjs-libraries/src/database/prisma/pipelines/pipeline.repository.ts`
- `libraries/nestjs-libraries/src/database/prisma/pipelines/pipeline.service.ts`

**Estimated scope:** Small (2 files)

## Task 3: Public route ✓

**Description:** Add `GET /pipelines/queue/:id` on `PublicPipelinesController`. It counts `public_api-request` and returns `getPublicQueueItem`. A null result throws `HttpException({ msg: 'Queue item not found' }, 404)`.

**Acceptance criteria:**
- [x] The route is `GET /public/v1/pipelines/queue/:id` on the existing public pipelines controller
- [x] A missing item returns 404 `{ "msg": "Queue item not found" }`
- [x] The controller stays behind `PublicAuthMiddleware`

**Verification:**
- [x] Tests pass: `pnpm exec jest libraries/nestjs-libraries/src/database/prisma/pipelines/public.queue.read.spec.ts --coverage=false --config /tmp/postiz-pipeline-list.jest.config.js`
- [x] `pnpm run build:backend` succeeds

**Dependencies:** Task 2

**Files likely touched:**
- `apps/backend/src/public-api/routes/v1/public.pipelines.controller.ts`

**Estimated scope:** Small (1 file)

## Checkpoint: After Tasks 1-3

- [x] Focused Jest test passes (9 tests), and the pipeline-list tests still pass
- [x] `pnpm run build:backend` succeeds
- [ ] Review with human before starting the next module
