# Readiness assessment — 21 October 2026

Follow-up: the [22 October reliability pass](./RELIABILITY_PASS_2026_10_22.md)
implements the short gate described below. This document retains the preceding
decision and its historical verification counts.

The learning-route, independent move-quality and model-game guessing increment
is ready to release. Regenerating the audit confirmed the source still matches
the complete verification run: 333 unit/integration tests, 162 browser tests,
six tracker checks, typechecking and production build all passed, with no skips
or flaky retries. The tracker records 97 verified requirements, 42 unknown,
36 unmet and three excluded. Requirement counts are not a parity percentage.

## Decision

Move toward the next feature area after a small reliability gate. A broad
redesign or more guessing features is not justified by the current evidence.
The remaining source and sampling gaps are more valuable than further expansion
of the completed quiz.

Before starting that expansion:

- Reproduce and address Safari home-content reflow while optional summaries
  arrive. Keep touch activation reliable; the teaching test's keyboard setup
  did not fix that observed issue. Verify cold loading, slow/failed summaries,
  repertoire disclosure and navigation without losing the intended action.
- Smoke-test quality feedback against the deployed real Stockfish engine for
  both colours, a sound alternative, a weaker move, mate and failure recovery.
  The automated engine fixtures establish integration and grading logic; they
  do not measure real engine accuracy, availability or latency.

These are focused release-confidence checks, not a claim that the new workflows
have failed their functional acceptance criteria. First-use comprehension and
delayed learning benefit also remain unmeasured.

## Next feature order

1. **Master-game evidence and source selection (CB22/CB41).** Add master-database
   popularity/results alongside rating-band games, keeping their denominators,
   dates, caches and labels separate. Let study source filters change candidates
   without losing saved study. Empty sources must remain explicit rather than
   silently substituting unrelated games. This supplies better evidence for
   both preparation and contextual game selection.
2. **Assisted gap filling with undo (CB27/CB29).** Start with one evidenced gap
   and a bounded preview. Preserve authored moves and notes, record provenance,
   save the batch atomically, and offer safe undo. Verify cancellation, failed
   source data, repeat requests and edits made after generation before expanding
   to whole-repertoire generation.
3. **Richer contextual study feedback.** Use supplied annotations and verified
   engine evidence to explain or assess alternatives. Separate historical play,
   saved repertoire choices and engine recommendations. Do not invent strategic
   plans or convert ungraded guesses into mistakes. Add fuller study-history
   browsing when it helps users revisit actual work.

This assessment uses the local implementation, recorded observations and existing
parity specification. No fresh Chessbook paid-account/runtime comparison or
competitor timing study was performed. The adapted REA evidence/specification/
measurement approach is used; REA itself was not installed or run.
