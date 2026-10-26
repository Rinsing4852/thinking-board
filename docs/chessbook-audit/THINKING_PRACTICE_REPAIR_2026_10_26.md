# Thinking-practice completion and game filters

The Today practice count previously mixed the permanent exercise library with
work due for review. Session creation also filled empty spaces with exercises
whose next review was still in the future. Failed/revealed answers were due
immediately, so a new session could repeat them at once.

## Resulting behaviour

- Today distinguishes exercises due now from the saved library. Session progress
  and its remaining mix decrease as answers are recorded, while feedback stays
  visible until Continue. The completion screen stays visible until dismissed.
- New recommended sessions select due exercises only, up to 15. They do not fill
  with future reviews. Small requested session sizes are also honoured.
- Missed and revealed answers receive a ten-minute retry interval. Successful
  answers keep their existing mastery intervals. Individual-mode Review early,
  mastered and random choices remain deliberate ways to practise ahead of time.
- Practice games supports all dates or rolling 1, 2, 7, 30 and 90-day windows.
  This uses the game's played date, not its import or analysis date. Bounded
  windows exclude undated/future games; All game dates retains them.
- The filter applies to recommended sessions, individual exercise modes and
  their early/random/mastered pools. Explicitly opening a particular saved game
  exercise remains possible regardless of the general date filter.
- Migration 045 saves the filter on the session. Reload and resume preserve
  scope and progress. Finish a current session before changing its filter.
- Late exercise responses from a previous filter cannot replace the current
  selection. Invalid API filters return 400 rather than silently widening scope.

No games, exercises or attempts are deleted. Existing sessions remain resumable;
their original selected items are retained. The date selector affects thinking
exercises from uploaded games, not opening-repertoire recall or global progress.
Analysis remains explicitly requested. There is no automatic reanalysis or change
to the live installation.

## Evidence

Regression coverage includes successful/revealed answers, future reviews, fresh
sessions, resumed progress, date boundaries, unknown/future dates, inactive and
diagnostic items, small session sizes and invalid filters. Desktop Chromium and
mobile WebKit journeys exercise immediate count changes, feedback preservation,
resume after reload, completed-session recovery, a disjoint next session and a
late wider-filter response.

The existing REA tracker records these as CB54.6–CB54.8. These are independent
workflow acceptance checks, not evidence of a measured Chessbook parity score.
Final frozen-source verification passed: **378 unit/integration tests, 196
Chromium/mobile-WebKit browser checks and six tracker tests**, with no failures,
flaky retries or skipped browser checks. Type checking and the production build
also passed. The existing large-bundle build advisory remains. The refreshed
tracker records 131 verified, zero failed, 41 unknown and 30 unmet requirements.
The exact source fingerprint and results are saved in
`evidence/thinking-practice-2026-10-26/verified-run.json`, alongside desktop and
mobile captures. Changes remain local, uncommitted and unpublished.

An earlier full run recorded 195 passing browser checks and one timeout in the
existing opening daily-activity journey. That test recorded 942,499 ms despite
its 60-second timeout; the elapsed gap is consistent with host sleep. It passed
independently in 2.6 seconds. A final full run uses temporary idle-sleep
prevention. The interrupted-run metadata and failing-check summary are retained
under `evidence/thinking-practice-2026-10-26/`; neither the test nor its timeout
was weakened.
