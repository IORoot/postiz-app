# Tasks: Idempotent pipeline enqueue

Source spec: `spec/SPEC-pipeline-enqueue.md`
Source plan: `tasks/plan.md`

## Task 1: Key normalizer and unit test ✓

**Description:** Add `normalizeIdempotencyKey`. `undefined`, `null`, and `''` return no key. A 64-character hex digest returns `{ key }` in lowercase. Anything else, including surrounding whitespace, returns `{ error: 'idempotencyKey must be a SHA-256 hex digest' }`.

**Acceptance criteria:**
- [x] A missing or empty value returns `{}`
- [x] Mixed-case 64-hex returns the lowercase digest
- [x] A non-hex string, a wrong length, a number, and a digest with surrounding spaces return the error

**Verification:**
- [x] Tests pass: `pnpm exec jest libraries/nestjs-libraries/src/database/prisma/pipelines/public.pipeline.enqueue.spec.ts --coverage=false --config /tmp/postiz-pipeline-list.jest.config.js`

**Dependencies:** None

**Files likely touched:**
- `libraries/nestjs-libraries/src/database/prisma/pipelines/public.pipeline.enqueue.ts`
- `libraries/nestjs-libraries/src/database/prisma/pipelines/public.pipeline.enqueue.spec.ts`

**Estimated scope:** Small (2 files)

## Task 2: Per-pipeline unique index in the schema ✓

**Description:** In `PipelineQueueItem`, remove the field-level `@unique` on `idempotencyKey` and add `@@unique([pipelineId, idempotencyKey])`. Do not run `prisma db push`.

**Acceptance criteria:**
- [x] `idempotencyKey` is still optional
- [x] The only unique that includes it is `(pipelineId, idempotencyKey)`
- [x] No schema command is executed

**Verification:**
- [x] `schema.prisma` contains `@@unique([pipelineId, idempotencyKey])` and the field line has no `@unique`

**Dependencies:** Task 1

**Files likely touched:**
- `libraries/nestjs-libraries/src/database/prisma/schema.prisma`

**Estimated scope:** Small (1 file)

## Task 3: Public enqueue route ✓

**Description:** Add `POST /pipelines/enqueue` on `PublicPipelinesController`. Count `public_api-request`. Normalize `idempotencyKey`. On `{ error }`, throw `HttpException({ msg }, 400)`. Otherwise call `PipelineService.enqueue` with `'API'` and the key, passing the body without `idempotencyKey`. Do not edit `PipelinesController` or `getQueueItemByIdempotencyKey`.

**Acceptance criteria:**
- [x] The route is `POST /public/v1/pipelines/enqueue` behind `PublicAuthMiddleware`
- [x] A bad key returns 400 `{ "msg": "idempotencyKey must be a SHA-256 hex digest" }`
- [x] A valid or omitted key is passed as the existing `enqueue` idempotency argument
- [x] `apps/backend/src/api/routes/pipelines.controller.ts` is unchanged

**Verification:**
- [x] Tests pass: `pnpm exec jest libraries/nestjs-libraries/src/database/prisma/pipelines/public.pipeline.enqueue.spec.ts --coverage=false --config /tmp/postiz-pipeline-list.jest.config.js`
- [x] `pnpm run build:backend` succeeds

**Dependencies:** Task 1

**Files likely touched:**
- `apps/backend/src/public-api/routes/v1/public.pipelines.controller.ts`

**Estimated scope:** Small (1 file)

## Checkpoint: After Tasks 1-3

- [x] Focused Jest test passes (3 tests)
- [x] `pnpm run build:backend` succeeds
- [x] Schema unique is `(pipelineId, idempotencyKey)` and `prisma db push` was not run
- [x] Review with human before starting the next module
