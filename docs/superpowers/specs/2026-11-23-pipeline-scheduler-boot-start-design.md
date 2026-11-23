# Spec Delta: Pipeline scheduler starts reliably on boot

Status: proposed (open questions answered; awaiting approval before planning)

Scope: single capability (Temporal boot wiring). No capability map needed.

## Objective

Queued pipeline posts never leave `DRAFT` on hermes because `pipelineSchedulerWorkflowV1` is never running. Without it, nothing calls `claimSlot`, so the post is never changed to `QUEUE`, never gets a `publishDate`, and never publishes. The calendar then projects the item into the next week's slot.

The fix makes each boot-time workflow start independent, so one start failing or already running cannot stop the other, and failures are logged instead of swallowed.

Success for the user: a post queued into a pipeline slot is claimed at the slot time and goes to `QUEUE` with the slot's `publishDate`.

## Current Behavior

`libraries/nestjs-libraries/src/temporal/infinite.workflow.register.ts`, `onModuleInit` (only when `RUN_CRON` is set):

- One `try` block contains two starts, in order: `missingPostWorkflow` (`missing-post-workflow`), then `pipelineSchedulerWorkflowV1` (`pipeline-scheduler-workflow-v1`).
- The `catch (err) {}` is empty.

If the first start throws, the second is never attempted, and the error is hidden.

## Root Cause

Confirmed precondition: `missing-post-workflow` is always open on hermes. The current run (`ecb877e0-…`) is the continue-as-new chain, and its search attributes include `missing-post-continue-as-new`. Because the workflow ID is always in use, a later `start` with the same ID is rejected by Temporal with `WorkflowExecutionAlreadyStartedError`.

Consequence: on every boot with `RUN_CRON` set, the first start throws, the empty `catch` hides it, and `pipelineSchedulerWorkflowV1` is never started.

Evidence on hermes (read-only checks, 2026-11-23 09:27 UTC):

- `pipeline-scheduler-workflow-v1` returns "workflow not found" from `temporal workflow describe`. It has no run in any status.
- `missing-post-workflow` is Running, with a continue-as-new history.
- `RUN_CRON=true` in the `postiz` container.
- The running backend bundle (`/app/apps/backend/dist/.../infinite.workflow.register.js`) contains the scheduler start string, so the code is deployed.
- The `TestingInstagram` pipeline has a Monday 09:30 slot (Europe/London, `minuteOfDay` 570) and one `QUEUED` item with a `DRAFT` post. It has zero `PipelineSlotExecution` rows.

Not yet observed directly: the exact thrown error. The current code discards it. The fix's temporary logging (see New Behavior) will confirm it on the next boot.

## New Behavior

- Each boot start runs in its own `try`.
- `WorkflowExecutionAlreadyStartedError` (or message containing "already started") is expected. It is logged at info level, not as an error. This matches the existing `isAlreadyStarted` helper in `apps/orchestrator/src/workflows/pipeline-workflows/pipeline.scheduler.workflow.v1.ts`.
- Any other error is logged with its name and message. It does not stop the other start.
- `onModuleInit` does not throw.
- The `RUN_CRON` gate and both workflow IDs and task queue (`main`) stay the same.

## Success Criteria

1. With `missing-post-workflow` already running, a boot still starts `pipeline-scheduler-workflow-v1`. `temporal workflow describe -w pipeline-scheduler-workflow-v1` returns status Running.
2. With no `missing-post-workflow` running, both workflows start.
3. A non-"already started" error from either start is logged with name and message, and does not stop the other start.
4. "Already started" produces an info log, not an error log.
5. `onModuleInit` never throws.
6. On hermes after deploy: a `QUEUED` item in a due slot becomes `QUEUE` (posts too), `publishDate` equals the slot time, and a `PipelineSlotExecution` row with status `CLAIMED` exists for that slot.
7. No changes to any workflow file, DB schema, or public API.

## Boundaries

- **Always:** keep `onModuleInit` non-throwing; keep both starts; reuse the "already started" check pattern from `pipeline.scheduler.workflow.v1.ts`; follow existing Nest logging style in the surrounding code.
- **Ask first:** starting `pipeline-scheduler-workflow-v1` by hand on hermes; any change to how the scheduler workflow discovers or claims slots.
- **Never:** edit `pipeline.scheduler.workflow.v1.ts` or any orchestrator workflow that is already in `origin/main` (a change there would fail its activities). Changing scheduler behaviour would need a new workflow version (`v2`) and caller updates.

## Delivery

- The change is built and deployed through GitHub. The agent makes the code change and opens a PR; the human builds and deploys the image from GitHub. The agent does not deploy to hermes.
- The PR description must follow `.github/PULL_REQUEST_TEMPLATE.md`, with a `# QA` section containing numbered steps.

## Out of Scope (Deferred)

- The silent `catch { break; }` in the scheduler's discovery loop. It is inside an orchestrator workflow file already on `origin/main`, so it needs a `v2` workflow. Deferred to that change.
- The calendar moving a missed slot to next week without any warning. This is a UI and projection change, so it gets its own spec.
- Changing the 2-minute grace window (`PIPELINE_SCHEDULER_GRACE_WINDOW_MS`). Not needed for this fix.
- An interim manual start of the scheduler on hermes. Not chosen; the human will re-run the test after deploy.

## Resolved Questions

1. Root cause: confirm the precondition (done above). Exact thrown error to be confirmed by the temporary log after deploy.
2. "Already started" logging: info level (human answered "y").
3. Test runner: root Jest (`jest.config.ts` at repo root; `pnpm test` runs `jest --coverage …`). Tests for `libraries/nestjs-libraries/src/temporal` run under that config.
4. Deploy path: built and deployed via GitHub (human).
5. Timing: the human will re-run the test after deploy; no interim step.

## Verification (for the plan phase)

- Unit test around `onModuleInit` with a fake Temporal client that throws "already started" on the first start, and one that throws a different error.
- After deploy on hermes: `temporal workflow describe -w pipeline-scheduler-workflow-v1` returns Running, and a due-slot claim as in success criteria 6.
