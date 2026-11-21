# Capability Map: Public pipeline and media API

| Module id | Responsibility | Depends on |
|---|---|---|
| pipeline-list | `GET /public/v1/pipelines`: id, name, timezone, active, nextSlot, channel id/name/provider | — |
| queue-read | `GET /public/v1/pipelines/queue/{id}`: draft / scheduled / published / error, projected or real time, per-channel state and error, group. A date-promoted row is still readable | — |
| pipeline-enqueue | `POST /public/v1/pipelines/enqueue`: always a draft, per-pipeline SHA-256 key, first body wins, repeat returns the original id. Migration from a global unique key to `(pipelineId, key)` | — |
| queue-promote | `POST /public/v1/pipelines/queue/{id}/schedule`: no date returns the read shape or `409 no_free_slot`; a date starts publishing and keeps the key | queue-read, pipeline-enqueue |
| queue-delete | `DELETE` by queue id or group for queued or failed items. Soft-deletes the posts and the row, clears the key | pipeline-enqueue |
| media-lookup | Exact `?name=`, client-supplied `?sha256=` on new uploads, `POST /public/v1/media/folders` returns an existing same-name folder | — |

Build order: `pipeline-list`, `queue-read`, `pipeline-enqueue`, and `media-lookup` have no dependencies and can be specified in any order. Then `queue-promote`. Then `queue-delete`.

The idempotency lookup contract (any row that still has the key, including a row a date-promote removed from the queue) belongs to `pipeline-enqueue`. Promote leaves the key in place. Delete clears it.

Not modules: the settings form stays on `GET /public/v1/integration-settings/{id}`. The Output tab polls `queue-read`. The `ldnpk-video-editor/1.0` User-Agent block stays a Cloudflare rule.

Specs live beside this file, named `spec/SPEC-<module-id>.md`.
