# WebKit release reliability — 31 October 2026

Purpose check (LR10/11/12): GitHub's Linux WebKit checks found horizontal
scrolling in a Chess.com game report and an opening-arrow preview that lost its
keyboard selection. These block publishing the previously authorised update.
Reuse the existing responsive report and suggestion controls; fix their layout
and interaction rather than bypass the failed checks or add another workflow.
Expected benefit is reliable phone review and keyboard board guidance, not a
claim about learning effectiveness. Acceptance requires the two regressions on
Linux WebKit, the full quality gate and successful GitHub publication. Preserve
all games, attempts, schedules, import behaviour and engine analysis. No schema,
dependency or deployment change is needed. Decision: proceed with bounded fixes;
record observed causes and verification below after inspection.

## Observations and fixes

- The pointer can land over a different reply when keyboard focus scrolls the
  suggestions. Mouse enter previously replaced the focused move, showing the
  default three arrows when the hovered reply was outside that three. Prioritise
  the existing focused move until blur. The regression deliberately hovers the
  fourth reply while the first retains focus and checks the actual board arrow
  and rank label.
- In Linux WebKit, resizing the imported game's board to 320 pixels produced a
  persistent 31-pixel document overflow. Native piece rectangles subsequently
  aligned with the smaller board, while the scrollable paint area retained the
  earlier transformed extents. Clip native piece paint at `cg-board`, leaving the
  frame, promotion picker and separate arrow overlay intact. Do not hide overflow
  at the document level. The import journey now checks zero document overflow and
  actual rendered-rook alignment at 320, 360, 390 pixels and the original viewport.
  Poll the asynchronous resize to completion; persistent overflow still fails.
- The wider 320-pixel check also exposed grid min-content sizing for long account
  names. Allow the game heading children to shrink and wrap names within their
  column, instead of widening the page.
- A full-suite timing check exposed a late refresh that cleared the displayed
  report and closed its nested move list. Keep the same game's saved report visible
  while replacement data loads; switching games still clears the old report.
  A held-response regression verifies the open move list survives refresh.
- Both targeted cases passed in the existing Playwright 1.62.1 Linux container
  with no network and disposable server databases. Browser dependencies and a
  compatible SQLite runtime were mounted read-only; no live library was mounted.

Full local acceptance and GitHub's Linux CI/container publication are required
before calling the update ready. The engineering grade does not establish learning
benefit or physical-device usability.

## Local verification

- Strengthened import/layout and arrow-focus regressions: Chromium and WebKit pass
  on both macOS and Linux.
- Linux browser suite after layout/focus fixes: 220 passed, no skipped or flaky
  cases. The subsequent report-refresh change also passes the six targeted cases
  (three journeys in each browser) on Linux and macOS.
- Final current-source acceptance: type checks/build pass; 444 automated tests,
  220 browser journeys and 25 genuine Stockfish checks pass. The quality grader
  reports PASS with current evidence for all three areas.
- GitHub's verification and container publication remain separate release gates;
  inspect the pushed commit's workflow before updating a running installation.
