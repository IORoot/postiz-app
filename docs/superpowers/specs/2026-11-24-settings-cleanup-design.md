# Settings → Clean up tab

## Problem Statement

An organization admin has no way to tidy a Postiz installation. Soft-deleted
posts, removed pipeline queue items, finished slot executions and old media
accumulate forever (on one real install: 660 post rows of which 1 was live, 100
queue items, 273 media records and 1.6 GB of uploads). When a pipeline slot
fails half-way, its queue item stays `PUBLISHING` and its slot execution stays
`CLAIMED` with no way to recover, and posts deleted from the database can leave
Temporal workflows behind. Today the only fix is hand-run scripts on the server.

## Solution

A new **Clean up** tab in Settings, visible only to organization admins. It
shows a summary of what the organization holds, then one button per cleanup
action. Every button first previews how many rows or files it will affect, asks
for confirmation (a typed word for irreversible actions), runs, and reports the
real counts. Everything is scoped to the signed-in organization.

## User Stories

1. As an admin, I want a Clean up tab in Settings, so that I can maintain my installation without server access.
2. As a non-admin team member, I do not want to see or reach the Clean up tab, so that I cannot wipe the calendar by accident.
3. As an admin, I want a summary of posts (live and removed), queue items by status, slot executions, media records, and disk usage, so that I can see what a purge would free.
4. As an admin, I want "Delete all posts" to soft-delete every live post, so that the calendar is emptied but the action is reversible by hand.
5. As an admin, I want "Permanently delete removed posts" to hard-delete posts that are already soft-deleted, so that hidden rows stop accumulating.
6. As an admin, I want deleting posts to also remove their error logs, comments and tag links, so that the database stays consistent.
7. As an admin, I want payout-problem and clip records that referenced a deleted post or media item to be detached, not deleted, so that financial and clip records survive.
8. As an admin, I want "Delete queue items" to hard-delete pipeline queue items together with their posts, so that a pipeline can be emptied in one click.
9. As an admin, I want "Delete REMOVED queue items" to hard-delete only items already marked `REMOVED`, so that I can tidy hidden items safely.
10. As an admin, I want "Delete slot executions" to remove execution history rows, so that old runs stop accumulating.
11. As an admin, I want "Soft delete media" to reuse the existing media soft delete, so that behaviour is consistent with the media library.
12. As an admin, I want "Delete soft-deleted media" to remove the rows and their files, so that hidden media stops using disk.
13. As an admin, I want "Delete all media" to remove all media rows and files from the database and file system, so that I can reclaim all storage.
14. As an admin, I want the media preview to tell me how many posts still reference the media, so that I know what will break.
15. As an admin, I want "Release stuck pipeline items" to reset or fail queue items stuck in `PUBLISHING` whose slot never finalized, so that a failed slot does not block the pipeline forever.
16. As an admin, I want only claims older than 30 minutes released, so that a slot that is genuinely running is never interrupted.
17. As an admin, I want "Terminate stale workflows" to stop post and slot workflows whose post or execution no longer exists, so that no orphaned workflow wakes up later.
18. As an admin, I want every post deletion to terminate that post's Temporal workflow first, so that a deleted post cannot be published or retried.
19. As an admin, I want a failed workflow termination to be logged and not abort the purge, so that one bad workflow does not block cleanup.
20. As an admin on local storage, I want "Delete orphan upload files" to remove files with no media record, so that drift between disk and database is cleaned.
21. As an admin on other storage providers, I do not want a button that cannot work, so the orphan-files button is hidden with a short explanation.
22. As an admin, I want each button to show a count of what it will affect before I confirm, so that I can judge the impact.
23. As an admin, I want reversible actions to use a normal confirm dialog, so that routine tidying stays quick.
24. As an admin, I want irreversible actions to require typing `DELETE`, so that I cannot click through a hard delete.
25. As an admin, I want a result message with the real counts after each action, so that I can verify what happened.
26. As an admin, I want buttons disabled while an action runs, so that I cannot start the same purge twice.
27. As an admin, I want a purge to affect only my organization, so that other organizations on the instance are untouched.
28. As an admin, I want a purge that fails part-way to roll back its database changes, so that I never end up half-deleted.

## Implementation Decisions

- **Scope and authorization:** every action is scoped by the caller's organization. The controller restricts the endpoints to ADMIN and SUPERADMIN roles, following the existing role-check pattern in the backend. No cross-organization or instance-wide mode.
- **Two-phase API:** each action has a preview (dry-run count, no changes) and an execute call. Execute returns the real counts. Previews and execute share one code path so counts cannot drift.
- **Layers:** DTO, controller, service, repository, with the logic in the shared server library and the backend app only hosting the controller. Prisma only, no raw SQL.
- **Post purge:** terminate the Temporal workflows for the affected posts first (best effort, errors logged and swallowed, same pattern as existing post deletion), then delete in one transaction. Dependent rows are handled in the same transaction: tag links, comments and error logs are deleted; payout problems and clips are detached by nulling the reference.
- **Posts soft vs hard:** "Delete all posts" sets `deletedAt` on live posts. "Permanently delete removed posts" hard-deletes only rows that already have `deletedAt`.
- **Queue items:** deleting queue items also deletes the posts that belong to them, and the slot executions that reference them. "Delete REMOVED queue items" is the same operation restricted to status `REMOVED`.
- **Slot executions:** deleting executions does not touch queue items or posts.
- **Media:** "Soft delete media" reuses the existing org-scoped soft delete. The two hard-delete actions remove the database rows and call the storage provider's existing file-removal method for each file. A referencing-posts count is shown in the preview and is a warning, not a block.
- **Storage provider interface:** add an optional file-listing method to the upload provider interface. Only the local provider implements it. The orphan-files action and its UI are only offered when the active provider implements it.
- **Release stuck items:** applies to queue items in `PUBLISHING` whose slot execution is `CLAIMED` and claimed more than 30 minutes ago. The execution is marked failed with an explanatory error. The item returns to queued if its posts still exist, otherwise it is marked failed.
- **Stale workflows:** list running post and slot workflows for the organization and terminate those whose post or slot execution no longer exists.
- **Error logs:** no standalone error-log buttons. Error rows are only deleted as dependents of posts.
- **Frontend:** a new tab in the Settings component, a summary card, and a list of action rows each with a button. One SWR hook per fetch using `useFetch`. Confirmation: a standard confirm for reversible actions, a typed-`DELETE` dialog for irreversible ones. Results shown as a toast.
- **Schema changes:** none, so no migration.
- **Workflows:** no existing workflow or activity is modified. Termination goes through the Temporal client from the service layer.

## Testing Decisions

- **What makes a good test:** assert external behaviour only, meaning counts returned and which rows and files exist afterwards, plus which workflow IDs were asked to terminate. Do not assert call order or Prisma query shapes.
- **Seam (single, highest available):** the cleanup service in the shared server library, driven through its public preview and execute methods, with the Temporal client and storage provider faked. This is the one seam that covers all actions.
- **Cases:** organization isolation; preview count equals execute count; soft vs hard delete of posts; dependents removed or detached; queue item delete cascades to posts and executions; media hard delete calls file removal per file; stuck-item release respects the 30-minute window; workflow termination failure does not abort the purge; a failed transaction leaves data unchanged.
- **Role guard:** one controller-level test that a non-admin is rejected.
- **Prior art:** the existing Jest specs next to the Prisma code (for example the public pipeline list spec and the webhook payload spec) and the infinite-workflow register spec, which fakes the Temporal client in the same way. These are mostly unit-level, so this feature would be the first service test needing a fake persistence layer. The test setup needs confirming because the local Jest config could not load in this environment.

## Out of Scope

- Error-log delete or clear buttons.
- Cross-organization or instance-wide purges, and a superadmin-only mode.
- Orphan-file cleanup on Cloudflare or any provider other than local.
- A `clearedAt` column or any other schema change.
- Scheduled or automatic cleanup.
- Undo for hard deletes, and database backups before a purge.
- Fixing why `finalizeSlot` did not run on the earlier V1 pipeline slot that published successfully.

## Further Notes

- Origin: a failed 13:50 pipeline slot left a queue item stuck in `PUBLISHING`, and the data had to be removed by hand on the server.
- Open point: confirm the 30-minute stuck-claim window.
- Open point: confirm the Jest setup before writing the service tests.
