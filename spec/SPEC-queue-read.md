# Spec: Public queue item read — V1

Module id: `queue-read`

## Objective

The video editor's Output tab can poll one queue item and show whether it is still a draft, in flight, published, or failed. Today the editor only knows that an enqueue returned an id. The dashboard queue is session-authenticated and its body is the composer shape.

`GET /public/v1/pipelines/queue/{id}` returns one item for the organization on the API key: a status in the editor's four words, the time it will or did publish, the queue error text, the post group, and one entry per channel. A row that a date-promote took off the queue stays readable, because its posts are still live. A row whose posts were deleted is not.

Success for this module is that a client can poll this route and render the outcome without reading dashboard fields or post rows directly.

## Tech Stack

- NestJS 11 public API on `apps/backend`, authenticated with the existing `PublicAuthMiddleware`
- Queue rows from `PipelineRepository` and slot projection from `getUpcomingPipelineSlots` in `libraries/nestjs-libraries`
- PostgreSQL via Prisma. This module does not change the schema
- pnpm 10.6.1, Node `>=22.12.0 <23.0.0`
- Jest 29, colocated `*.spec.ts`

## Commands

```
Test this module: pnpm exec jest libraries/nestjs-libraries/src/database/prisma/pipelines/public.queue.read.spec.ts --coverage=false --config /tmp/postiz-pipeline-list.jest.config.js
Test the repo: pnpm test
Dev backend: pnpm run dev:backend
Build backend: pnpm run build:backend
```

`pnpm test` and `pnpm exec jest` with no `--config` do not collect tests: `jest.config.ts` imports `@nx/jest`, which is not installed. The focused command above is the one that runs this module. Root `pnpm exec eslint` currently crashes on a circular Next.js config, so lint for this module is the editor diagnostics on the touched files plus `pnpm run build:backend`.

## Project Structure

```
spec/SPEC-queue-read.md                        → this spec
libraries/nestjs-libraries/src/database/prisma/pipelines/public.queue.read.ts
                                               → pure status mapper
libraries/nestjs-libraries/src/database/prisma/pipelines/public.queue.read.spec.ts
                                               → mapper tests
libraries/nestjs-libraries/src/database/prisma/pipelines/pipeline.service.ts
                                               → getPublicQueueItem(orgId, id) loads the row, projects a slot when the item is queued, and calls the mapper
apps/backend/src/public-api/routes/v1/public.pipelines.controller.ts
                                               → GET /public/v1/pipelines/queue/:id on the controller from pipeline-list
```

The controller stays thin: count `public_api-request`, call `getPublicQueueItem`, and translate a missing item into the same 404 shape the public API already uses (`HttpException` with `{ msg: 'Queue item not found' }`, status 404).

## Code Style

Match `public.pipeline.list.ts`: a pure function, an explicit result type, and no I/O. The service decides the projected slot. The mapper never reads a draft post's stored `publishDate`.

```typescript
export function toPublicQueueItem(
  source: PublicQueueItemSource
): PublicQueueItem {
  const channels = source.posts.map((post) => ({
    postId: post.id,
    integrationId: post.integrationId,
    name: post.integrationName,
    identifier: post.identifier,
    state: toChannelState(post.state),
    scheduledFor: post.publishDate ? post.publishDate.toISOString() : null,
    error: post.error ?? null,
  }));

  return {
    id: source.id,
    group: source.group,
    status: toItemStatus(source, channels),
    scheduledFor: toScheduledFor(source),
    error: source.error ?? null,
    channels,
  };
}
```

`toChannelState` maps the stored post state: `DRAFT` to `draft`, `QUEUE` to `scheduled`, `PUBLISHED` to `published`, `ERROR` to `error`.

`toItemStatus` uses this order:

1. Queue status `FAILED`, or any channel `error` → `error`.
2. Queue status `PUBLISHED`, or every channel `published` → `published`.
3. Queue status `PUBLISHING`, or any channel `scheduled` → `scheduled`.
4. Otherwise → `draft`. That covers `QUEUED` and `CREATING` while the posts are still drafts, and a removed row whose posts are still drafts.

`toScheduledFor` returns the projected slot's ISO string when the status is `draft`. It returns `null` when that projection is missing. For every other status it returns the earliest channel `scheduledFor`, or `null` when no channel has one. A draft post is created with `publishDate` set to the enqueue time. That value is not the pipeline slot, and this function does not use it while the status is `draft`.

## Testing Strategy

Unit tests on `toPublicQueueItem`. No database and no Nest app. The controller is a pass-through and is not given its own test.

Cover the mapper with fixtures for:

- `QUEUED` with draft posts and a projected `Date` → `draft` and that ISO time
- `QUEUED` with draft posts, no projection, and a post `publishDate` of "now" → `draft` and `scheduledFor: null`
- `PUBLISHING` with `QUEUE` posts → `scheduled` and the post publish time
- `PUBLISHED` → `published`
- `FAILED`, and a mixed case where one post is `PUBLISHED` and another is `ERROR` → `error`, with the queue error text and both channel states
- `REMOVED` with live `QUEUE` posts → `scheduled` (the date-promote case)
- `REMOVED` with live `PUBLISHED` posts → `published`
- channel order follows the input order
- the item has exactly `id`, `group`, `status`, `scheduledFor`, `error`, `channels`
- each channel has exactly `postId`, `integrationId`, `name`, `identifier`, `state`, `scheduledFor`, `error`

The service, not the mapper, chooses the projection: among that pipeline's `QUEUED` items with `deletedAt: null`, ordered by `position`, then `createdAt`, then `id`, this item's index selects `getUpcomingPipelineSlots(slots, timezone, now, queuedCount)[index]`. An inactive pipeline or a pipeline with no slots passes no projection. That assembly is not unit-tested; the mapper tests lock the result once a projection is or is not supplied.

`pnpm exec jest libraries/nestjs-libraries/src/database/prisma/pipelines/public.queue.read.spec.ts --coverage=false --config /tmp/postiz-pipeline-list.jest.config.js` must pass before this module is done. `pnpm run build:backend` must succeed.

## Boundaries

- Always: authenticate with the existing public-API middleware; scope the lookup to that organization; return one JSON object; use root posts only (`parentPostId` null, `deletedAt` null); keep `GET /pipelines` and `GET /public/v1/pipelines` unchanged.
- Ask first: adding a field, returning post content or media, or exposing integration tokens, `profile`, or `additionalSettings`.
- Never: change the Prisma schema; enqueue, promote, delete, or send a webhook from this route; treat a missing item and another organization's item differently; use a draft post's stored `publishDate` as `scheduledFor`.

## Success Criteria

1. `GET /public/v1/pipelines/queue/{id}` with a valid organization API key returns 200 and one JSON object when the item belongs to that organization and has at least one live root post.
2. The object has exactly these keys: `id`, `group`, `status`, `scheduledFor`, `error`, `channels`.
3. `status` is `draft` while the queue item is `QUEUED` or `CREATING` and the live root posts are drafts. `scheduledFor` is the projected slot as an ISO-8601 UTC string, or `null` when the pipeline is inactive or has no upcoming slot. The draft posts' stored `publishDate` is not that value.
4. `status` is `scheduled` while the queue item is `PUBLISHING`, and while a `REMOVED` item still has live root posts in `QUEUE`. `scheduledFor` is the earliest of those posts' `publishDate` values, or `null`.
5. `status` is `published` when the queue item is `PUBLISHED`, and when every live root post is `PUBLISHED`. `scheduledFor` is the earliest post `publishDate`, or `null`.
6. `status` is `error` when the queue item is `FAILED`, and when any live root post is `ERROR`, including when another channel is `PUBLISHED`. `error` is the queue item's error string, or `null` when it has none. Each channel still reports its own state and error.
7. `channels` lists live root posts in `createdAt` then `id` order. Each channel has exactly `postId`, `integrationId`, `name` (`Integration.name`), `identifier` (provider identifier), `state` (`draft`, `scheduled`, `published`, or `error`), `scheduledFor`, and `error`.
8. An unknown id, an item in another organization, and an item whose root posts are all soft-deleted return 404 `{ "msg": "Queue item not found" }`.
9. `GET /public/v1/pipelines` and dashboard `GET /pipelines` stay as they are.
10. The focused Jest command passes and `pnpm run build:backend` succeeds.

Example body for a waiting item:

```json
{
  "id": "6d0e1c2a-3b4f-4a5e-8c7d-9e0f1a2b3c4d",
  "group": "a1b2c3d4e5",
  "status": "draft",
  "scheduledFor": "2026-11-23T18:00:00.000Z",
  "error": null,
  "channels": [
    {
      "postId": "cmv3hqb2g0003o97o6myva21v",
      "integrationId": "b7e1a0c4-1d2e-4f5a-8b6c-9d0e1f2a3b4c",
      "name": "London Parkour",
      "identifier": "youtube",
      "state": "draft",
      "scheduledFor": "2026-11-21T15:04:00.000Z",
      "error": null
    }
  ]
}
```

In that example the channel `scheduledFor` is the draft's stored enqueue time. The item `scheduledFor` is the projected slot. They are allowed to differ.

## Out of Scope (Deferred)

- Idempotent enqueue, promote, and delete — their own modules. This route only reads.
- Listing every queue item, and filtering `GET /public/v1/posts` by group. The editor polls by queue id. `group` is on the body so it can correlate.
- Media lookup — `media-lookup`.
- Publish or failure webhooks. The Output tab polls this route.
- The `ldnpk-video-editor/1.0` User-Agent — Cloudflare, outside this repo.

## Open Questions

None. Approval accepts the channel vocabulary, the draft-versus-stored-`publishDate` rule, and 404 for an item with no live root posts.
