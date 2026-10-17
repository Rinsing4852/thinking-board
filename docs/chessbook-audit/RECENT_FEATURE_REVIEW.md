# Review of coverage and learn-first delivery

17 October 2026. Baseline commits: coverage `e1da6af`, first exposure `3270021`.
The learn-first commit was committed and pushed before this review began.
The coverage container publication succeeded. Publication of learn-first was
still running at the initial status check; a pushed commit alone is not proof
that an update is available.

Final release check: both [coverage publication](https://github.com/Rinsing4852/thinking-board/actions/runs/39006217433)
and [learn-first publication](https://github.com/Rinsing4852/thinking-board/actions/runs/39012688823)
completed successfully. The improvements below are follow-up local changes,
separate from those two published revisions.

## Method and fresh observations

Following [REA's browser observation guidance](https://github.com/morluto/rea/blob/main/docs/browser-observation.md),
this review separates observed transitions, documented policies, code inspection
and local fixture results. REA MCP/CLI was not run. We used the available browser
inspector and our own source/tests; no competitor private algorithm is claimed.

| Evidence | State/action | Observed result | Limit |
|---|---|---|---|
| R01 | Chessbook guest home → White openings | Completion and mastery are separate; building and learning have separate actions. | Existing guest state; no controlled benchmark or paid account. |
| R02 | Continue building → Go to your biggest gap | Opens `1.d4 e5`, asks for White's answer, and shows candidate purposes. | Ranking/calibration unknown; this was a navigation-only observation. |
| R03 | Continue learning | Shows an explicit optional early-practice choice for three moves not due. | No new competitor practice answers submitted in this review. The earlier three-move demonstration observation remains in the reconstruction ledger. |
| R04 | Official completion documentation | Reach uses the learner's chosen move with probability one and conditional opponent probabilities; relevant positions depend on 1/N. | Documentation, not a matched live recalculation or proof of source data. |
| R05 | Official soft-fail documentation | A later retry is extra practice rather than another spaced-repetition review. | Stockfish-based visual grading and endpoint leniency were not exercised. |

Official sources: [completion](https://wiki.chessbook.com/completion),
[soft fails](https://wiki.chessbook.com/soft-fails). Both were read in the browser
after the web reader could not retrieve them. These observations are a paraphrased
ledger, not a replayable REA capture bundle. No account settings, saved competitor
lines or practice results were changed.

## Findings, ordered by importance

| Priority | Area | Before this review | Comparison / change made |
|---|---|---|---|
| High | Retry scheduling | Recall statistics excluded repeats, but `answer()` still updated both position and move memory cards on a later retry. | Matches the documented extra-practice rule: later retries retain an attempt event but do not change cards, next due date or daily credit. Feedback explicitly labels extra practice. |
| High | Teaching alternatives | The initial target was taught, while an alternative could be asked for without teaching; once a shared position was reviewed, a deferred alternative could disappear from new-position selection. | New selection works per saved response, not just per position. Each batch stays within the existing new-move limit; untaught alternatives remain available. Each hidden test asks for its specific taught response. This is our independent integrity improvement, not an observed Chessbook implementation detail. |
| Medium | Phone correction clarity | The desktop correction explained recall versus chess quality; the phone reduced it to generic retry text. | The same correction meaning is visible on phone. A different saved answer is not falsely described as absent from the repertoire or as a chess blunder. Engine grading remains separate future work. |
| Medium | Coverage next action | Missing answers were labelled Inspect; reply observations could be mistaken for the full position sample. With common data off, uncertainty had no direct route to personal evidence. | Missing-answer buttons now say Prepare this answer; the list explains that its first item has highest estimated reach. Counts explicitly mean sampled games containing that reply. A button switches to the existing one-line personal-game check when population evidence is unavailable/off. |

## What is comparable, and what is not established

**Coverage:** our whole-repertoire check now covers saved-line policies, mixed
first moves, transpositions, encounter thresholds and explicit uncertainty. It
provides a concrete missing-answer action, as the observed competitor workflow
does. Our conservative sample rules, chosen stopping points and 64-policy/work
caps differ from any unobserved competitor internals. There is no defensible
overall completion-percentage equivalence or calibration score.

**Learning:** our explicit option now demonstrates selected unseen responses,
requires execution, persists the stage, then tests those responses without
arrows or automatic explanations. Alternatives are bounded and carried forward.
It is opt-in; ordinary practice and recommended sessions keep their defaults.
Matched human usability and durable retention are still unknown. Optional
engine grading of sound alternatives and endpoint leniency remain absent.

**Measurement:** tests compare exact state changes and memory-card snapshots;
they do not substitute for a user study. The tracker retains unknown/unmet human
and competitor criteria. Additional evidence for an already-passing requirement
does not increase an artificial parity score.

## Verification and remaining priorities

New server fixtures cover deferred alternatives, exact taught targets, paused
and archived membership, deduplication, and both correct and incorrect later
retries with unchanged memory-card snapshots and activity. The existing integration
test now expects the assisted first schedule to survive the successful retry;
its previous expectation that the retry graduated the card was the defect.
The correction applies to future attempts; it does not rewrite historical cards
or remove old practice events.

Browser journeys cover both taught alternatives, hidden exact recall, correction
wording, desktop/phone layouts, save failure/retry, stage reload, and the route
from uncertain population coverage to personal-game evidence. Full-suite results
are recorded after verification in the tracker and below.

The first broad run exposed old text/summary expectations and an unrelated
candidate-entry timeout. Correction tests now assert the exact visible meaning,
the extra-practice label, and four reviewed plus one learning card. Candidate
entry passed unchanged in a focused run on both browsers; that does not establish
the original timeout's cause. A complete rerun is required before final sign-off.

Final verification: the complete rerun passed on unchanged product, test and
catalogue source: **288 unit/integration tests, 138 browser journeys, six tracker
tests, typechecking and the production build**. It had zero skipped, failed or
flaky browser results. This is the final local verification result; it does not
establish the earlier timeout's cause or substitute for hosted release checks.
The follow-up improvements were prepared for commit/push after this run in
response to the user's renewed instruction. Their hosted publication is separate
from the two successful baseline releases linked above.

Next priorities:

1. Run the matched human clarity tasks: identify one missing answer, distinguish
   uncertainty from missing preparation, and teach/resume/recall three responses.
   Use the same legal positions and settings in each product; report time, errors
   and recovery separately. Do not convert automated pass counts into quality.
2. Add continuation for the local whole-repertoire policy budget; currently plans
   beyond the cap remain explicitly unchecked. Keep unknown sample frontiers
   separate from genuine missing responses.
3. Improve entry-point coherence once measured: decide whether learn-first should
   be offered by the recommended action rather than only the repertoire card.
4. Add contextual model-game study, then sound-alternative explanations and
   explicit endpoint policy. Neither follows merely from adding this teaching flow.

Follow-up: priorities 2 and 3 now have a bounded implementation in
[continued coverage and home learning](./CONTINUATION_AND_HOME_LEARNING.md).
Human outcomes remain unmeasured; the offer is explicit rather than a default
pacing change. Per-policy incomplete frontiers and reload checkpoints remain
separate limits.
