# Spec: Public pipeline list — V1

Module id: `pipeline-list`

## Objective

The video editor needs the signed-in organization's pipelines so it can choose one and know which channels an enqueue must include. Today that list exists only on the dashboard route `GET /pipelines`, whose body includes composer fields, schedule revision, queue counts, and channel settings.

`GET /public/v1/pipelines` returns a narrow list for the organization on the API key: identity, timezone, whether it is active, the next slot, and the channels enqueue will accept. The dashboard route stays as it is. The settings form stays on the existing `GET /public/v1/integration-settings/{id}`.

Success for this module is that an API client can render a pipeline picker and build a later enqueue body from this response alone, without reading dashboard fields.

## Tech Stack

- NestJS 11 public API on `apps/backend`, authenticated with the existing `PublicAuthMiddleware`
- Pipeline data from `PipelineService.getPipelines` in `libraries/nestjs-libraries`
- PostgreSQL via Prisma. This module does not change the schema
- pnpm 10.6.1, Node `>=22.12.0 <23.0.0`
- Jest 29, colocated `*.spec.ts`

## Commands

```
Test this module: pnpm exec jest libraries/nestjs-libraries/src/database/prisma/pipelines/public.pipeline.list.spec.ts --coverage=false
Test the repo: pnpm test
Lint touched files, from the repo root: pnpm exec eslint libraries/nestjs-libraries/src/database/prisma/pipelines/public.pipeline.list.ts libraries/nestjs-libraries/src/database/prisma/pipelines/public.pipeline.list.spec.ts apps/backend/src/public-api/routes/v1/public.pipelines.controller.ts apps/backend/src/public-api/public.api.module.ts
Dev backend: pnpm run dev:backend
```

## Project Structure

```
spec/capability-map.md                         → approved module index
spec/SPEC-pipeline-list.md                     → this spec
libraries/nestjs-libraries/src/database/prisma/pipelines/public.pipeline.list.ts
                                               → pure mapper from service rows to the public body
libraries/nestjs-libraries/src/database/prisma/pipelines/public.pipeline.list.spec.ts
                                               → mapper tests
libraries/nestjs-libraries/src/database/prisma/pipelines/pipeline.service.ts
                                               → getPublicPipelines(orgId) assembles rows and calls the mapper
apps/backend/src/public-api/routes/v1/public.pipelines.controller.ts
                                               → GET /public/v1/pipelines
apps/backend/src/public-api/public.api.module.ts
                                               → register the controller with PublicAuthMiddleware
```

The controller stays thin: count the `public_api-request` metric, call `getPublicPipelines`, return the array. It joins the same `authenticatedController` list as `PublicIntegrationsController`, so `MCP_ONLY` and public-API auth apply to it too.

## Code Style

Match `webhook.payload.ts`: a pure function, an explicit result type, and no I/O. Channel membership uses the existing `isActivePipelineIntegration` helper, the same rule enqueue uses.

```typescript
export function toPublicPipelines(
  pipelines: PublicPipelineSource[]
): PublicPipeline[] {
  return pipelines.map((pipeline) => ({
    id: pipeline.id,
    name: pipeline.name,
    timezone: pipeline.timezone,
    active: pipeline.active,
    nextSlot: pipeline.nextSlot ? pipeline.nextSlot.toISOString() : null,
    channels: pipeline.channels
      .filter((channel) => isActivePipelineIntegration(channel))
      .map((channel) => ({
        id: channel.id,
        name: channel.name,
        identifier: channel.identifier,
      })),
  }));
}
```

`getPublicPipelines` computes `nextSlot` with the same `getNextPipelineSlot` call the dashboard list uses. It passes `disabled` and `deletedAt` through to the mapper. It does not call `toComposerIntegration`, so the public body never gains composer fields.

## Testing Strategy

Unit tests on `toPublicPipelines`. No database and no Nest app. The controller is a pass-through and is not given its own test.

Cover the mapper with fixtures for:

- an active pipeline whose `nextSlot` is a `Date`
- an active pipeline with no `nextSlot`
- an inactive pipeline that still has a `Date` on the source (the service must pass `undefined` when inactive; the mapper still turns a missing slot into `null`)
- a channel that is disabled, a channel with `deletedAt` set, and a channel that is usable
- a pipeline whose channels are all excluded
- key order and the absence of extra keys

`pnpm exec jest libraries/nestjs-libraries/src/database/prisma/pipelines/public.pipeline.list.spec.ts --coverage=false` must pass before this module is done.

## Boundaries

- Always: authenticate with the existing public-API middleware; scope the query to that organization and `deletedAt: null`; return a JSON array; use `isActivePipelineIntegration` for channels; return `nextSlot` as an ISO-8601 string or `null`; keep the dashboard `GET /pipelines` response unchanged.
- Ask first: adding a field to this response, changing `getPipelines` or `toComposerIntegration`, or exposing `additionalSettings`, `profile`, or any credential column.
- Never: return the raw Prisma pipeline or the dashboard composer object; change the Prisma schema in this module; add enqueue, queue read, promote, delete, or media behavior here; put provider-specific branches in the mapper.

## Success Criteria

1. `GET /public/v1/pipelines` with a valid organization API key returns 200 and a JSON array. An organization with no pipelines gets `[]`.
2. Each element has exactly these keys: `id`, `name`, `timezone`, `active`, `nextSlot`, `channels`.
3. `id`, `name`, and `timezone` are the pipeline's own values. `active` is the pipeline's boolean.
4. `nextSlot` is the ISO-8601 UTC string of the same instant `getNextPipelineSlot` returns for an active pipeline. It is `null` when the pipeline is inactive, and `null` when an active pipeline has no upcoming slot.
5. `channels` is the pipeline's integrations that pass `isActivePipelineIntegration`, in link `createdAt` ascending order. Each channel has exactly `id` (the integration id), `name` (the integration's `name`), and `identifier` (the provider identifier, such as `youtube`).
6. A disabled or deleted integration is omitted. A pipeline whose remaining channels are empty returns `"channels": []`.
7. A soft-deleted pipeline is absent. A pipeline belonging to another organization is absent.
8. The JSON from dashboard `GET /pipelines` is unchanged.
9. A request without a valid public-API credential is rejected by `PublicAuthMiddleware`, the same as `GET /public/v1/integrations`.
10. `pnpm exec jest libraries/nestjs-libraries/src/database/prisma/pipelines/public.pipeline.list.spec.ts --coverage=false` passes.

Example body:

```json
[
  {
    "id": "0f3c1c2e-7b1a-4e6d-9c2a-1a2b3c4d5e6f",
    "name": "Weekly",
    "timezone": "Europe/London",
    "active": true,
    "nextSlot": "2026-11-23T18:00:00.000Z",
    "channels": [
      {
        "id": "b7e1a0c4-1d2e-4f5a-8b6c-9d0e1f2a3b4c",
        "name": "London Parkour",
        "identifier": "youtube"
      }
    ]
  }
]
```

## Out of Scope (Deferred)

- Idempotent enqueue, queue read, promote, and delete — their own modules on the capability map.
- Media lookup by name or hash, and folder create — `media-lookup`.
- Embedding the settings schema or channel default settings — the editor keeps using `GET /public/v1/integration-settings/{id}`.
- Publish or failure webhooks — the Output tab polls `queue-read`.
- Allow-listing the `ldnpk-video-editor/1.0` User-Agent — Cloudflare, outside this repo.

## Open Questions

None. Approval of this spec accepts the channel rule in success criterion 5: the list contains the integrations enqueue will accept, and the channel name is `Integration.name`.
