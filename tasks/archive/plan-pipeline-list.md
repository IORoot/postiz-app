# Implementation Plan: Public pipeline list

Source spec: `spec/SPEC-pipeline-list.md`

## Overview

Add `GET /public/v1/pipelines` for the video editor. A pure mapper turns pipeline rows into the narrow public body. `PipelineService.getPublicPipelines` loads the same rows as the dashboard list, computes the next slot the same way, and calls the mapper. A thin public controller returns that array. The dashboard `GET /pipelines` method stays untouched.

## Architecture Decisions

- The mapper lives in `public.pipeline.list.ts`, same pattern as `webhook.payload.ts`: pure function, explicit types, no I/O. The unit test covers it without Nest or a database.
- `getPublicPipelines` calls `PipelineRepository.getPipelines` directly. It does not call `PipelineService.getPipelines` or `toComposerIntegration`. Those drop `deletedAt` and add composer fields, and changing them would change the dashboard JSON.
- `nextSlot` uses the existing `getNextPipelineSlot`. The service passes that `Date` only when the pipeline is active. The mapper turns a `Date` into `toISOString()` and a missing value into `null`.
- Channel order is not set on the shared repository query. Adding `orderBy` there would change dashboard channel order. The mapper sorts by the pipeline-link `createdAt` ascending, so success criterion 5 is covered by the unit test. The service passes that timestamp as `linkCreatedAt`.
- The controller is registered on the existing `authenticatedController` list in `PublicApiModule`, so `PublicAuthMiddleware` and `MCP_ONLY` apply with no new auth code.
- No Prisma migration.

## Dependency Graph

```
toPublicPipelines + unit test
        │
        ▼
PipelineService.getPublicPipelines
        │
        ▼
PublicPipelinesController GET /public/v1/pipelines
        │
        ▼
PublicApiModule registration
```

Nothing in this module can be built in parallel. There is no schema step.

## Task List

### Phase 1: Public list

- [x] Task 1: Mapper and unit test
- [x] Task 2: `getPublicPipelines`
- [x] Task 3: Public route and module registration

### Checkpoint: Public list

- [x] Focused Jest test passes
- [ ] ESLint passes on the touched files (root ESLint crashes on the existing Next config; editor diagnostics are clean)
- [x] `pnpm run build:backend` succeeds
- [ ] Human review before the next module

## Risks and Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| Editing `getPipelines` or `toComposerIntegration` changes the dashboard JSON | High | New method and new mapper. Do not change the existing method bodies. |
| Shared `orderBy` on pipeline integrations changes dashboard channel order | Med | Sort only inside the public mapper, using the link `createdAt`. |
| `isActivePipelineIntegration` treats a missing object as active | Low | Pass the integration fields (`disabled`, `deletedAt`). The repository include always has the integration row. |
| Next-slot math drifts from the dashboard | Med | Call `getNextPipelineSlot`. Do not reimplement slot calculation. |

## Open Questions

None.
