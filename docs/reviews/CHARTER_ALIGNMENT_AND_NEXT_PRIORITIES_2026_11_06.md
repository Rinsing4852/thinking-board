# Charter alignment and next priorities — 6 November 2026

## Recommendation

**Consolidate the learning loop before adding more training modes or services.** The application has enough functionality to support the intended routine. Its main remaining weakness is turning trustworthy observations into a lasting, measurable training plan.

Recommended order:

1. Close inconsistencies in tactical evidence, selection and progress reporting.
2. Make the existing learning focus a small, persistent training plan.
3. Establish delayed retention and unfamiliar-position assessment, then evaluate transfer into games.

Keep opening practice, game review and the five thinking exercises. Improve how they cooperate rather than introduce another dashboard. AI, Maia and bulk puzzle imports do not currently solve the most important gaps.

This is a source review of commit `3766874`, governed by [the charter](../PROJECT_CHARTER.md). **Only this review document is added.** Proposed work below requires subsequent implementation approval. No application, schema, dependency or deployment change is authorised by this document.

## Evidence and limits

Inspected the current analysis/generation paths, tactical evidence, learning-focus and transfer services, daily plan, scheduling, game-quality reporting, opening metrics, contracts and relevant UI; reconciled recent implementation reviews with the earlier integration assessment. References below are relative to this document.

The current [engineering report](../learning-quality/QUALITY.md) records passing behaviour gates and explicitly leaves physical Safari, learner comprehension and learning outcomes unmeasured. The recent release pass records 473 unit tests, 240 browser tests and 25 real-Stockfish cases. Those suites were not rerun for this documentation-only review. These results support reliability of tested behaviour, not instructional effectiveness or comprehensive tactical detection. The owner's installed Unraid version and personal database were not inspected.

This is not a fresh competitor audit or a verification of current external model specifications/licences. Earlier external-integration research remains supporting evidence, not implementation approval.

## 1. What exists and how it serves the charter

“Implemented” below means source behaviour exists; it does not mean its learning benefit has been demonstrated.

| Area | Implemented capability | Charter alignment and remaining boundary |
|---|---|---|
| Games from different places | PGN import, Lichess integration, explicit monthly Chess.com import, profile aliases, source identity/deduplication, library source filters | Strong foundation for LR12. Chess.com import is requested by month, not continuous full-history sync. Import and analysis remain separate. |
| Analysis and accuracy | Local Stockfish, persisted analysis jobs/runs, requested individual/selected/all-game analysis, own-move grades, accuracy and error trends | Supports LR05/07/09/11. Finite search and grading choices remain estimates; app accuracy is not an interchangeable platform score. |
| Game review | Focused board replay, marked engine/opening decisions, saved feedback revisions, local recall, review status and cross-game error practice | Supports LR07/10. Reviewing, recalling and scheduling are distinct. Today practice now updates its exact source engine decision without duplicate recall credit. |
| Thinking exercises | What changed, candidates, blunder checking, punishment and quiet planning; legal saved feedback and repeated-opportunity grouping | Supports SEE → CANDIDATES → CHECK. Coverage differs by generator; five modes do not establish complete detection or diagnosis. |
| Tactics and mates | Attack/defence evidence, captures, some forks, verified bounded mate answers; selectable mate limit 1–4, default 2 | Partial LR04–06. No comprehensive pin/skewer/discovered-attack classifier. Mate tasks find a first move and offer continuation study; they do not establish execution of the complete mating sequence. |
| Learning focus and coaching | One supported pattern, distinct-game recurrence, recency/severity ranking, provisional evidence, warning/checking habit, source-board link, up to three due positions from different games | Meaningful LR01/02/13 implementation. Primarily verified blunder-check items. Structured explanations exist; no AI service. The focus is recomputed rather than a durable curriculum. |
| Daily routine and scheduling | Saved opening→thinking routine, resumable sessions; opening FSRS and separate level-based game-exercise schedule | Supports LR10/11. Do not describe all scheduling as FSRS. Fixed game-review intervals are not calibrated evidence of mastery. Daily orchestration normally puts due openings first. |
| Progress and follow-up | General recent/previous game-quality windows; current-focus study/later-game comparison; opening delayed recall | Partial LR08/09. Current-focus comparison is descriptive and bounded. There is no durable history of every studied focus, general tactical unseen assessment or equivalent game-exercise exposure-aware retention report. |
| Openings | Multiple first moves/replies, nested branch navigation, repertoire practice, separate own-game and Lichess frequency evidence, engine suggestions, coverage and stronger-player model-game study | Supports LR07 and the owner's broader goals. Valuable supporting features; further parity work ranks below recurring mistake reduction. Preferred main-continuation editing is not supplied by the new branch tree. |
| Reliability/self-hosting | React/TypeScript, Fastify, SQLite, chess.js/Chessground, local Stockfish, backups, tested migrations, Vitest/Playwright and release checks | Supports LR10/11. No mandatory AI/cloud subscription or Python model service. Browser emulation does not establish physical iPhone/VoiceOver usability. |

### Relevant implementation boundaries

- Imports: [PGN](../../apps/server/src/imports/import-service.ts), [Lichess](../../apps/server/src/imports/lichess-sync-service.ts), [Chess.com](../../apps/server/src/imports/chesscom-import-service.ts).
- Engine and exercise creation: [analysis](../../apps/server/src/analysis/analysis-service.ts), [tactical proof](../../apps/server/src/analysis/tactical-punishment.ts), [candidate generator](../../apps/server/src/analysis/candidate-generator.ts), [V1 generator](../../apps/server/src/analysis/v1-generator.ts), [what changed](../../apps/server/src/analysis/what-changed-generator.ts).
- Source-game feedback: [replay service](../../apps/server/src/games/game-replay-service.ts), [tactical evidence/mate verification](../../apps/server/src/games/game-tactical-evidence.ts), [attempt provenance](../../apps/server/src/games/training-review-link.ts), [board UI](../../apps/web/src/components/GameReplay.tsx).
- Selection versus scheduling: [focus](../../apps/server/src/training/learning-focus-service.ts), [daily orchestration](../../apps/server/src/training/daily-practice-service.ts), [general selector](../../apps/server/src/training/v1-training-service.ts), [game scheduler](../../apps/server/src/training/review-scheduler.ts), [opening FSRS](../../apps/server/src/openings/opening-review-scheduler.ts).
- Measurement: [game-quality reporting](../../apps/server/src/analysis/game-quality-service.ts), [focus transfer](../../apps/server/src/training/focus-transfer.ts), [opening recall metrics](../../apps/server/src/openings/opening-quality-metrics.ts).
- Openings: [branch tree](../../apps/web/src/opening-branch-tree.ts), [workspace](../../apps/server/src/openings/opening-workspace-service.ts), [coverage](../../apps/server/src/openings/opening-coverage-service.ts), [model games](../../apps/server/src/openings/opening-study-discovery.ts).

## 2. Important gaps and inconsistencies

### A. Missed forks can fall between review and training

`AnalysisService.acceptablePunishments(..., opportunity=true)` excludes a non-capturing first move unless its proof is forced mate. A winning fork often begins with a non-capture. The replay evidence path can recognise a non-capturing fork with a material continuation, while the focus requires generated active blunder-check items. Consequently, recognising a fork in review does not guarantee it enters the focus queue. This is a source-path finding, not a reproduction against an identified personal game.

There are also different motif rules: replay requires a follow-up capture of a forked target, whereas V1 enrichment counts attacked valuable targets; its missed-opportunity override then labels non-mate opportunities as missed captures. Broader missed opportunities must not simply inherit that capture label. Generation also gates on significant mistakes; practical-mate handling in replay is broader than that gate. Audit those differences explicitly rather than assume the same filters imply the same coverage.

**Implication:** improve shared eligibility and evidence before adding new tactical themes. A two-target attack is not automatically a winning fork; material proof, legal defence and counterplay still matter. Bounded proof failure must remain unknown/ineligible, not a fabricated negative or positive.

### B. Observed mistakes still coexist with presumed thinking causes

V1 diagnosis creation automatically stores `process.calculation_failure` with confidence 0.4. Other generation paths assign pattern-failure/missed-forcing-move process tags. A numerical confidence does not establish what the learner noticed or calculated. Legacy concept summaries and general selection consume these tags, even though the newer focus uses more concrete evidence.

**Implication:** distinguish objective event, exercise skill, learner-reported explanation and unknown cause (LR03). Preserve historical records and their provenance; do not silently rewrite them as facts. A label such as “calculation failure” should not be treated as a proven personal weakness solely because it was automatically generated.

### C. There is a recommendation, but not yet a lasting learning plan

Focus selection is recalculated from up to 100 recent eligible analysed games and up to 2,000 active items. Follow-up anchors to matching current-content attempts/runs within that window. Changed filters, reanalysis, content or focus can remove the comparison. It is not a stored history of goals and outcomes.

The fallback selector still uses fixed mode allocations and concept-frequency/attempt/latency ranking. It does not establish one coherent personal curriculum. Slow input is also not evidence of poor chess thinking.

**Implication:** preserve one focus long enough to teach, revisit and evaluate it, while allowing an explicit change. Reuse the saved daily plan and queues. Do not promise a complete personalised course from a single provisional example.

### D. Successful practice is not yet trustworthy evidence of transfer

Opening metrics already account for intervening recorded review encounters when reporting delayed recall. Game-exercise reporting has no equivalent comprehensive exposure accounting across review, teaching lines, hints and practice. There is no held-out tactical/neutral position assessment.

Current-focus follow-up correctly separates platform and colour. General `GameQualityService.trends`, however, selects by engine/grading cohort and time control without an equivalent playing-platform split. Mixing Chess.com and Lichess can change the population being compared. Ratings shown in focus follow-up are context, not adjustment. Analysis selection can also bias a sample.

**Implication:** strengthen measurement provenance before adding an “improving” score. Keep repetition, first unaided unfamiliar recognition, and real-game errors as separate outcomes.

### E. The normal session needs an owner usability check

The latest interface has clearer routes and connected source decisions, but the actual owner has repeatedly reported clutter and confusing meanings. Automated passing journeys do not establish comprehension. Opening-first daily ordering is worth testing against today's priority of mistake reduction; do not automatically demote wanted opening practice without observing its effect.

**Implication:** check the installed build and run one short physical-Safari session. Identify the smallest changes necessary to answer “what should I do next?” before redesigning navigation again.

## 3. Ranked next work: purpose checks and acceptance

### 1 — Consistent evidence and trustworthy records: proceed first, after approval

- **Need / requirements:** a missed fork should reach useful practice, and progress should compare appropriate games (LR03–07/09/12).
- **Existing / simplest option:** share conservative eligibility/motif rules across current generation, replay and focus; label causes honestly; extend existing trend grouping. No new exercise mode or engine.
- **Expected benefit:** fewer missed teachable decisions and misleading explanations/comparisons. Learning benefit remains to be measured.
- **Acceptance evidence:** a non-capturing winning fork in both colours reaches source review and focus when significant and eligible; apparent forks with adequate defences stay out; captures, missed defences and short mates retain correct meaning. Review/focus discrepancies have explicit reasons. Include legal alternatives, sacrifices, pins, delayed recaptures, neutral opening moves and mate-17 exclusions in a small reviewed real-engine corpus. Automatic cause labels never become established psychological diagnoses. General trends can separate playing platforms and show unknown provenance explicitly. Test exact source links and unchanged review/scheduler credit.
- **Costs / protections:** moderate bounded refactoring; avoid mandatory reanalysis and history resets. New evidence versions must not overwrite the meaning of old attempts. Reanalyse a chosen sample only on request. Rollback must preserve existing reports and attempts.
- **Decision:** highest implementation priority. Begin with a failing non-capturing-fork regression and a documented coverage matrix; do not claim comprehensive tactical understanding.

### 2 — A persistent, explainable focus: proceed second, after approval

- **Need / requirements:** learn a recurring lesson over time rather than chase a changing list of mistakes (LR01/02/10/11/13).
- **Existing / simplest option:** retain the current focus and daily-practice UI, source games, scheduling and feedback. Persist a compact chosen-focus record instead of building a separate planner.
- **Expected benefit:** continuity and a clear next action: learn one example, practise a few decisions, revisit when due, inspect later games.
- **Acceptance evidence:** chosen focus survives reload, new imports and recommendation changes; learner can keep/change it explicitly; evidence date, provisional status and change reason remain available. Reanalysis can mark evidence superseded without erasing prior study. The plan never creates duplicate sessions, review credit or analysis jobs. A completed daily session can still have a longer-term focus awaiting revisit. The owner can explain the focus and reach its source example unaided on physical Safari.
- **Costs / protections:** likely small additive persistence, profile-scoped with migration/backup tests; no new runtime. Keep completed attempts immutable. Rollback can disable plan selection while preserving plan history; do not assume an old container reverses schema changes.
- **Decision:** next substantial feature. Keep it in Today, with one primary session action and optional details. Do not create a training-plan tab or a large curriculum editor.

### 3 — Retention and transfer assessment: staged pilot after 1–2

- **Need / requirements:** establish whether the learner recognises patterns beyond memorised positions and makes fewer serious errors (LR08/09).
- **Existing / simplest option:** extend attempt/exposure provenance and existing follow-up; use unfamiliar reserved own-game decisions first. These are new-to-practice, not necessarily truly unseen: the learner played the games. A small independently reviewed external/curated set is needed for stronger unfamiliar-position assessment if own-game material is inadequate.
- **Expected benefit:** distinguish remembered answers from transferable recognition and determine when to continue or change a focus.
- **Acceptance evidence:** report delayed unaided recall separately from immediate retry; recorded hints/reveals/teaching exposure invalidate an unaided retention claim. Keep transposed/duplicate position families out of held-out assessment. Include safe positions and measure false alarms. Multi-move mate execution has separate evidence from finding its first move. Small or missing samples produce uncertainty, never an improvement badge.
- **Costs / protections:** moderate provenance/content work; a capped optional content adapter only if needed, with licensing and source identity checked at implementation time. Do not fabricate user games for external puzzles or silently analyse games. Keep assessment policy versioned and allow disabling the pilot without deleting history.
- **Decision:** proceed incrementally; no bulk puzzle database or universal FSRS migration as prerequisites.

## 4. What to do with the proposed additions

| Proposal | Decision under this charter | Reason / gate |
|---|---|---|
| More adaptive selection | Modify and continue through priorities 1–2 | Already partly implemented. Correct coverage and persist focus before adding clever ranking or machine learning. |
| AI coach | Defer integration; retain evidence-based local coach | LR13 is partly served by structured lessons. Consider a small opt-in comparison only if explanations fail comprehension tests. Engine-validated moves do not guarantee correct AI prose. Require useful local fallback, explicit sharing choice and bounded cost. |
| Lichess puzzle library | Conditional small transfer pilot in priority 3 | LR08 can justify unfamiliar examples; content volume alone cannot. No full dump/import subsystem yet. |
| Opening-specific puzzles / evaluation dataset | Keep deferred | Supporting enrichment, below current mistake-reduction and measurement gaps. Evaluation records are not automatically sound training tasks. |
| Maia human-like replies | Defer | Existing frequency data/model games serve inspectable opening-response needs. Added runtime/calibration/maintenance lacks a demonstrated current training benefit. |
| Playwright MCP | Optional developer investigation, not product priority | Existing Playwright and browser tools cover much of the need. Add only if a concrete debugging gap justifies it; preserve one regression suite. |
| axe/accessibility and physical Safari | Targeted reliability work alongside priorities | LR10; physical usability remains unmeasured. Scan and fix relevant states, then verify keyboard/touch/assistive flow. Tool installation alone is not the outcome. |
| Preferred main lines / further opening polish | Maintain; defer expansion absent a blocking usability defect | Branch hierarchy and different first replies already exist. Improve a demonstrated preparation problem, not a parity score. |
| More training modes / playing ordinary games | Do not pursue now | Existing modes are sufficient to test the learning loop; hosting games remains outside the charter. |

The older [integration review](INTEGRATION_DEVELOPMENT_REVIEW_2026_10_28.md) remains useful, but portions describing missing focus selection/coaching now have shipped counterparts. The [4 November review](BRANCHES_COACH_AND_FOLLOWUP_2026_11_04.md) documents their deliberate limits. Historical Chessbook scores should not determine the next priority.

## 5. Measurement and release sequence

Before implementation, record the current build and a small baseline from explicitly selected games. Agree one primary playing pool for the 2000 target; Chess.com rapid, Lichess rapid and over-the-board Elo are distinct goals. This clarification need not block correctness fixes.

1. **Usability/reliability checkpoint:** on the installed build, import/choose a game, request analysis, understand a decision, start the focus, complete feedback, find its updated source review, reload and resume. Record confusing steps and physical Safari interaction; fix reproduced blockers in the existing suite.
2. **Evidence pass:** implement priority 1 against frozen positive/negative examples, retaining exact engine/settings/proof provenance and old data. A small sample should be manually checked against Stockfish, including the owner's missed-queen and sound-opening cases.
3. **Continuity pass:** implement priority 2; pilot one focus across several sessions. Success initially means the owner can explain and follow the plan, not a claim of higher playing strength.
4. **Learning evaluation:** implement priority 3 only as needed. Report first unaided unfamiliar performance and false alarms, delayed recall, and later serious errors/blunders per 100 own moves. Show unique games/positions, own-move denominators, dates and analysis coverage.

For real-game comparisons, separate platform/time control and engine/grading cohorts; report colour, learner/opponent ratings at game time and missing data. Use a prospectively chosen sequence of games rather than only wins or memorable losses. Do not silently pool settings or automatically reanalyse to improve coverage. First-error timing is secondary and must account for clean/short games; accuracy is supporting evidence, not the sole target.

A 20-game window is descriptive, not a pass threshold. Choose a meaningful change before observing results, estimate uncertainty with game-level dependence, and collect more data when the interval remains wide. With one learner, before/after observations cannot isolate training from other study, changing opponents or natural development. Record “insufficient evidence” where appropriate.

Engineering release gates continue to protect import, opening practice, analysis, feedback linking, history, backup/restore and mobile journeys. Human comprehension and learning outcomes remain separate acceptance layers. Do not advance simply because more tests or more features pass.

**Next concrete work, if approved:** a narrow tactical-consistency and evidence-provenance pass, beginning with non-capturing missed forks, followed by a persistent focus. This directly serves learning from the owner's games without expanding the interface or runtime architecture.
