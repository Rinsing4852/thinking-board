# Thinking practice follow-up — v1.5.23

The first two recommendations from the whole-thinking review are implemented.
The preceding repair was committed and pushed as `219f8ba`; publication is a
separate GitHub Actions step.

## Repeated tactical opportunities

A recommended session picks one representative when the same engine-supported
answer persists across consecutive learner turns in the same game and exercise
perspective. In the supplied game, moves 28, 29 and 30 form one missed-Qxh3 group
and one opponent-Qxd7 group. They teach different perspectives and remain
separate exercises. The selected representative follows the existing weakness
and review priorities.

Grouping compares the game, exercise mode, missed/safety perspective, response
move, proof type and captured piece. It joins adjacent learner turns only;
a later recurrence after a gap or a different game retains its own identity.
Incomplete legacy evidence remains independent. Broader semantic motif matching
is not claimed.

All positions and review states remain intact. Deferred examples remain due and
can appear in a later session or individual game review. They earn no mastery
or completed-practice credit from another position's answer. Session and resume
messages explicitly say how many similar positions were kept for later. A
shorter session and a larger due-library count are therefore explained.

Migration 046 adds the persisted deferred count with a zero default for existing
sessions. Already-started sessions retain their selected positions.

## Quiet alternatives on request

**Check improvement** sends an explicit verification request. Saved examples
are graded without a fresh engine search. An unlisted legal move is compared
with Stockfish's leading move using the complete prior game history. The search
runs at depth 12–16, with a maximum of 500,000 nodes per search and at most two
searches; a twenty-second deadline stops a stalled check. Returned search depth
must reach at least 10. A stronger restricted-search result becomes the comparison
reference, rather than being wrongly penalised.

A quiet move within 75 centipawns of that reference can receive full credit,
including a move from a different piece. Sound captures/checks and winning
forced-mate moves are described as forcing instead of quiet plans. A worse
move is explained as weaker under this finite search. Mate comparisons do not
invent pawn-equivalent scores. A missing score, shallow search, busy or unavailable
engine, or timeout leaves the move unverified and the attempt open. No failed
review or mastery change is recorded. Users can retry the check or explicitly
reveal an example.

The feedback retains the engine verdict, achieved depth, loss where applicable,
leading move and a short continuation in the existing attempt history. The board
shows the accepted alternative when supported. Users can expand the engine
comparison without adding a new page or settings section.

While checking, duplicate submission, changing the move and revealing are
disabled. Late UI responses are ignored when the exercise/filter/player changes.
The server rechecks active player, exercise and attempt state after the search;
a reveal or another answer cannot earn duplicate review credit. No new engine
work occurs on import, session creation, reveal or saved-example answers.

## Validation

See [verified evidence](evidence/thinking-practice-followup-2026-10-27/verified-run.json).
The complete type/build/unit/browser suite and real-engine scripts are rerun on
the final source. Unit checks cover grouping/persistence, history and search
limits, stronger alternatives, weaker/forcing moves, missing scores, timeout,
player switching, deactivation and reveal during a check. Chromium and WebKit
exercise the pending state and acceptance of another piece's quiet improvement.
The browser interaction uses a deterministic mocked answer; separate service
regressions and the real Stockfish script establish engine behaviour.

The public full-game Stockfish regression also verifies that the three queen
opportunities group correctly without losing the individual positions.
Additional real-engine checks accept Bc4 for White after e4 e5 and Nf6 for Black
after e4 e5 Nf3, through the actual answer-and-save service.

## Publication reliability follow-up

GitHub blocked the preceding repair's publication because its Linux WebKit
arrow-preview test passed only on retry. A pointer-leave event could clear a
keyboard-focused reply's preview. Suggestion rows now retain the focused move
when the pointer leaves and reset it when the board position changes. The
browser regression explicitly focuses a reply, sends pointer leave, checks the
single arrow, then checks hide/show behaviour. Flaky-test rejection remains
enabled; no test is skipped or relaxed.

The footer build-identifier test also uses the shared version constant, so a
release version bump does not leave a stale literal expectation.

## Next work

1. Expand the labelled decision corpus with sound sacrifices, pinned defenders,
   delayed recaptures, quiet defence and ordinary opening development. Track
   false tactical selections and missed opportunities separately per motif.
2. Build teaching sequences around the critical defensive reply, followed by
   delayed unaided recall. Keep recall measures separate from immediate engine
   answer correctness.

Passing a small curated set is not a tactical precision percentage, a measured
learning benefit or a Chessbook parity score. Broad motif diversity and a
full tactical proof tree remain outside this change.
