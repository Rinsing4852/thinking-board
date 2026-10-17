# Three-step polish pass

This follows REA's evidence-led approach: reproduce the behaviour, retain the
observations, test a specific explanation, then keep the limits explicit. REA's
MCP/CLI was not installed or run. No new competitor runtime or human usability
results are claimed.

## 1. Safari stability

The preceding hosted release (`fb24a5c`, run `39026431298`) published successfully,
but a reduced-motion board-position check required a retry. Twenty local macOS
WebKit repetitions passed without reproducing it. An isolated Linux Playwright
1.62.1 container then reproduced it: 17 failures out of 40 animated/reduced-motion
runs. A diagnostic run reproduced all three reduced-motion failures and passed
all three animated cases.

[Retained layout measurements](./evidence/mobile-focus-layout.json) show the
baseline was taken before focus-mode styles reached layout: section padding was
32px instead of 16px, and the board was narrower. Both had settled by the first
piece-selection click, before rejection. The status box stayed the same height.
This is an initial-layout measurement race, not evidence that the correction
message caused this particular 16px shift.

The test now waits for the intended section padding and page width before taking
the baseline. It retains strict board-position checks during rejection and after
return, animation/input checks and timing checks. Before/after layout diagnostics
are attached for future failures. Twenty repeated Linux checks then passed,
including ten reduced-motion cases. This does not prove all physical Safari
versions are flawless.

CI now fails if any browser test passes only on retry, and uploads retained
diagnostics even after a retried pass. This closes the earlier gap where a green
release could hide an intermittent failure and discard its trace.

## 2. Clarity

- Explain saved plans with the concrete example of 1.e4 and 1.d4 in one repertoire.
- State that coverage checks saved answers and practice tests memory.
- Explain that a full move means a White move and a Black move, and that the
  checking limit does not mark later positions as prepared.
- Call the continuation action “Check next saved plans”. Keep fetching frequency
  samples as a separate, accurately named action.
- Say missing-answer counts apply to plans checked so far. Finding zero gaps
  does not confirm completion while plans, continuations or data remain unchecked.
- State that leaving the view or changing settings resets the check, while saved
  moves remain intact. A fresh check also collapses the expanded answer list.
- Explain numbered recall below the board, without exposing the requested move.

These are reviewed copy/layout improvements, not measured first-use comprehension.

## 3. Reliability

The new browser journey starts from a controlled complete result and checks
invalidation after a limit change, ignores a held obsolete response, switches
between one-line and whole-repertoire modes, closes/reopens tools, reloads, and
returns after changing the actual rating, preparation goal and time-control
settings. The final check uses the real server and must show the new scope, with
no stale completion claim. Existing continuation snapshot, graph-change, unknown
data and cap tests remain in place.

The controlled response is a UI fixture, not a claim about real-world preparation
quality. Server tests separately verify graph traversal and evidence snapshots.
Checks remain session-local; persistent checkpoints are not introduced.

## Next feature

The [contextual model-game proposal](./CONTEXTUAL_MODEL_GAMES.md) specifies the next
increment and its quality gates. CB40 remains absent until it is implemented and
verified. The first milestone is transparent exact-position matching, replay and
resume; guessing and richer plan explanations follow.

## Verification evidence

- Final macOS verification on unchanged product/test/catalogue source passed
  **294 unit/integration tests, 144 browser journeys, six tracker checks,
  typechecking and the production build**, with no failed, skipped or flaky
  browser results. The generated tracker records current evidence: 84 verified
  requirements, 42 unknown and 42 unmet; these are not parity percentages.
- The complete Linux browser suite passed **144 journeys**, with CI mode enabled
  and no retried failures. This followed the repeated Safari diagnosis above.
- A final visual-review edit made the below-board reminder name the requested
  answer directly, since correction status temporarily replaces the prompt above.
  Both Linux browser journeys for taught alternatives passed after that edit.
- The desktop and phone coverage screenshots were reviewed. The check/result,
  scope, chosen stopping point and checking-limit explanation remain distinct.
- Automated evidence does not establish first-use comprehension or improved
  retention. Those remain human measurements in the tracker.
