# Plan: Pipeline scheduler starts reliably on boot

Source spec: `docs/superpowers/specs/2026-11-23-pipeline-scheduler-boot-start-design.md` (approved 2026-11-23)

## Overview

Split the two boot-time Temporal starts in `libraries/nestjs-libraries/src/temporal/infinite.workflow.register.ts` into independent attempts, treat "already started" as info, log other errors, and never throw from `onModuleInit`. Cover it with a unit spec. Ship through a PR; the human builds and deploys from GitHub.

## Architecture Decisions

- Keep the change inside one provider file plus its spec. No new module, no service, no DB or API change.
- A small private helper inside the same class starts one workflow and handles its own errors. Both `onModuleInit` starts call it in sequence.
- "Already started" detection follows the existing `isAlreadyStarted` helper in `apps/orchestrator/src/workflows/pipeline-workflows/pipeline.scheduler.workflow.v1.ts` (error name `WorkflowExecutionAlreadyStartedError`, or message containing "already started"). Keep the same shape so the two files read alike.
- Logging uses `console.info` for "already started" and `console.error` otherwise, matching the surrounding backend code (for example `media.service.ts` logs with `console.error`).
- Do not touch any workflow file. This file lives in `libraries/`, so changing it does not violate the workflow-immutability rule.

## Dependency Graph

```
T1 helper + onModuleInit change
   │
   ├── T2 unit spec (depends on T1 API shape)
   │      │
   │      └── T3 lint + test from root
   │             │
   │             └── T4 branch, commit, PR (QA section)
   │                    │
   │                    └── T5 human: GitHub build, deploy, hermes verification
```

## Task List

### Phase A: Code

- [ ] **T1: Independent boot starts**
  - Acceptance: `onModuleInit` still returns early when `RUN_CRON` is unset. With it set, `missingPostWorkflow` and `pipelineSchedulerWorkflowV1` are each attempted, with the same workflow IDs and task queue `main` as now. Neither throws out of `onModuleInit`.
  - Verify: code review against spec success criteria 1–5; T2 tests.
  - Files: `libraries/nestjs-libraries/src/temporal/infinite.workflow.register.ts`

- [ ] **T2: Unit spec for boot starts**
  - Acceptance: spec covers:
    1. Already-started on the first start still starts the scheduler, logs info, no error log.
    2. A non-already-started error on the first start is logged as error, and the scheduler is still started.
    3. Both starts succeed.
    4. `RUN_CRON` unset: no starts called.
    5. `onModuleInit` resolves (does not reject) in each case.
  - Verify: `pnpm test -- libraries/nestjs-libraries/src/temporal` (or `pnpm exec jest libraries/nestjs-libraries/src/temporal`) passes.
  - Files: `libraries/nestjs-libraries/src/temporal/infinite.workflow.register.spec.ts` (new; mirrors existing `*.spec.ts` files in `libraries/nestjs-libraries/src`)

- [ ] **T3: Lint and full test run from root**
  - Acceptance: root lint passes for the two touched files; root test run has no new failures.
  - Verify: run lint from the repo root (CLAUDE.md: linting runs from root only; confirm the lint script name in root `package.json` first). Run the root test script.
  - Files: none changed.

### Phase B: Delivery

- [ ] **T4: Branch, commit, PR**
  - Acceptance: branch off `main`, one commit, PR opened against `main`. PR description has "What kind of change" detail (area, function, what stayed the same) and a `# QA` section with numbered checkbox steps (setup, action, expected result). Steps include the hermes check from spec success criteria 1 and 6.
  - Verify: PR CI green (or failures explained). Human reviews.
  - Files: none changed.
  - Blocker: `.github/PULL_REQUEST_TEMPLATE.md` referenced by CLAUDE.md does not exist in this repo (checked 2026-11-23). See Open Questions.

- [ ] **T5: Human build, deploy, verify on hermes** (not done by the agent)
  - Acceptance: spec success criteria 1 and 6 pass on hermes after deploy:
    - `temporal workflow describe -w pipeline-scheduler-workflow-v1` returns Running.
    - A queued item in a due slot becomes `QUEUE` with `publishDate` = slot time, and a `PipelineSlotExecution` row with `CLAIMED` exists.
  - Verify: as above, plus the orchestrator logs for the boot start.

## Checkpoints

- After T2: spec file passes locally; the "already started" and "other error" cases are both covered.
- After T3: root lint and tests are clean for touched files.
- Before T5 deploy (human): review the queue on hermes. See Risks.

## Risks and Mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| Once the scheduler runs, queued items in due slots are claimed and published to real channels. The `TestingInstagram` item (`1d10e7aa-…`, DRAFT post, Monday 09:30) and any other test items would post for real. | High: unintended public posts | Before deploy, the human removes or detaches test items from pipelines (use the app's remove/delete action, not raw SQL). Re-check the queue after deploy. |
| The Temporal error class name differs from what the spec assumes | "already started" logged as error, or an error handled as expected | Check the error class name and message in `@temporalio/client` 1.15.0 (in `node_modules`) during T1. Unit-test the message fallback too. |
| Test mocks do not match the real client shape (`getRawClient()?.workflow?.start`) | Tests pass but production fails | Mock exactly that chain in T2. Verify on hermes in T5. |
| Changing the order of starts (scheduler now runs even if missing-post fails) | Minor: scheduler starts while missing-post is down | Intended by the spec. Each start is independent. |
| PR template missing | PR fails the project's own rules | Ask the human (Open Questions 1). |

## Open Questions

1. The PR template referenced by CLAUDE.md (`.github/PULL_REQUEST_TEMPLATE.md`) is not in this repo. Should the PR follow the `# QA` / "What kind of change" structure from the rules without it, or do you have the template somewhere else?
2. Before the hermes deploy, do you want to clear the test items from the pipelines yourself, or should the plan include a step to list them for you first?

## Notes

- The agent does not deploy, restart, or start workflows on hermes.
- No code changes happen until this plan is approved.
