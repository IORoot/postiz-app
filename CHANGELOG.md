# Changelog

Versions below continue from v2.25.1. They are not git tags.

## 2.33.0 — 2026-10-18 — Pipelines

Queue posts into a weekly pipeline and let the next open slot publish them.

- Create a pipeline with channels, a timezone, and a weekly schedule.
- Add a post to the queue without picking a date.
- The calendar shows each queued post once, on its projected slot.
- Reorder, remove, delete, publish now, pin a time, copy, or move a queued post.
- A new scheduler claims the slot and publishes through the existing post workflow.

## 2.32.0 — 2026-10-18 — Media folders

Organise the media library into folders.

- Nested folders, scoped to the organisation.
- Create, rename, and delete folders from a sidebar.
- Move a file into a folder.
- The library can show one folder at a time.
- Bulk delete stays inside the folder that is open.

## 2.31.0 — 2026-10-16 — Buffer channel

Publish a scheduled post through a Buffer profile.

- Connect Buffer with an API key and choose one profile.
- The post is sent to Buffer when its calendar time arrives.
- Images and videos use a public URL Buffer can fetch.
- Local or private media URLs are rejected before send.
- A video file is sent as a video attachment.

## 2.30.0 — 2026-10-13 — Webhook channel

Send a scheduled post to your own HTTPS endpoint.

- A webhook is a channel, with a name, a URL, and optional headers.
- A failed request marks the post failed so it can be retried.
- The payload includes the media and the channel settings.
- Send Test posts the same fields as a live publish.
- The webhook icon is the channel avatar, including channels already connected.

## 2.29.0 — 2026-10-13 — Video editor

Edit video in the media library and save the render back as a new file.

- Trim, split, and skip clips on a timeline.
- Play, undo, and a time scale, with the timeline fitted to the screen.
- Overlay images, text, and SVG on the video.
- Audio files can be added in the library.
- The edit is rendered on the server.

## 2.28.0 — 2026-10-12 — Image editor

Edit images in the app instead of Polotno, and save the result to the library.

- Start from a library image or a blank canvas.
- Layers for photos, text, shapes, drawing, and SVG, including SVG recolour.
- Crop, rotate, flip, and colour adjustments, with undo and redo.
- Snap to a grid, and set layer size, opacity, rotation, and order.
- Save presets and a brand kit in the browser, and import or export them.

## 2.27.0 — 2026-10-12 — Bulk media select

Select many files in the media library and hide or delete them together.

- Select mode on the media page.
- Select the current page or the whole library.
- Hide a file without removing it from storage.
- Delete a file and remove it from storage.
- Video thumbnails show the duration.

## 2.26.0 — 2026-10-04 — Bulk post actions

Act on many posts at once from the calendar list.

- Select rows, or every post in a date group.
- Move the selection to draft, or schedule it.
- Shift the selection earlier or later by an amount of time.
- Delete the selection.
- Up to 100 posts per request, with a success or failure for each post.
