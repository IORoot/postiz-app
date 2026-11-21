# Spec: Idempotent pipeline enqueue — V1

Module id: `pipeline-enqueue`

## Objective

A timeout or a 5xx after enqueue leaves the video editor unsure whether Postiz saved the draft. The editor already has the video's SHA-256. Sending that key again, to the same pipeline, must return the original queue id and must not create a second draft.

`POST /public/v1/pipelines/enqueue` always appends a draft and a `QUEUED` item when the key is new, and returns `{ id, group }`. The same key on that pipeline returns the existing id, including after the item is published, failed, or taken off the queue by a date-promote, for as long as the row still holds the key. The first body wins. The same file may be enqueued to a different pipeline. Dashboard `POST /pipelines/enqueue` does not read a key and stays as it is.

Success for this module is that a repeated call with the same key and pipeline is safe, and two pipelines can each hold one item for that file.

## Tech Stack

- NestJS 11 public API on `apps/backend`, authenticated with the existing `PublicAuthMiddleware`
- `PipelineManager.enqueue`, which already accepts an idempotency key and returns the existing row on a unique conflict
- PostgreSQL via Prisma. This module changes the unique index on `PipelineQueueItem.idempotencyKey`
- pnpm 10.6.1, Node `>=22.12.0 <23.0.0`
- Jest 29, colocated `*.spec.ts`
- Schema apply, only when asked: `pnpm run prisma-db-push`

There is no `migrations/` directory. This repo applies schema with `prisma db push`. This module edits `schema.prisma`. It does not run `prisma-db-push` against a shared database.

## Commands

```
Test this module: pnpm exec jest libraries/nestjs-libraries/src/database/prisma/pipelines/public.pipeline.enqueue.spec.ts --coverage=false --config /tmp/postiz-pipeline-list.jest.config.js
Test the repo: pnpm test
Build backend: pnpm run build:backend
Apply schema locally, only when asked: pnpm run prisma-db-push
```

`pnpm test` does not collect tests: `jest.config.ts` imports `@nx/jest`, which is not installed. The focused command above is the one that runs this module.

## Project Structure

```
spec/SPEC-pipeline-enqueue.md                  → this spec
libraries/nestjs-libraries/src/database/prisma/schema.prisma
                                               → unique (pipelineId, idempotencyKey)
libraries/nestjs-libraries/src/database/prisma/pipelines/public.pipeline.enqueue.ts
                                               → pure key normalizer
libraries/nestjs-libraries/src/database/prisma/pipelines/public.pipeline.enqueue.spec.ts
                                               → normalizer tests
libraries/nestjs-libraries/src/database/prisma/pipelines/pipeline.service.ts
                                               → public enqueue passes the normalized key through
apps/backend/src/public-api/routes/v1/public.pipelines.controller.ts
                                               → POST /public/v1/pipelines/enqueue
```

The controller counts `public_api-request`, normalizes `idempotencyKey`, and calls the service with the rest of the body. A key that is present and not 64 hex characters is `400 { msg: 'idempotencyKey must be a SHA-256 hex digest' }`. A missing key is a normal create.

## Code Style

Match `public.pipeline.list.ts`: a pure function, no I/O. The manager already owns the create-or-return branch. This function only decides what string, if any, is that key.

```typescript
const sha256Hex = /^[a-f0-9]{64}$/i;

export function normalizeIdempotencyKey(
  value: unknown
): { key?: string } | { error: string } {
  if (value === undefined || value === null || value === '') {
    return {};
  }
  if (typeof value !== 'string' || !sha256Hex.test(value)) {
    return { error: 'idempotencyKey must be a SHA-256 hex digest' };
  }
  return { key: value.toLowerCase() };
}
```

`getQueueItemByIdempotencyKey` stays a lookup by pipeline id, organization, and key, with no `deletedAt` filter. A date-promote soft-deletes the queue row and leaves the key in place. That row is still the replay. Clearing the key belongs to `queue-delete`.

## Testing Strategy

Unit tests on `normalizeIdempotencyKey`. No database and no Nest app.

Cover:

- `undefined`, `null`, and `''` return no key
- a 64-character hex string returns that key in lowercase
- mixed-case hex returns the lowercase form
- a short string, a non-hex string, a number, and a 64-character string with a non-hex character return the error
- whitespace around an otherwise valid digest returns the error (no trim)

The manager's replay branch and the unique index are not given a database test. `pnpm run build:backend` must still succeed, and the schema must show `@@unique([pipelineId, idempotencyKey])` with the field-level `@unique` removed.

The focused Jest command must pass before this module is done.

## Boundaries

- Always: authenticate with the existing public-API middleware; store the key lowercase; return `{ id, group }` for both a create and a replay; leave the first saved draft unchanged on replay; scope the lookup to the pipeline's organization.
- Ask first: running `prisma-db-push` or any other schema apply against a shared or production database; changing what `POST /pipelines/enqueue` accepts.
- Never: update the saved posts when the key matches; filter the lookup with `deletedAt: null`; make the key unique across all pipelines again; delete a row or clear a key in this module; require the key on the dashboard route.

## Success Criteria

1. `POST /public/v1/pipelines/enqueue` with a valid organization API key, a `pipelineId`, a `post`, and no `idempotencyKey` creates a draft and a `QUEUED` item and returns `{ id, group }`.
2. The same request with `idempotencyKey` set to 64 hex characters creates the item, stores the key lowercase, and returns `{ id, group }`.
3. A second call to the same pipeline with the same key, in any letter case, returns the original `{ id, group }` and does not create a post or a queue row. This holds when the existing row is `QUEUED`, `PUBLISHING`, `PUBLISHED`, `FAILED`, or `REMOVED`, as long as `idempotencyKey` is still that digest.
4. A different body on the replay does not change the saved draft.
5. The same key sent to a different pipeline in the same organization creates a separate item. The schema unique is `(pipelineId, idempotencyKey)`, not the key alone.
6. A present `idempotencyKey` that is not 64 hex characters returns `400 { "msg": "idempotencyKey must be a SHA-256 hex digest" }` and creates nothing. `null` and `''` are treated as omitted.
7. Several rows with a null key remain allowed.
8. Dashboard `POST /pipelines/enqueue` still ignores `idempotencyKey` and still creates a new item on every call.
9. The focused Jest command passes and `pnpm run build:backend` succeeds.

Example replay response:

```json
{ "id": "6d0e1c2a-3b4f-4a5e-8c7d-9e0f1a2b3c4d", "group": "a1b2c3d4e5" }
```

## Out of Scope (Deferred)

- `queue-delete` clearing the key. Until that module ships, a soft-deleted row that still has the key replays to the original id.
- `queue-promote`. Date-promote already keeps the key; this module only promises the lookup still finds that row.
- `queue-read` changes. The returned id is the one that route already reads.
- Media lookup by name or hash.
- Removing the API-key allowlist on the dashboard enqueue route. Existing callers can keep using it.
- Webhooks and the User-Agent allowlist.

## Open Questions

None. Approval accepts an optional key, 64 hex characters stored lowercase, and replay of any row on that pipeline that still holds the key.
