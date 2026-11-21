# Tasks: Public pipeline list

Source spec: `spec/SPEC-pipeline-list.md`
Source plan: `tasks/plan.md`

## Task 1: Mapper and unit test ✓

**Description:** Add `toPublicPipelines`, which maps service rows to the public array. Each pipeline keeps `id`, `name`, `timezone`, and `active`. `nextSlot` becomes an ISO-8601 string, or `null` when missing. Channels that fail `isActivePipelineIntegration` are dropped. The rest are sorted by `linkCreatedAt` ascending and reduced to `id`, `name`, and `identifier`.

**Acceptance criteria:**
- [x] A `Date` next slot becomes its `toISOString()` value, and a missing next slot becomes `null`
- [x] Disabled and deleted channels are omitted, and a pipeline with none left has `"channels": []`
- [x] Usable channels come out oldest link first, with exactly `id`, `name`, and `identifier`
- [x] Each pipeline object has exactly `id`, `name`, `timezone`, `active`, `nextSlot`, and `channels`

**Verification:**
- [x] Tests pass: `pnpm exec jest libraries/nestjs-libraries/src/database/prisma/pipelines/public.pipeline.list.spec.ts --coverage=false`
- [ ] Lint passes: `pnpm exec eslint libraries/nestjs-libraries/src/database/prisma/pipelines/public.pipeline.list.ts libraries/nestjs-libraries/src/database/prisma/pipelines/public.pipeline.list.spec.ts`

**Dependencies:** None

**Files likely touched:**
- `libraries/nestjs-libraries/src/database/prisma/pipelines/public.pipeline.list.ts`
- `libraries/nestjs-libraries/src/database/prisma/pipelines/public.pipeline.list.spec.ts`

**Estimated scope:** Small (2 files)

## Task 2: `getPublicPipelines` ✓

**Description:** Add `PipelineService.getPublicPipelines(orgId)`. It loads `PipelineRepository.getPipelines`, computes `nextSlot` with `getNextPipelineSlot` only when the pipeline is active, passes integration `disabled`, `deletedAt`, `name`, `providerIdentifier`, and the link `createdAt`, and returns `toPublicPipelines` of that source. `getPipelines` and `toComposerIntegration` stay as they are.

**Acceptance criteria:**
- [x] An inactive pipeline is passed to the mapper with no `nextSlot`
- [x] An active pipeline is passed the `Date` from `getNextPipelineSlot`
- [x] The dashboard `getPipelines` return shape is unchanged

**Verification:**
- [x] Tests pass: `pnpm exec jest libraries/nestjs-libraries/src/database/prisma/pipelines/public.pipeline.list.spec.ts --coverage=false`
- [ ] Lint passes: `pnpm exec eslint libraries/nestjs-libraries/src/database/prisma/pipelines/pipeline.service.ts libraries/nestjs-libraries/src/database/prisma/pipelines/public.pipeline.list.ts`

**Dependencies:** Task 1

**Files likely touched:**
- `libraries/nestjs-libraries/src/database/prisma/pipelines/pipeline.service.ts`

**Estimated scope:** Small (1 file)

## Task 3: Public route and module registration ✓

**Description:** Add `PublicPipelinesController` with `GET /pipelines` on controller path `/public/v1`. It counts `public_api-request` and returns `getPublicPipelines`. Register it on `authenticatedController` in `PublicApiModule` so the existing public auth middleware and `MCP_ONLY` switch apply.

**Acceptance criteria:**
- [x] `GET /public/v1/pipelines` is handled by the new controller and returns the service array
- [x] The controller is behind `PublicAuthMiddleware`
- [x] `MCP_ONLY` still registers no public controllers

**Verification:**
- [x] Tests pass: `pnpm exec jest libraries/nestjs-libraries/src/database/prisma/pipelines/public.pipeline.list.spec.ts --coverage=false`
- [ ] Lint passes: `pnpm exec eslint apps/backend/src/public-api/routes/v1/public.pipelines.controller.ts apps/backend/src/public-api/public.api.module.ts`

**Dependencies:** Task 2

**Files likely touched:**
- `apps/backend/src/public-api/routes/v1/public.pipelines.controller.ts`
- `apps/backend/src/public-api/public.api.module.ts`

**Estimated scope:** Small (2 files)

## Checkpoint: After Tasks 1-3

- [x] Mapper tests pass (7 tests). The repo `jest.config.ts` does not load: `@nx/jest` is not installed, so the run used a ts-jest config instead of `pnpm exec jest` with no `--config`.
- [ ] ESLint from the repo root crashes on a circular Next.js config (`Converting circular structure to JSON`). The editor reports no diagnostics on the touched files.
- [x] `pnpm run build:backend` succeeds
- [ ] Review with human before starting the next module
