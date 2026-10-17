# Chessbook behaviour reconstruction and quality plan

Review: 17 October 2026. Our starting revision: `52e7842`.

## Conclusion

The biggest remaining gap is the continuity of the learning experience. We have
much of the necessary opening graph, board, engine, practice scheduler and
personal-game matching. Chessbook brings these together with a more focused
build → understand → recall → revisit loop, contextual model games, and assisted
repertoire construction. Adding more panels will not close that gap.

This is an independent behavioural specification, not recovered Chessbook source
code. A useful target is equivalent task outcomes with understandable evidence,
reliable recovery and sensible study workload. Visual similarity or a checklist
percentage does not demonstrate equivalent quality.

## Method and evidence boundary

The [REA browser-observation guidance](https://github.com/morluto/rea/blob/main/docs/browser-observation.md)
emphasizes bounded observations, explicit provenance, reproducible scenarios and
unknown results when evidence is incomplete. We adapted that method with the
available browser inspector and our source code. REA MCP/CLI was **not** installed
or run, and a Chrome-family browser was unavailable in the connected browser
inventory. The in-app browser provided DOM/accessibility snapshots and screenshots.

For each scenario: establish the visible state, perform one meaningful action,
inspect the resulting state, and distinguish observed behaviour from documentation
and our proposed implementation. Transition snapshots can contain both outgoing
and incoming panels; those snapshots alone do not prove duplicated final UI.

We inspected the public guest app, including a three-move White repertoire already
present in its guest session (`d4`, `c4`, `Nf3`). First-practice actions and one
intentional recall miss changed only that guest learning state. No account was
created or connected, no personal games were uploaded, no purchase was made, and
no autofill was applied. The guest session is not a controlled benchmark dataset.

We did not recover client bundles, request bodies, internal ranking weights,
server code, proprietary data, or trained models. Current official documentation
was also read through the browser. Earlier observations in `catalog.json` remain
historical unless explicitly refreshed here.

## Observation ledger

| ID | State and action | Observed result | What this does not establish |
|---|---|---|---|
| O01 | Guest home → White repertoire | Build and memory progress are separate. Practice, model games and played-game review are distinct tasks. | That home ranking is optimal, or that every account sees identical tasks. |
| O02 | White overview → first learning/build action | Builder shows saved own move, alternatives control, engine evaluation, master percentage and peer results. | How master samples are fetched or candidates are internally ranked. |
| O03 | Builder → biggest gap | Opened `1.d4 e5`; the prompt asked for White's response. Candidate moves had evaluation and short purpose text. | That `...e5` is globally the most frequent reply. Other branches were already saved; the exact gap score is unknown. |
| O04 | Repertoire settings → encounter goal | Goals offered 1 in 150, 200, 300 and 400 games with a more-options control. | Completion recalculation: no goal was changed in this observation. |
| O05 | Memory action → due review | A separate choice offered due work or a specific opening. Three due moves were available. | Queue behavior for a large backlog; a recommended small-batch option was not exposed in this small guest session. |
| O06 | Start due practice with unseen moves | Move, purpose and directional arrow were shown. Playing `d4`, `c4`, `Nf3` advanced with automatic opponent moves. Correct/wrong counters stayed at zero during these demonstrations. | Long-term learning benefit or the hidden scheduling update. |
| O07 | After the three demonstrations | Returned to the starting position with the move hidden and a hint action available. | The complete interleaving/retest policy for a larger repertoire. |
| O08 | During recall, play unsaved legal `1.e4` instead of saved `1.d4` | The piece returned and the wrong-answer counter became one. | A visual/engine classification of that move as a chess mistake: that feedback was not captured reliably. |
| O09 | Request help, then exit practice | Help progressed from a hint to an answer action; exiting exposed a resumable session with four items left. | Reload recovery or offline recovery in Chessbook; these were not tested. |
| O10 | Open autofill | Six preference points could be allocated across practical results, objective strength and ease of learning. Application remained unavailable before allocation. The screen offered later removal. | Generated line quality, atomicity or actual undo behaviour; no autofill was executed. |
| O11 | Home → model game | A Smyslov–Keres game was linked to the saved Queen's Gambit Accepted route. Replay, hint, guessing, another game and history controls were visible. Source label included online and master games. | How games are ranked, whether all sources are available to every account, or the quality of other model-game explanations. |
| O12 | Model game → next move | Advanced to `d4`, changed the board and evaluation, and displayed move-purpose text. | That every later move has an explanation or that replay contributes to mastery. |
| O13 | Review played-game entries on home | Connection requirement was explicit. | Account sync, mistake detection and opening-performance runtime quality; account access was not used. |
| O14 | Global settings → player context | Rating field, platform and speed were separate; the settled form showed 1500, Chess.com and Blitz. An earlier summary displayed a different rating band. No values were changed. | A stable matched rating-population comparison: the summary/form discrepancy was not resolved. |

Screenshots and state snapshots were inspected in the review session. The ledger
is the saved paraphrased observation record; it is not a replayable HAR, a
content-addressed REA evidence bundle, or a saved screenshot archive.

## Reconstructed workflows

### Building and preparation

Observed sequence:

`Home → side/repertoire → Build → choose own move / inspect saved move → gap → choose response`

The board stays the primary interaction surface. Supporting information belongs
to the current decision. Build progress answers whether likely replies have saved
answers; memory progress answers whether the learner recalls those answers.

Our implementation already supports both colours, mixed first moves, graph
transpositions, primary/alternative/idea roles, personal observations, population
frequencies, practical reply arrows and engine scores. The remaining quality work
is to present one next decision and one evidence panel, with a visible return to
the previous task. Preserve the optional unsaved analysis mode, but make its mode
and save action unmistakable.

A material coverage difference remains: our encounter goal is scoped to a selected
line and move limit. Personal observations cover saved branches within that
limit. Chessbook's published completion criterion concerns every relevant
position in the repertoire policy. Our scoped result must not be presented as
whole-repertoire completion, even when all current acceptance checks pass.

To close that gap, add a portfolio traversal with explicit own-move policy and a
frontier report. A safety limit reached while a continuation is still common
must produce “more checking needed”, not global completion. Separate prepared
answers, intentional stopping points, unknown samples and depth-limited frontier
mass. Bound remote scans in resumable batches and keep the current route view
available as a diagnostic. Treat alternative own first moves as separate
preparation policies unless the player explicitly supplies a mixture; do not
assign both 100% probability and add their coverage. For Black, opponent first
moves belong to the opponent population and need their own sampled branches.
Validate both colours, multiple first moves, transpositions and an unsaved reply
just beyond the move cap. This is a proposed follow-up, not a
change to the existing scoped estimate in this review.

For gap selection, a defensible independent policy is:

1. Exclude deliberate omissions, resolved tasks, active postponements and archived work.
2. Prefer missing answers seen in real games or associated with observed difficulty.
3. Then consider reliable path exposure under the saved own-move policy.
4. Keep missing preparation separate from due memory practice and untested content.
5. Explain the chosen action and show source, sample scope and uncertainty.

This describes our policy, not Chessbook's recovered scoring formula. Our shared
ranking now follows this general structure; independent human relevance remains
unmeasured.

### Teach, then recall

Observed sequence:

`Unseen move → demonstration + purpose → learner executes → next demonstration → hidden-answer recall`

Recall then supports help and correction, followed by another opportunity later.
[Chessbook's soft-fail documentation](https://wiki.chessbook.com/soft-fails)
separates remembering a saved response from playing a sound chess alternative.
It describes a different no-penalty rule at repertoire endpoints, and says later
same-session retries do not create another spaced-repetition review.

Our source has assisted guided lessons, answer/piece/idea help, saved assistance,
lapse repeats and separate full-line versus move recall. Its automatic memory
queue does not automatically precede every unseen move with a demonstration.
Therefore “we have hints” does not establish this whole-flow equivalence.

Independent implementation contract:

- Offer an explicit first-exposure stage for new moves, reusing existing guided
  content. Keep it visibly separate from recall; respect the user's preference
  for explanations to stay hidden during recall.
- Persist the exposure stage and assistance before accepting the next action.
- Require the learner to execute the demonstrated move. Demonstration is not an
  independent correct answer or evidence of memory mastery.
- Follow with a hidden-answer test after intervening positions where possible.
- Preserve the first scheduled encounter's outcome when retrying; do not inflate
  recall through immediate corrections or repeated events.
- Grade repertoire recall immediately. Optional engine evidence may explain a
  sound alternative separately; unavailable analysis must remain unknown.
- Treat endpoint leniency as an explicit policy with tests, not an accidental
  side effect of an engine result.

This integrated stage is a proposed follow-up, not delivered by this review.

### Model-game understanding

Observed sequence:

`Saved route → matching complete game → replay or guess → hint/explanation → another game/history`

Our game-review board can replay imported games, but that is not equivalent to a
model-game study feature which selects relevant games and explains why they match.

Independent implementation contract:

- Start with user-imported or appropriately licensed/public-source game PGNs.
- Match the repertoire side and canonical opening positions; retain the actual
  move path and match ply. Do not require a literal move-order match when a valid
  transposition exists.
- Rank transparent candidates using matched route/depth and instructional context;
  show source, players, result and the position where the match starts/ends.
- Reuse a single board for replay and optional guessing, with easy previous/next,
  hint and resume. Keep this separate from scheduled repertoire memory tests.
- Source explanations from supplied annotations or clearly labelled generated
  analysis. Never invent a plan or attach a copied proprietary annotation.
- Record study completion separately from unaided recall and repertoire coverage.

This is the highest-value substantial missing feature after core reliability and
learning-flow clarity. Import/replay infrastructure can be reused; selection,
study state, explanation provenance and a dedicated workflow still need building.

## Algorithms: what is recoverable and what remains unknown

| Area | Publicly supported behaviour | Independent reconstruction | Unknown / validation needed |
|---|---|---|---|
| Completion | [Documentation](https://wiki.chessbook.com/completion) describes an encounter threshold and probabilities following saved own choices and opponent replies. | Maintain position graph and explicit own policy. Multiply conditional opponent probabilities along a route; merge transpositions without double-counting. Preserve unknown probability mass and chosen stopping points. Compare unrounded reach with `1/N`. | Exact competitor pruning, cycle handling, unseen-move probability and production calibration. Our mathematical fixtures validate our model, not identical competitor output. |
| Recommended practice | [Documentation](https://wiki.chessbook.com/recommended-moves) describes a bounded due batch using the daily goal, common positions and session coherence. | Select due/game-miss candidates under daily remaining capacity; group related route segments; cap new content; track interleaving and switches per session. | Hidden weights, tie breaks and large-backlog runtime. Our current practice mixes game misses, due/new/early work and needs a measured coherence comparison. |
| Evaluations | [Documentation](https://wiki.chessbook.com/evaluations) describes consistent precomputed engine work. | Use a declared engine and bounded work budget, compatible persistent cache, shared requests and cancellation of abandoned queued work. Keep White-perspective scores consistent. | Competitor database contents and actual latency. Our local implementation uses its own engine and 200,000 nodes per opening search by default; it is not the same strength budget. |
| Effectiveness | [Stats documentation](https://wiki.chessbook.com/repertoire-statistics) describes rating-level game results weighted by route exposure. | Expose weighted sampled game results, separate denominators, sample age and missing mass; validate against held-out games before forecasting. | Internal normalization, bias correction and actual predictive accuracy. A frequency or win-rate average is not a validated user win forecast. |
| Soundness | Stats documentation describes whole-path engine concessions and extra emphasis on critical paths. | Measure own-move concession along paths in centipawns; report supported worst/high-exposure weaknesses with search provenance. | Exact risk aggregation and scaling. Endpoint examples in documentation do not establish the complete score function. |
| Learnability | Stats documentation says its move predictions use a model trained on user practice results and several context features. | Begin with observed personal recall, response time, depth and conflicting responses in similar positions. Label complexity indicators as heuristics. | Model architecture, weights, training set and calibration. Do not manufacture a comparable AI difficulty score from a few hand-picked factors. |
| Autofill | UI exposes three competing preferences and later removal. | Generate a bounded proposal from our graph, frequency and engine evidence. Show provenance/limits; apply an atomic, version-checked batch with precise undo ownership. | Actual search/optimization algorithm, resulting line quality and real undo behaviour were not observed. |

## Quality comparison and acceptance gates

Use the existing [57-feature catalogue](./AUDIT.md) for inventory and regression
coverage. Use the following gates for quality. Record `unknown` until an actual
run exists; feature presence never supplies a timed or human score.

| Gate | Repeatable task | Current position | Target / next measurement |
|---|---|---|---|
| Q1: Clarity | From an opening, identify saved answer, missing answer and insufficient evidence; choose the next task. | Our three initial tasks, reasons and separate data scopes are implemented. Recent user confusion is evidence against assuming clarity. | Player succeeds without help in 4/5 representative tasks within 30 seconds each. Both products: unknown. |
| Q2: First learning | Teach three unseen moves, exit/resume, then test them with answers hidden. | Chessbook demonstration→recall was observed. Our opt-in learn-first sequence persists teaching and then exact hidden recall, including alternatives. Standard practice defaults stay unchanged. | No taught/assisted move receives unaided credit; stage survives reload; final recall hides answer and analysis. Timings and user errors: unknown. |
| Q3: Useful recommendation | Use 20 fixed evidence scenarios plus a large due backlog; record first-choice agreement and route switches. | Our 20 automated ranking cases pass; no independent human agreement or matched competitor backlog run. | At least 18/20 reviewer-approved choices; report median context switches and completion, not only numeric rank. |
| Q4: Coverage correctness | Same graph, colours, transpositions, thresholds and population filters; include stale/missing samples. | Our scoped path, threshold, source separation and uncertainty fixtures pass. Whole-repertoire saved-policy traversal is implemented with explicit unchecked frontiers, per-request work caps and consistent batch continuation. Competitor settings were inspected but not changed for a controlled recalculation. | Unknown or a still-common depth-limited frontier never counts as global completion; rare relevant gap appears at the exact threshold; no duplicate position credit. Matched competitor result: unknown. |
| Q5: Board usability | Build a short White and Black branch on phone and desktop; inspect overlapping suggestions and return after unsaved exploration. | Our numbered arrows and existing browser journeys pass locally. Fresh Chessbook review used desktop-size in-app browser only. | Complete without lost moves, duplicate boards or missed taps; keyboard controls usable. Human timing/colour-vision result: unknown. |
| Q6: Evidence speed | Use the same nine legal positions and requested candidate sets, distinguishing first/uncached/warm work. | Our benchmark harness works with a fixture engine. No real deployed baseline or matched Chessbook timings. | Warm cached analysis p95 below 500 ms proposed; report population fetch separately and retain partial/unavailable states. Cold target set after baseline. |
| Q7: Recovery and release | Interrupt save/selection, reload, retry; build and smoke-test actual container. | Local full checks passed before this review, and coverage publication `e1da6af` succeeded after the earlier `52e7842` WebKit failure. Learn-first `3270021` also published. The later `71f1247` review release failed on a WebKit board-layout shift; its correction needs hosted verification. Earlier failure evidence is retained. | No publication claimed before workflow success; recovery preserves saved content; deterministic fixtures across retries; no disabled checks. |
| Q8: Study transfer | Play a relevant model game and explain the opening's resulting plan; test unaided recall after 7/14 days. | Chessbook model-game replay and matching explanation observed. Our dedicated model-game workflow is missing; outcome metrics exist but benefit is unmeasured. | Matched source and context are visible; study never inflates recall; delayed cohort counts and outcomes reported separately. |
| Q9: Generated content | Preview, apply, retry and undo a proposed gap-fill batch while manually editing another branch. | Competitor preference form observed; execution unknown. Our feature absent. | No silent overwrite, duplicated imports or cross-profile deletion; abort restores exact prior graph; subjective move/plan quality reviewed separately. |

For timed comparison, use a fresh synthetic repertoire in each product with the
same side, starting moves and intended task. Record rating/time-control/goal and
available data. One warm-up and five attempts per task; record task success,
actions, median and worst duration, help needed, errors and recovery. Do not time
an animation snapshot as if it were a completed user task. If access or data
cannot be matched, record that comparison as unavailable.

## Delivery priorities

1. **Reliability and one clear next action.** Resolve the publication-test blocker;
   keep a single active decision with optional evidence/details. Correct stale
   catalogue entries. Preserve saved content, assistance and reload recovery.
2. **Make encounter coverage work across the repertoire.** Keep current scoped
   diagnostics, but add resumable portfolio traversal and an honest depth frontier
   before displaying a whole-repertoire completion claim.
3. **Integrate first exposure with recall, explicitly.** Reuse guided content and
   existing assistance tracking. Separate teaching, scheduled answers and later
   retries. Validate with the three-move scenario before changing default pacing.
4. **Add contextual model-game study.** Reuse imported-game replay and repertoire
   matching, then add transparent selection, source context, guessing and resume.
5. **Explain sound alternatives.** Use optional bounded engine evidence alongside
   recall feedback; keep terminal leniency and uncertainty explicit.
6. **Add master-game evidence and transparent repertoire diagnostics.** Prioritize
   actionable weaknesses and supported practical results over decorative scores.
7. **Introduce safe assisted gap-fill.** Begin with a short reviewed proposal;
   versioned atomic application and undo precede large-scale generation or styles.
8. **Polish and integrations.** Session coherence, device measurements, board
   preferences, additional game providers and optional cross-device sync follow
   the core loop. Native apps, billing and an imitation of private AI scoring are
   not prerequisites for a high-quality personal trainer.

## Changes made in this review

- Corrected CB17: time-control support was implemented in the prior change but
  still labelled absent in the catalogue. Added a test which proves blitz and
  rapid samples remain distinct through fetching and cache reuse. Unmeasured
  same-board/late-response UI criteria remain unknown.
- Investigated the failed GitHub publication using its saved trace and snapshots.
  The first failure had no selection PATCH in the captured traffic after the
  pointer click; the retry reused the imported repertoire and produced two full
  runs where the test expected one. This does not prove a broken storage service.
- Isolated that test's repertoire per retry and explicitly exercised keyboard
  activation plus the rejected request/rollback path. Pointer and bulk controls
  remain exercised in the journey and other browser tests. A deterministic local
  run does not by itself establish hosted Linux WebKit reliability. The original
  missing pointer-event observation remains an open hosted/touch verification
  item; a successful keyboard activation does not prove that observation fixed.
- Corrected evidence freshness: the source fingerprint previously omitted browser
  test files, dependency locks and validation/release configuration. These inputs
  now invalidate the previous verification; generated reports remain excluded.
  Added a regression check so changed tests cannot silently retain current credit.
- Kept the existing app behaviour intact while recording the larger learning,
  model-game and generation work as concrete specifications rather than claiming
  those features are built.

This review is complete as an evidence-based behavioural assessment. Matching
all Chessbook functionality and proving comparable human outcomes remain future
implementation and measurement work; there is no defensible overall parity score.

## Final verification for this review

The final unchanged-source run passed 263 unit/integration tests, 130 browser
journeys, six tracker tests, typechecking and the production build. Browser
results had no skips, retries marked flaky, or failures. The focused selection
recovery journey also passed three repetitions in each browser with distinct
fixtures. This is local evidence; hosted publication of these changes has not run.

The refreshed inventory records 84 passed requirements, zero failed, 42 unknown
and 42 unmet (three billing requirements excluded). These are acceptance checks,
not a quality/parity percentage. The nine human/task-quality gates above retain
their stated unknown or incomplete measurements. Changes are local and uncommitted.

## Implementation follow-up: whole-repertoire encounter coverage

The first larger feature increment now has a separate Whole repertoire view,
saved-line policies, combined transposition reach, explicit incomplete frontiers
and bounded sample continuation. See [delivery behaviour and limits](./WHOLE_REPERTOIRE.md).
The preceding verification counts describe the review checkpoint; the generated
tracker records the newer implementation run. Human comparison gates remain
unmeasured. In particular, there is no overall Chessbook quality/parity claim.

The next implementation increment adds [opt-in first exposure](./FIRST_EXPOSURE.md):
persisted demonstrations, required move execution and then hidden-answer recall.
This closes the automatic sequence gap for that explicit new-moves option;
ordinary practice defaults and the existing retry scheduler remain unchanged.
Q2 now has automated stage/reload/scoring evidence for our three-move scenario;
human timings, comprehension and durable learning outcomes remain unmeasured.

The [review of both increments](./RECENT_FEATURE_REVIEW.md) adds fresh observations,
per-response teaching and preserved first-review scheduling on later retries.
These corrections supersede the earlier implementation limitations above.
