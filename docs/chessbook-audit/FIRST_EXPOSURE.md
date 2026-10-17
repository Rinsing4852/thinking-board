# Learn first, then recall

Implementation increment: 17 October 2026, following the three-move scenario
in [the reconstruction](./RECONSTRUCTION.md). This independently implements the
observed demonstration → execution → hidden recall sequence. It does not infer
Chessbook's unseen scheduling rules or establish equivalent learning outcomes.

## Using it

The [home-learning follow-up](./CONTINUATION_AND_HOME_LEARNING.md) also offers
this choice beside recommended practice when new answers are available and
urgent reviews do not take priority. Alternatives now have explicit answer
numbers during teaching and recall, including later extra retries.

Expand a repertoire card with new moves and choose **Learn new moves first**.
The batch uses your existing new-moves limit. Each position shows a green arrow,
the saved move and its existing explanation. Play that move yourself to advance.
After the demonstrations, the same positions return in order with answers and
arrows hidden. With three positions, two other demonstrations intervene before
the first recall; a one-position batch has no such delay.

The normal quick-practice, recommended, full-line and guided-ideas workflows keep
their existing defaults. Learn-first is an explicit option for new positions,
not a new explanation panel during ordinary recall. Missing imported reasons
remain missing; the teaching stage does not invent chess explanations.

The follow-up review selects unseen saved responses individually, including
alternatives at an already-reviewed position. The batch limit counts responses.
Each selected response is taught before its specific hidden-answer test; deferred
alternatives stay available in the next learn-first batch. Paused/archived
branches are excluded and shared line membership does not duplicate a response.

## Persistence and scoring

The teaching stage is stored on the existing scheduled queue entry. Completing a
demonstration atomically records its completion and activates the next teaching
position. After all demonstrations, the first recall entry becomes active with a
fresh response clock. Reload and pause/resume recover the saved stage.

Demonstrations create no review events, memory-card updates, daily activity or
recall credit. Wrong teaching moves are unscored and leave the stage unchanged.
Recall, reveal, mistake and help endpoints cannot bypass the teaching stage.
Retrying an acknowledged teaching request returns the current stage without
advancing twice; stale, replaced and other-player sessions cannot mutate it.

The later hidden-answer test uses normal recall scoring. Help during that test
remains persisted assistance. The earlier demonstration alone is not reported as
an unaided success; success requires a subsequent hidden-answer attempt. This is
short-term retrieval evidence, not a claim of durable mastery.

## Evidence and remaining work

Six server tests cover the three-move stage sequence, unchanged review cards and
activity, endpoint bypasses, duplicate acknowledgements, player isolation,
replacement, assistance after reload, unchanged practice defaults and Black's
learner colour. The desktop and phone browser journey uses the real API, tests a
failed-save retry and reload halfway through, verifies hidden arrows and help
controls at recall, and confirms the first recall is scored independently.
Desktop and phone screenshots were inspected for the visible move, arrow and
saved explanation.

The [follow-up review](./RECENT_FEATURE_REVIEW.md) also corrects extra-practice
retries: later attempts preserve memory cards, activity credit and next due dates.
They remain recorded as practice attempts with explicit feedback.

This completes an opt-in first-exposure flow. Still unmeasured: matched task
times against Chessbook, comprehension, longer-term unaided retention and whether
this should become the default. Global teaching history, adaptive teaching
interleaving, endpoint leniency and sound-alternative evaluation remain separate
work. The initial verification checkpoint below predates the follow-up review.

Final verification on unchanged product/test/catalogue source passed 284
unit/integration tests, 136 browser journeys, six tracker tests, typechecking
and the production build. Browser results had zero skips, failures or flaky
retries. The tracker records 84 passed requirements, 42 unknown and 42 unmet,
with zero failed requirements; stronger evidence for an already-passing
requirement does not increase these counts or establish competitor parity.
At that checkpoint, the increment was local and uncommitted. It was subsequently
committed and pushed as `3270021` before the follow-up review. The preceding coverage increment was
committed and pushed as `e1da6af` before this work began.
