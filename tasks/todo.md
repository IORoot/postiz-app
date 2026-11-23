# Tasks: Pipeline scheduler starts reliably on boot

Plan: `tasks/plan.md`. Spec: `docs/superpowers/specs/2026-11-23-pipeline-scheduler-boot-start-design.md`.

- [ ] T1: Independent boot starts in `libraries/nestjs-libraries/src/temporal/infinite.workflow.register.ts`
  - Acceptance: both starts attempted; no throw from `onModuleInit`; `RUN_CRON` gate unchanged
  - Verify: code review against spec criteria 1–5
  - Files: `infinite.workflow.register.ts`

- [ ] T2: Unit spec `infinite.workflow.register.spec.ts`
  - Acceptance: already-started (info), other error (error log, scheduler still starts), both succeed, RUN_CRON unset, no rejection
  - Verify: `pnpm exec jest libraries/nestjs-libraries/src/temporal`
  - Files: `infinite.workflow.register.spec.ts` (new)

- [ ] T3: Root lint and test
  - Acceptance: no new lint or test failures in touched files
  - Verify: run from repo root

- [ ] T4: Branch, commit, PR with template-compliant description and `# QA`
  - Acceptance: CI green or failures explained; PR template question resolved
  - Verify: human review

- [ ] T5: Human builds and deploys via GitHub; verify on hermes (agent does not deploy)
  - Acceptance: spec criteria 1 and 6 pass
  - Verify: `temporal workflow describe -w pipeline-scheduler-workflow-v1`; due-slot claim check

## Before T5
- [ ] Remove or detach test items from pipelines on hermes (they would publish for real once the scheduler runs)
