# Calendar year view with heatmap

## Problem Statement

The calendar only shows a day, a week, a month or a flat list. When I plan content across pipelines I cannot see the whole year at once: which days are busy, which are empty, and which pipeline is feeding which days. I have to page through twelve months one at a time and cannot compare the same date across months.

## Solution

Add a **Year** view next to Day, Week, Month and List. It shows the whole year as a grid: each month is a row, each date number 1 to 31 is a column. Every day that has posts shows small circles under its day number, one circle per pipeline (plus one neutral circle for posts that did not come from a pipeline). A circle is filled with its pipeline's colour and contains the number of posts, one post per channel, from that source on that day.

Above the year grid sits a compact GitHub-style heatmap with the same 12 by 31 shape. Each cell gets a more vivid shade the more posts that day has, and no fill when it has none. Clicking a day in the year grid opens the existing Month view on that month with that day selected.

## User Stories

1. As a social media manager, I want a Year option in the calendar view switcher, so that I can see my whole year of content at once.
2. As a social media manager, I want each month shown as a row and each date as a column, so that I can compare the same date across months.
3. As a social media manager, I want the day number shown small in each cell, so that I can find a date without it dominating the grid.
4. As a social media manager, I want days that do not exist in a short month (for example 30 February) to be empty cells, so that the grid stays aligned.
5. As a social media manager, I want a circle on every day that has posts, so that I can see at a glance which days are scheduled.
6. As a social media manager, I want the number inside the circle to be how many posts go out that day for that source, so that a pipeline item sent to four channels reads as 4.
7. As a social media manager, I want each pipeline to have its own circle on a day, so that I can see which pipelines are feeding that day.
8. As a social media manager, I want a circle to use its pipeline's colour, so that I can tell pipelines apart without reading labels.
9. As a social media manager, I want posts that did not come from a pipeline to share one neutral circle, so that ordinary scheduled posts are still counted.
10. As a social media manager, I want circles stacked vertically with the row growing taller when a day has several sources, so that every number stays readable.
11. As a social media manager, I want circles ordered consistently within a day, so that a pipeline sits in the same position wherever it appears.
12. As a social media manager, I want queued pipeline items to appear on the dates they are projected to publish, so that the year view matches what the month view shows.
13. As a social media manager, I want published posts in the past to be counted like upcoming posts, so that I can review how busy past months were.
14. As a social media manager, I want deleted posts to be left out, so that the year reflects what is actually planned or published.
15. As a social media manager, I want comments and follow-up posts not counted as separate posts, so that a thread counts once per channel.
16. As a social media manager, I want the customer filter that applies to the month view to apply to the year view, so that I can look at one customer's year.
17. As a social media manager, I want to click a day, or a circle on a day, and land on the Month view for that month with that day selected, so that I can drill into the posts.
18. As a social media manager, I want previous and next arrows that move by one year while in Year view, so that I can look at other years.
19. As a social media manager, I want the Today control to return to the current year, so that I can get back easily.
20. As a social media manager, I want the current day highlighted in the grid, so that I can orient myself.
21. As a social media manager, I want a heatmap above the year grid, so that I can see the busy and quiet stretches of the year in one glance.
22. As a social media manager, I want the heatmap to have 12 rows and 31 columns, so that it lines up with the grid below it.
23. As a social media manager, I want days with no posts to have no fill in the heatmap, so that gaps stand out.
24. As a social media manager, I want days with more posts to be a more vivid shade, so that busy days stand out.
25. As a social media manager, I want the shades scaled to the busiest day of the year in four steps, so that differences stay visible whether I post a few or many posts a day.
26. As a social media manager, I want a Less to More legend under the heatmap, so that I know how to read the shades.
27. As a social media manager, I want hovering a heatmap cell to show the date and the total number of posts, so that I can read exact values.
28. As a social media manager, I want the year view to load quickly even with a lot of history, so that it does not feel heavier than the month view.
29. As a social media manager, I want the year to follow the selected date's timezone, so that a post at 23:30 UTC lands on the correct local day.
30. As a social media manager, I want the year view to show a loading state while data loads, so that I know the screen is working.
31. As a social media manager, I want my last selected view to be remembered, as for the other views, so that I return to the year view next time.
32. As an installation owner, I want the year view to only show my organisation's posts, so that other organisations' data is never exposed.
33. As an installation owner, I want the year view to work with the existing pipelines without any data migration, so that nothing changes for existing users.

## Implementation Decisions

- **New display mode.** `year` joins `day`, `week`, `month` and `list` wherever the display is typed, persisted in the URL and the saved preference, and switched in the calendar filters. The date range for year is the whole calendar year of the reference date. Previous and next step by one year; Today selects the current year.
- **Grid orientation.** Rows are months, columns are the date numbers 1 to 31, so every month starts in column 1 and short months leave trailing cells empty. The column header carries the date numbers, so a cell only repeats the number in small type where the design needs it.
- **Cell content.** One circle per source on that day: one per pipeline and one neutral circle for all non-pipeline posts. The count is the number of post rows from that source (one row per channel), top-level posts only so comments do not inflate it. Circles stack vertically and the month row grows with the largest stack in that row.
- **Colour.** A circle uses the colour stored on its pipeline; non-pipeline posts use the application's neutral accent colour. Contrast of the number on the fill must stay readable for any pipeline colour.
- **Click behaviour.** Clicking a day, or a circle on a day, opens the existing Month view with that month and day selected. A circle does not filter the Month view to its pipeline; it takes you to the same place as its day.
- **Heatmap.** Above the year grid only. 12 by 31, one accent hue, no fill at zero. Four steps scaled to the busiest day of the year (quartiles of the maximum), recomputed per loaded year and per customer filter. A Less to More legend is shown under it. A hover tooltip gives the date and total count.
- **Counts used by the heatmap** are the day totals across all sources.
- **Data loading.** A new read-only endpoint returns the year overview for the organisation, going through the usual layers: DTO, controller, service, repository, Prisma only, no raw SQL. It accepts the year and the optional customer filter, and returns one minimal row per post: the publish date, the pipeline id and the pipeline colour (empty for non-pipeline posts). It returns no post content, tags or integration data.
- **Queued pipeline items.** Items still queued in an active pipeline are projected onto their upcoming slots, using the same projection logic the month view already uses, so both views agree. Items that are claimed or published appear on the date stored on their posts. The posts service needs the pipeline projection, so the projection is exposed from the pipeline side and called from the generic code; generic post code must not contain pipeline-specific branches beyond that call, in line with the project's rule that generic code stays generic.
- **Timezone.** The endpoint returns timestamps; the client buckets them into days in the user's local timezone, the same way the month view places posts. A pure bucketing function groups rows into per-day, per-source counts and computes the heatmap levels.
- **Data fetching rules.** One SWR hook for the year overview, using the shared fetch hook; no object of hooks.
- **No schema change and no migration.** The endpoint reads existing columns only. The response only exposes data the month view already shows, restricted to the caller's organisation.
- **Existing views untouched.** Day, week, month and list keep their behaviour. The list view stays on its own fetch.
- **Docker overlay.** Every new or changed file gets a matching overlay copy line (specs excluded).

## Testing Decisions

- A good test checks external behaviour only: given these rows and this timezone, these cells, circles and heatmap levels come out. No assertions on internals, call order or styling classes.
- **Seam 1, backend: the year-overview service**, with the post and pipeline repositories faked. It checks organisation scoping, that deleted posts and comments are excluded, that the customer filter is passed through, that queued pipeline items are projected onto slots, and that rows carry the pipeline id and colour. Prior art: the existing pipeline service spec in the pipelines folder and the cleanup service spec, which fake repositories the same way.
- **Seam 2, frontend: the year grid model**, a pure function from rows, year and timezone to the per-month, per-day, per-source counts plus heatmap levels. It checks local-day bucketing across midnight, short months and leap years, one circle per pipeline with a neutral circle for non-pipeline posts, stable circle ordering, quartile levels scaled to the busiest day, and zero days having no level. Prior art: the pipeline utilities spec in the frontend, which tests pure helpers the same way. Note that the frontend has no jest project wired into CI, so the spec is run locally with a throwaway config and is not enforced by CI.
- The view components, the heatmap and the click navigation are checked manually in a browser: switching to Year, reading the grid, clicking a day, changing year, and the heatmap legend.
- Two seams are used on purpose rather than one: the timezone bucketing has to be on the client, so it cannot sit behind the backend seam.

## Out of Scope

- Clicking a circle to filter the Month view to that pipeline's posts (a circle click only navigates, like its day).
- Editing, dragging or creating posts from the year view.
- Showing post content, channel avatars or titles in the grid.
- A heatmap on the day, week, month or list views.
- Per-channel filters in the year view beyond the existing customer filter.
- Choosing a different count (distinct channels or distinct items) or a different heatmap scale.
- Weekday-aligned columns.
- Exporting or printing the year view.

## Further Notes

- The original request named "number of channels" for the circle; this was resolved to count posts per channel, which is the same thing for a pipeline item sent once to each channel and differs only when two items go out on the same day for the same channel.
- The count is per source, so a day with two pipelines shows two circles, and the heatmap shows their sum.
- Projected queue slots only exist as far ahead as the queue is long, so far-future months can look empty until more items are queued.
- No issue tracker is configured for this repository, so the spec lives here instead of being published with a triage label.
