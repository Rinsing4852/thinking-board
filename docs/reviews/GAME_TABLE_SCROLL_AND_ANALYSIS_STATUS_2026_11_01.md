# Game table scrolling and live analysis status — 1 November 2026

## Purpose check — LR07/10/11

The learner wants every filtered game available within the existing scrolling table,
and the Review column to update when requested analysis completes. The table already
has a bounded height and sticky headings. Existing analysis runs and assessments
record results independently of review snapshots, which are deliberately lazy and
preserve prior attempts. Reuse these records; remove the extra load-more step and
show current analysis separately from the learner's review completion. Proceed.

## Changes and protections

- Render every matching row inside the existing scrolling region. Search, source
  and review filters remain; the table's page height stays bounded. No load-more
  button or selected-row insertion changes the order of matching games.
- Read the active player's latest completed analysis in one grouped database query,
  including own-move assessment coverage and error counts. Timestamp ties use
  insertion order consistently. The games endpoint creates no review snapshots,
  changes no checklist progress and starts no analysis.
- The Review column shows analysis completeness and inaccuracies/mistakes/blunders
  immediately through the existing job-completion refresh. An analysed game without
  a saved checklist is **Ready to review**; it no longer looks indistinguishable
  from a game that has not been analysed.
- New completed analysis relative to saved feedback shows **New analysis to review**
  and appears under Not started, rather than claiming the older completed checklist
  covers it. The previous checklist and attempts remain stored; opening the game
  retains its existing deliberate latest-feedback workflow. Missing assessments
  remain incomplete even if a run was marked completed.
- Analysis completion never awards review/recall credit. Opening practice and
  cross-game practice retain their existing event and scheduling behaviour.

Costs: all filtered rows are rendered, so exceptionally large libraries may require
measured row virtualisation later. Analysis summaries read stored data and add no
engine or network service. No schema, dependency, grading or deployment changes.
Rollback restores the earlier display without modifying saved games or history.
Learning gains are unmeasured; these changes address access and reliable feedback.

## Acceptance

Verify all rows are reachable without Show more, header position during table
scrolling, source/search/navigation retention, requested batch analysis updating an
unopened row, reanalysis invalidating an older completion label without rewriting
the checklist, zero-error versus incomplete analysis, latest-run ties, profile
isolation and no extra engine runs or review snapshots on listing games.

Verified: type checks, production build, **461 unit tests**, **236 browser tests**
(desktop Chromium and mobile WebKit), and both real Stockfish suites (16 tactical
cases and 9 full-game cases) passed. All three engineering quality gates pass with
current source evidence; the final browser run had no failures, skips or flaky
results. Focused scroll/live-status checks also passed in both browsers before
the full run. The browser regression asserts a fixed header while scrolling all
20 rows, analysis readiness without any replay request/snapshot creation, and
reanalysis updating the library while the previous completed checklist is retained.
Service coverage includes incomplete/clean results, latest-run timestamp ties and
profile isolation. Physical-device Safari and learning outcomes remain unmeasured.
