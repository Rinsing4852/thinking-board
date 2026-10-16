# Opening quality: assessment and next improvement plan

Assessment: 15 October 2026. Application reviewed: `039898fe93527767cfb67f93e7396c229437c9db`.

## Overall judgement

The first three improvement areas now have working foundations. Move guidance
is the most complete implementation; recommendations need the most work on
which task to choose and why. Coverage has useful safeguards but still lacks a
simple definition of enough preparation.

Feature presence and passing regression checks do not establish Chessbook
parity. We have not measured the two products on the same timed tasks, tested
this latest wording with the player, or demonstrated improved long-term recall.
Do not express the existing tracker percentage as a product-quality or parity
score.

## Comparison baseline

Chessbook's official documentation was retrieved successfully on 15 October
2026. These are documented behaviours, not independently measured competitor
performance:

- [Completion](https://wiki.chessbook.com/completion): its completion goal covers
  positions expected to occur at least once within a chosen number of games;
  probabilities follow the player's saved choices and opponent frequencies.
- [Recommended moves](https://wiki.chessbook.com/recommended-moves): practice
  selects a smaller due batch using the daily goal, favouring common positions
  while trying to preserve coherent sessions.
- [Engine evaluations](https://wiki.chessbook.com/evaluations): most opening
  positions use precomputed Stockfish results with a consistent search budget.

The green/blue arrow convention is our own requirement. The relevant Chessbook
benchmark is useful, understandable building and evaluation, not a claim that
Chessbook offers this exact arrow design.

## 1. Coverage — useful foundation, incomplete preparation guidance

### Completed

- Personal game observations and Lichess populations retain separate counts.
- Up to 100 recent imported games per player/side contribute local evidence.
  Repeated visits to a position count once per game.
- A personally encountered missing response remains actionable without Lichess.
- The path model follows a selected own-move policy rather than pooling all
  response counts into a whole-line probability. Unknown evidence stays unknown.
- Memory practice is distinguished from saving an opening answer.
- The latest UI starts with three tasks, explains their types and hides detailed
  estimates. This addresses the confusing move-10/558-improvements presentation.

### Remaining gaps

- Depth is the main target. There is no user-facing encounter-frequency goal
  comparable to Chessbook's completion criterion.
- Personal coverage counts observations at saved positions across saved
  branches within the move limit. The path estimate follows the selected route.
  Their populations and scopes differ, so their percentages should never be
  presented as interchangeable measures of completeness.
- The historical 100-game sample is useful evidence, not a validated prediction
  of the player's next games. There is no held-out calibration measurement.
- Lichess speeds are currently pooled across blitz, rapid and classical. A
  player cannot yet tailor this independently to their main time control.
- Changing wording is progress, but the recent user confusion is direct
  evidence that clarity has not yet been demonstrated in use.

Relevant code: `opening-coverage-service.ts`, `opening-coverage-model.ts`,
`opening-explorer-service.ts`, `OpeningCoveragePanel.tsx`.

## 2. Board arrows and evaluations — strongest implementation, polish still needed

### Completed

- On the player's turn, the leading legal engine move receives a green arrow.
- On the opponent's turn, up to three supported replies receive blue arrows,
  ordered by game frequency. Repertoire colour determines the roles.
- Stale, undersized, mismatched and illegal evidence cannot produce frequency
  arrows. Missing third replies are not invented.
- One board and one move panel replace repeated guidance and a simultaneous
  second analysis board. Unsaved exploration is an optional mode.
- Position and candidate evaluations are visible with a consistent White
  perspective. Popular replies outside the engine's top three are evaluated
  explicitly. Guidance is not passed into recall boards.

### Remaining gaps

- Same-colour arrows can overlap, e.g. e7–e5 and e7–e6. There is no numbered
  correspondence between arrow and move row or non-colour rank indication.
- Arrow eligibility and list presentation are separate: the list may still
  display a stale frequency with a footer warning while no arrow is drawn.
  Confidence should be explicit beside the affected move.
- A shared request hook reduces duplicate client requests, but engine work is
  serialized. Aborting a browser request does not remove already queued server
  analysis. Cold evaluations of several choices may delay the current position.
- Analysis is depth-based, uses the configured local engine, and has an in-memory
  bounded cache. Engine identity, consistent work budget, persistent caching,
  and response-time benchmarks are not established to the competitor standard.

Relevant code: `opening-build-guidance.ts`, `use-opening-move-evidence.ts`,
`opening-analysis-service.ts`, `OpeningMoveSuggestions.tsx`, `ChessBoard.tsx`.

## 3. Recommendations — working actions, decision quality needs improvement

### Completed

- Home offers practice and preparation actions with empty, paused and completed
  goal states. Personal-game preparation works with Lichess off.
- Recommended practice prioritizes game misses, then due work, bounded new
  material and optional early reviews. Daily goal remaining limits the batch.
- Preparation can come from a different repertoire than memory practice.
- Opening a saved reply does not create a duplicate; missing replies open the
  relevant board. The coverage page now explains what each task actually means.

### Remaining gaps

- Home preparation selection and coverage-card ranking use different weighted
  rules. Renaming hundreds of 'improvements' has not calibrated those rules.
- An untested saved response receives a recall-urgency contribution even though
  there is no demonstrated forgetting. In some evidence combinations it can
  outrank a missing reply seen in a real game.
- Preparation selection examines at most 12 repertoires; a useful candidate
  outside that initial set can be missed. This is a declared implementation
  bound, not a complete search of every repertoire.
- Recommendations lack a consistent, short reason, source-game links and an
  end-to-end resolution history. Postponement and deliberate skipping need clear
  behaviour so the same suggestion does not keep returning without context.
- No independent relevance benchmark, measured session coherence or delayed
  learning outcome is available. A playable suggestion is not proof it is the
  best next thing to study.

Relevant code: `opening-coverage-service.ts`, `opening-preparation-policy.ts`,
`opening-review-service.ts`, `OpeningHomeCockpit.tsx`, `OpeningCoveragePanel.tsx`.

## Delivery order and acceptance tracker

All items below are PLANNED. Targets are proposed acceptance criteria, not
measurements already achieved.

| Order | Improvement | Concrete delivery | Acceptance gate |
|---|---|---|---|
| 1 | Trustworthy next action | Shared typed preparation tasks and one preparation ranking policy for home and coverage. Separate preparation from scheduled memory practice. Explain each top choice in one sentence with its evidence. | No untested response is labelled a demonstrated mistake. Identical preparation evidence gives the same priority in both views. A reviewer agrees with the first action in at least 18 of 20 pre-agreed scenarios. |
| 2 | Evidence and resolution | Link recommendations to source games/positions; record prepare, practise, postpone and intentional omission separately. Deduplicate genuinely shared tasks by their action target. | Adding an answer resolves its missing-response task after refresh/reload. Practising it updates memory without claiming added opening coverage. Archived, resolved or postponed tasks stay out of inappropriate automatic queues. |
| 3 | A meaningful coverage goal | Offer an adjustable 'prepare positions likely at least once in N games' goal, with the depth limit as a separate safety cap. Label personal-game scope, selected route and Lichess population explicitly. | Known-probability fixtures classify relevant gaps correctly. Unknown samples never satisfy a goal or imply rarity. The same board position is not counted twice through transpositions. A missing response remains actionable with Lichess off. |
| 4 | Confident, accessible board guidance | Match numbered move rows to numbered arrows; emphasize a row's arrow on focus/selection. Put sample age/confidence beside frequencies. Keep guidance on one board and out of recall. | White and Black, overlapping arrows, keyboard/touch and a colour-vision check pass. Stale/small evidence is labelled consistently in the list and arrows. No repeated move list or practice spoilers. |
| 5 | Faster, reproducible evaluation | Measure cold/warm performance on the actual server first. Coalesce matching requests, deprioritize abandoned queued work, pin engine/version/search budget and persist compatible results. | Proposed target: 95% of warm cached evidence requests under 500 ms on the deployment device. Establish the cold-score target after baseline measurement. Playing a move never waits for optional analysis. Score signs and mate units remain correct. |
| 6 | Prove the benefit | Run matched user tasks against Chessbook where accessible; then monitor delayed recall and repeat game misses. | Publish observed task completion, time, errors and results separately for each product. Measure 7-/14-day unaided recall and misses per relevant encounter; do not infer learning improvement from test-suite success. |

Address the 12-repertoire selection bound during orders 1–2: select candidate
positions using lightweight evidence across all eligible repertoires before
loading expensive coverage detail. Add a fixture where the most relevant task
belongs to repertoire 13. Preserve offline behaviour and keep refresh work
bounded; do not simply perform unlimited synchronous remote scans.

Time-control selection belongs to order 3. Keep personal-game and population
filters explicitly labelled rather than blending their denominators.

## Measurement protocol

Use 20 fixed scenarios, agreed before tuning the ranking. Include a first-use
player; White and Black; a missing reply seen once and repeatedly; a due response;
an untested saved response; an idea-only reply; stale/small/missing Lichess data;
conflicting personal/population frequencies; a transposition; a preparation
boundary; archived/paused work; a thirteenth repertoire; and rapid position/rating
changes. Preserve the scenario inputs so later changes can be compared fairly.

For user clarity, ask the player to distinguish 'already saved', 'needs a new
answer' and 'not enough evidence', then choose the next action without help.
Proposed gate: at least 4 of 5 representative task attempts correct within 30
seconds, repeated after wording changes. This is an initial acceptance check,
not a statistically strong usability study.

Measure cache hits and uncached engine work separately, using medians and 95th
percentiles on the deployed hardware. Measure game-task matching and analysis
network time separately from actual thinking time.

For a competitor comparison use the same legal positions, repertoire side,
rating context, data availability and tasks. Record unavailable competitor
workflows as unavailable. Do not invent Chessbook runtime or learning scores.

## Evidence status for this assessment

- Code reviewed at the stated commit; no application implementation changed for
  this planning request.
- 24 focused unit/integration checks across personal coverage, coverage paths,
  turn-aware arrows, move evaluation and score formatting passed during this
  assessment.
- The latest published release had successful GitHub verification. Earlier
  desktop/mobile journeys cover offline game recommendations, arrow hiding,
  single-board exploration, source separation, coverage actions and large task
  lists.
- The older generated feature report predates the latest UI changes. Its
  verification snapshot must be refreshed before it is used as a current
  numerical scorecard. It is not a measured Chessbook-quality percentage.
- Competitor latency, recommendation relevance, current UI comprehension and
  delayed learning gains remain unmeasured.

## Implementation update — 15 October 2026

The assessment above records the starting point. The following changes implement
its delivery plan in the local working tree; they are not yet a published release.

| Item | Delivered | Evidence or remaining measurement |
|---|---|---|
| 1. Next action | Shared preparation ranking across home, coverage and next-gap navigation; evidence reasons; stable deduplicated task IDs. Untested saved answers are not called failed recall. | Twenty fixed automated ranking cases. Human agreement with 18/20 scenarios remains unmeasured. |
| 2. Resolution | Source-game links; save-answer resolution; postpone seven days, skip and restore; choices isolated by player; automatic practice respects suppressed tasks. All eligible repertoires considered. | Lifecycle, expiry, player isolation, saved-content preservation and repertoire-13 fixtures. Source links open the game; the displayed move number provides position context. Full chronological action history is not implemented. |
| 3. Coverage goal | Adjustable encounter goal and Lichess time control; scopes and sample uncertainty explained separately from depth and personal observations. | Exact threshold tests at 100/200/500 games; unknown data cannot confirm completion. Model probability tests retain transposition protection. Personal game evidence still uses up to 100 recent games and is not a calibrated forecast. |
| 4. Board guidance | Numbered move rows and board destinations; focus/hover isolates the matching arrow; old/small sample warnings beside affected frequencies. | Desktop and phone-sized WebKit builder journeys check numbering, focus and hide/restore. Existing side, legality and sample checks retained. Independent colour-vision and human comprehension studies remain outstanding. |
| 5. Evaluation | Matching requests share work; abandoned queued requests are skipped; bounded node search; engine/settings-aware persistent cache; server benchmark command. | Coordination, legal-request and restart/budget-invalidation fixtures. Actual deployed-device latency is not measured. No cold latency claim. |
| 6. Outcomes | Metrics endpoint and benchmark report include unrehearsed scheduled recall at 7–<14 and 14+ days, with counts and null for no data. Game departures reported separately. | Cohort/assistance fixtures. These observations are not evidence of causal improvement. Matched Chessbook tasks and long-term user outcomes remain unmeasured. |

Portfolio selection now scans eligible repertoires locally and fetches remote
samples only for the selected repertoire. This removes the previous 12-item
cutoff and avoids repeated game matching during candidate comparison. It still
constructs local coverage per repertoire; a lightweight SQL candidate index is
not implemented. Large-library response time needs measurement before choosing
that optimization.

The independent feature tracker includes the new encounter-goal acceptance
checks. Its generated report records the final verification run. Passing checks
measure implemented requirements, not a percentage of Chessbook product quality.

### Repeatable deployment measurement

After deploying, run `npm run benchmark:openings -- https://YOUR-TRAINER report.json`
from a machine that can reach the trainer. This makes bounded analysis requests
and reads quality metrics; it does not change saved lines. Report the target
hardware, engine identity, node budget, sample count, median and p95. The first
requests have unknown cache state; they must not be described as cold. Warm p95
below 500 ms is a proposed gate, not a result already observed on the deployment.

For the next usability check, ask the player to identify an already-saved answer,
a missing answer and uncertain evidence, then use a recommendation and restore
a postponed task. Record correctness and elapsed time without hints. Retain the
4/5 within 30-second target as an unmeasured acceptance gate until this is done.

### Final local verification

The final complete verification passed: 262 unit/integration tests, 130 browser
journeys (desktop Chromium and phone-sized WebKit), five tracker tests,
typechecking and production build. No skipped or flaky browser results. The
source fingerprint stayed unchanged during that run. The refreshed catalog has
83 passed requirements, zero failed, 40 unknown and 45 unmet across the entire
feature inventory; this is not an overall Chessbook-quality score.

Desktop and phone screenshots were inspected for numbered opponent arrows and
move-row correspondence. The benchmark command also completed against a
disposable fixture server using `FakeStockfish 1.0`, with nine initial requests
and 40 warm requests. This only validates the measurement harness: fixture timing
is not a deployment performance result. No real user database was used for it.

The user authorized commit and push on 16 October 2026. Publication status is
tracked by the repository workflow. Deployment speed, a human clarity check,
independent recommendation relevance and delayed learning improvement remain
outstanding measurements.
