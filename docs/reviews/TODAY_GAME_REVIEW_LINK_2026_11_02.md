# Today practice and game review completion — 2 November 2026

## Purpose check — LR07, LR10, LR11

The learner should not have to review the same game decision again simply because
it was studied through Today rather than Games. Reuse existing training attempts,
review snapshots and checklist events; do not introduce another scheduler or review
screen. Completing feedback should update the exact source decision, while review,
helped practice and unaided recall remain distinct. Proceed with this focused link;
coaching and progress-trend expansion are outside this change.

Expected benefit: consistent completion information and fewer unnecessary repeated
review actions. This is workflow reliability, not evidence that chess skill improved.

## Implemented behaviour

- Starting any of the five game-derived thinking modes captures the analysis run,
  exercise fingerprint and matching saved feedback snapshot, if present.
- Terminal answers (including incorrect/partial feedback) and reveals record a
  reviewed-only event for the exact own-move engine checkpoint. These actions show
  the teaching feedback, as does Show answer inside a game. Skips, abandoned or
  unfinished attempts, invalid requests and unavailable quiet-move verification do
  not earn completion.
- The existing completion transactions still write results and schedule once. The
  added event does not increment local recall attempts or mark a move recalled.
  The game says **Reviewed in Today practice**, with an explicit recall distinction.
- Only the matching engine decision is reviewed. A repertoire difference at the
  same move remains separate, and a quiet exercise with no flagged game decision
  invents no checklist point. Whole-game completion still requires its checklist.
- Completing Today can create the source game's initial review snapshot. A used
  older snapshot is retained; a current-run attempt waits until the learner asks
  for latest feedback. Pending links apply once. An attempt already attached to an
  older snapshot stays there if the learner starts a fresh review during practice.
- Changed exercise content, newer analysis and another active player cannot gain
  credit from an older attempt. Existing history is not retrospectively inferred.
- Reopening a decision or starting a fresh checklist is respected. Rereading or
  resubmitting the old completion cannot restore its reviewed status. Repeating
  the same correction after Today feedback on the same day counts as helped local
  practice, rather than unaided recall.

## Integration and cost

`training/attempt-lifecycle.ts` captures provenance through
`games/training-review-link.ts`. TrainingService, CandidateTrainingService and
V1TrainingService notify the app-configured GameReplayService inside their existing
completion transactions. GameReplayService appends the existing checklist event,
updates the active replay version to reject stale tabs, and reuses existing library
summaries. No engine analysis or external request is added.

Migration 049 adds only an attempt-context table and index. Results remain in
training_attempts; review events and schedules retain their current ownership.
Storage grows by one small provenance row per eligible attempt and a review event
per linked completion. Migration preserves games, repertoires and attempt history;
there are no dependency or deployment configuration changes.

Rollback: restore the prior application version and leave the additive table and
new events in place. The prior review calculator ignores the new result type;
existing review, recall and FSRS records remain usable. Do not delete learner data
or rewrite historical outcomes to reverse this UI integration.

## Acceptance and measurement

The new G3_REVIEW_LINK and G3_REVIEW_LINK_UI engineering gates cover exact-source
linking, scheduling once, unfinished/abandoned/content-changed attempts, profile
isolation, retained older feedback, pending completion, fresh-review isolation,
manual reopening, idempotence and helped-versus-unaided recall. The browser journey
completes a real Today session, checks the library and source decisions, navigates
to the game and reloads the reviewed-in-practice label on desktop Chromium and
mobile WebKit.

Verification: the final complete quality gate passes all three stages with current
source evidence: 468 unit tests, 236 desktop/mobile browser tests (no failures,
skips or flaky results), type checks, the production build and real Stockfish
regressions (16 tactical cases and 9 full-game cases). The tracker now requires
both new link gates before stage 3 can pass. Physical Safari usability,
comprehension and learning transfer remain unmeasured. A useful follow-up user
check is whether the learner can explain why a decision is reviewed while its
unaided recall is still unproven, and can reopen it without losing their history.
