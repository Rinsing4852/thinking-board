# Focused practice on the saved game board

## Purpose check before implementation

- **Aim / need (LR02, LR07, LR10, LR11):** let the learner select a useful part of
  their own game and practise it without navigating a long list or opening another board.
- **Existing capability / simplest option:** reuse saved replay checkpoints, hidden
  answers, local attempts and later-practice actions. Use existing saved JSON state;
  no new scheduler, engine requests, dependencies or database migration.
- **Benefit hypothesis:** easier access to focused recall from real games. This
  increment is a usability improvement, not evidence of fewer blunders.
- **Scope:** Recommended, Analysed mistakes and Opening recall. Allow a union of
  mistakes/openings, deduplicate shared positions and persist round progress.
  Attack/defence labels and practical-mate selection remain separate follow-up work;
  current scores alone do not establish those categories reliably.
- **Acceptance:** filters and counts reflect available saved answers; opening-only
  reviews clearly indicate missing engine analysis; selection never reveals answers
  or records practice credit. Start, answer, skip, continue, finish, reload and exit
  use the same board. Preserve snapshot/history and normal replay/scheduling. Check
  overlapping opening/engine decisions, empty selections and stale-tab recovery.
- **Costs / protections:** additive API and optional saved state; legacy snapshots
  retain their identity. No automatic refresh, analysis, schedule changes or mastery
  claim. Completion means reviewed, not independently mastered.
- **Decision:** implement this contained first step. Do not bundle the wider page
  reorganisation or AI coaching integration into it.

## Delivered behaviour

Choose practice sits above the existing board. A compact disclosure contains the
three categories; Recommended is exclusive, while mistakes/opening recall can be
combined. Counts include saved recall answers only. At a shared decision, the
combined round uses the engine checkpoint; opening recall alone uses the repertoire
checkpoint. It does not union incompatible answer sets or award opening recall for
an engine answer. Selecting categories does not move the board until Start practice.

The server derives and persists the ordered round, current position, reviewed and
skipped checkpoint IDs in the existing replay state. Navigation is locked to the
round until exit; normal replay remains available afterwards. Skipping records no
attempt or exposure. Reveals and same-day retries in that saved snapshot do not
become unaided recalls by restarting a round. Finishing means reviewed, not mastered.

Existing snapshots and local attempts are retained. The former key-study API remains
compatible; its duplicate UI introduction is replaced by the selector. Explicit
snapshot refresh and tomorrow/repertoire scheduling retain their existing rules.
No application-wide session is created and no analysis is started by filtering.

## Evidence and limitations

- Type checking, 437 unit/integration checks and production builds passed.
- Browser checks covered 20 distinct selected cases in Chromium/mobile WebKit.
  After compacting the selector, 18 existing regression cases passed; the focused
  practice case was rerun separately in both browsers after correcting its assertion
  to expand the collapsed choices before checking their disabled state. Both passed.
- Desktop and mobile screenshots were inspected. The category choices now collapse
  to avoid permanently stacking three rows above the board. Physical-device testing
  and a timed usability comparison have not been performed.
- Tests cover shared-position selection, both colours, hidden answers, no-analysis
  and empty states, skip/completion, reload, stale tabs, legacy snapshots, retry
  exposure and unchanged scheduling/analysis behaviour.
- Attack/defence classification, missed-tactic completeness, adjustable practical
  mate selection and coaching explanations are not added. This selector operates on
  existing saved review decisions; it is not a claim that every missed opportunity
  has been detected. Cross-game/date filtering and the wider page reorganisation
  also remain future work.
- The analysis engine and grading thresholds are unchanged. No Stockfish or learning
  efficacy benchmark is claimed for this UI increment. Prepared for release as v1.5.27.
  Publication requires the separate GitHub release checks to complete.
