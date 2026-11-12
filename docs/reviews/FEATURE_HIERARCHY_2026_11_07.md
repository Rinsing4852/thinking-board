# Feature inventory and charter hierarchy — 7 November 2026

## Decision and scope

Thinking Board has the main tools needed to learn from the owner's games. Prioritise dependable evidence, a lasting learning plan, targeted tactical depth and measurement of transfer. Retain existing useful features. Additions should make the learning cycle more effective without adding more default screens or training modes.

This review follows [the charter](../PROJECT_CHARTER.md), recent source inspection and the [6 November review](CHARTER_ALIGNMENT_AND_NEXT_PRIORITIES_2026_11_06.md). It incorporates the [tactical consistency/UI pass](TACTICAL_CONSISTENCY_AND_UI_TEXT_2026_11_06.md) and [tactical value safeguard](TACTICAL_VALUE_CHECK_2026_11_07.md), rather than recommending those fixes again.

**Status refers to the current working tree.** The recent tactical and UI changes are tested locally but remain uncommitted/unpushed. The installed Unraid build has not been inspected. This document proposes priorities; it does not authorise implementation, commit or deployment. Only documentation is added by this review.

## Existing features

| Area | What exists | Important boundary | Charter |
|---|---|---|---|
| Accounts and imports | Player profiles and aliases; Lichess integration, monthly Chess.com import, pasted/multiple PGNs; source identity and deduplication | Chess.com import is explicit by month, not continuous full-history sync | LR11/12 |
| Game library | Opponent/colour/result/date/source/review table; search, source/review filters, scrolling, game selection and live analysis readiness | Analysis and review completion remain distinct | LR10/12 |
| Requested analysis | Local Stockfish; individual, selected or all-game jobs; saved analysis runs; move grades and app-calculated accuracy | Finite engine search; scores are not guaranteed to match another platform | LR05/07/11 |
| Individual game review | One replay board, marked decisions, better continuations, opening comparisons, recall, partial/complete review, saved feedback versions and later practice | Reading/reviewing is separate from unaided recall and scheduling | LR07/10/11 |
| Cross-game practice | Select error types across games; mate limit; reviewed-position filtering; practice updates exact source decisions | Uses saved analysis and bounded rounds, not automatic new analysis | LR01/04/10 |
| Thinking framework | What changed, candidates, blunder check, punish and quiet plan; resumable sessions and repeated-opportunity grouping | Exercise modes do not establish why a player erred or cover every tactic | LR03–05 |
| Tactical evidence | Missed captures, allowed material threats, some forks, mating opportunities; non-capturing forks now reach training/focus; shared motif rules | No comprehensive pin/skewer/discovered-attack taxonomy or exhaustive material proof tree | LR04/05 |
| Tactical value | Net material after defensive replies, engine candidate tolerance, chance-loss safeguard, rejection of giving up forced mate, versioned feedback updates | Material gain does not mean a won game; best resistance in a bad position remains eligible | LR05/07 |
| Practical mates | Verified first moves, alternative stored roots, learner-selected maximum 1–4 moves, default 2; longer mates excluded from recommended mate practice | Does not grade executing the whole mating sequence or calibrate automatic difficulty progression | LR06 |
| Current coaching focus | Observable recurring pattern, provisional evidence, source games, warning/checking habit and small due selection | Computed recommendation, primarily from verified blunder-check items; no durable curriculum or AI coach | LR01/02/13 |
| Daily practice and scheduling | Saved opening→thinking routine, resume, due dates and attempts; opening FSRS, separate game-exercise interval schedule | Game-exercise scheduling is not FSRS; daily completion is not mastery | LR02/10/11 |
| Progress | Accuracy/error counts, serious errors per 100 own moves, first-error observations; recent/previous windows; current-focus later-game comparison | Limited descriptive evidence; no demonstrated causal training benefit; general platform grouping needs improvement | LR09 |
| Opening preparation | Multiple first moves/replies, nested branches, shared-position navigation, editing/import/export, notes and practice selection | Preferred/main-continuation editing remains a possible refinement, not required for multiple starting branches | LR07/10 |
| Opening guidance and memory | Engine suggestions and board arrows; opponent reply frequencies; personal observations separate from Lichess samples; coverage/gaps; lessons and FSRS recall | Coverage, popularity, move quality and memory are different measures | LR05/07 |
| Stronger-player game study | Find games matching a position/move order, replay continuations and guess historical moves, with separate study history | Historical play is an example, not necessarily the best engine move | LR07/13 |
| Reliability and self-hosting | SQLite persistence/backups, local engine, automated unit/browser/real-engine gates, mobile WebKit coverage; recent wording reduction | Physical Safari/assistive usability, comprehension and learning gains remain unmeasured | LR10/11 |

## What remains partial

- **A recommendation is not yet a durable plan.** Current focus/follow-up can change or disappear with filters, reanalysis, content or the bounded evidence window.
- **A chess event is not an established thinking cause.** Automatic calculation/pattern-failure labels remain in older generation/summary paths.
- **A motif label is not comprehensive coverage.** Current fork/material/mate evidence does not justify claiming all pins, skewers or discovered attacks are detected. Some such positions may be included as generic material threats.
- **Finding a mating move is not completing mate.** Multi-move execution and performance-based progression remain proposed.
- **Successful repetition is not unfamiliar recognition.** Game-derived tasks were encountered in the learner's own play. There is no dedicated held-out tactical/safe-position assessment or comprehensive game-exercise exposure-aware retention measure.
- **A trend is not proof of training effectiveness.** Current-focus comparison separates platform/colour/settings, but general game-quality trends do not yet split playing platform. Ratings are context rather than statistical adjustment.

## Ranked hierarchy: purpose checks for proposed work

All benefits below are hypotheses pending measurement. Any reproduced reliability defect blocking a session takes precedence. Every phase must preserve games, repertoires, attempts, sources and schedules; use local processing and existing components first. A roadmap is not approval to implement it.

| Rank / decision | Learner need and charter | Existing capability / simplest improvement | Expected benefit and acceptance evidence | Cost and protections |
|---|---|---|---|---|
| **0 — Release/usability checkpoint**; recommended gate | Use the actual application successfully, LR10/11 | Recent changes already pass engineering gates. Commit/publish only when requested, establish installed build, observe one normal physical-Safari session | Owner can find a focus, understand an example, practise, find its source review and resume unaided; record observed problems separately from test results | Low development cost; preserve installation data; no new feature or mandatory redesign |
| **1 — Trustworthy labels and comparisons**; improve first | Understand what is known and compare appropriate games, LR03/07/09/12 | Keep objective motifs; distinguish automatic hypotheses, learner reports and unknown causes. Add platform separation to existing general trends | No automatic claim of a proven calculation/attention failure; comparisons disclose platform, time control, settings, dates, denominators and missing data. Regression checks preserve historical labels/provenance | Small–moderate; no rewriting completed history or mandatory reanalysis. Keep uncertainty in concise details |
| **2 — Persistent personal training plan**; next main addition | Know what to work on and continue across sessions, LR01/02/10/11/13 | Extend current focus and saved daily plan; retain one chosen focus, evidence and study history, with explicit keep/change actions | Focus survives import/reload; reanalysis marks evidence superseded without erasing study; learner understands why and next step; no duplicate sessions/credit. Capture baseline and study/exposure provenance from the start | Moderate; likely additive local persistence. No new planner tab, engine or scheduler; backup/migration and compatible rollback tests |
| **3 — More precise coaching from actual decisions**; improve with plan | Learn what to notice before moving, LR03/13 | Replace generic pattern wording where verified evidence supports actual target squares, defenders, lines and opponent reply. Optional learner explanation; unknown remains valid | Explanation refers to cues present before the move, demonstrates a legal consequence and gives one checking habit. Owner can explain the lesson unaided; never infer a mental cause from an engine score | Moderate; deterministic local explanation first, bounded UI. Keep existing source board and practice, not a second coaching screen |
| **4 — Targeted tactical and mate depth**; add only evidenced gaps | Recognise recurring missed/allowed patterns and finish practical mates, LR04–06 | Extend shared proof/motif rules for patterns actually recurring in own games; add whole mate-in-1–4 execution within the existing board | Verified positive and negative cases for each named motif; false forks/sacrifices/counterplay stay out. For mates, test legal defences and alternatives within limit; first move and full execution have separate outcomes | Moderate–high depending on proof search. Bound computation and difficulty; unknown on exhausted proof; no extra mode or bulk taxonomy for its own sake |
| **5 — Retention, unfamiliar recognition and durable later-game follow-up**; staged addition, baseline starts with rank 2 | Know whether practice carries into play, LR08/09 | Extend existing attempts/exposure records, opening retention principles and descriptive follow-up. Reserve assessment positions/families; include safe positions | Delayed unaided answers exclude intervening help; first exposure and transpositions tracked; report threat misses and false alarms. Follow later serious errors/blunders per 100 own moves with coverage and uncertainty. Compare platform/time control/settings and rating/opponent context | Moderate. No universal improvement score, silent analysis or causal claims. Own-game positions are not truly unseen; small curated/external set only if required |
| **6 — Opening and study refinements**; maintain, conditional improvement | Solve a demonstrated preparation/recall problem, LR07/10/13 | Existing branches, coverage, FSRS and model games are substantial. Consider preferred main routes, more specific explanations or clearer study entry only when a real session shows need | Faster unaided access to the relevant reply; delayed opening recall; sound departures remain distinct from mistakes. Do not prioritise deeper coverage merely to raise a percentage | Low–moderate; retain current graph/board and history. Avoid another analysis board or duplicate advice |

Ranks 2–5 are one learning cycle, not isolated products. Record evidence and a baseline when the plan begins; do not postpone all measurement until after adding more exercises. Rank 4 should follow observed recurring gaps rather than an arbitrary catalogue order. Physical usability checks continue throughout.

## Considered additions: conditional and deferred

| Idea | Current status / charter decision | Gate before adding it |
|---|---|---|
| Optional AI explanations | Not implemented; defer integration, LR13 | Show that structured local coaching is insufficient; compare factual correctness and learner comprehension against that baseline. Engine remains authoritative; explicit sharing/spend choice and local fallback |
| Small Lichess/curated puzzle pack | Not implemented; conditional support for rank 5, LR08 | Demonstrate a shortage of unfamiliar assessment examples. Check current licence/attribution when implementing, legal solutions/alternatives, source separation and exposure tracking. Never insert fake personal games |
| Opening-specific puzzles from external/evaluation data | Deferred, supporting LR07/08 | Own-game mistake reduction and plan/measurement foundations first. Evaluation records are not automatically useful puzzle lessons |
| Maia human-like opponents/replies | Not implemented; defer | Demonstrate a learning need unresolved by current frequencies/model games, then separately assess calibration, licence and local resource cost. Predictions cannot grade chess quality |
| Playwright MCP | Optional developer tooling proposal, not a learning feature | Existing Playwright/browser tools should first fail to meet a concrete debugging need. Keep one regression suite and no Unraid runtime dependency |
| axe/accessibility tooling | Proposed developer improvement, LR10 | Add targeted checks where useful, combined with physical-device, keyboard and assistive testing; tool installation is not a usability outcome |
| Switching all game practice to FSRS | Not required for this roadmap | Existing scheduling can support a persistent plan. Any replacement needs measured advantage and preserved due dates/history; do not replace it merely for consistency |
| More training modes, a large puzzle archive or ordinary online play | Do not pursue now | Existing modes are enough to test the core cycle. Hosting ordinary games remains outside the charter |

This list reviews repository proposals; it is not a fresh assessment of current external releases, model hardware or licensing. Verify those details before any approved prototype.

## Recommended next sequence

1. Make the recent tactical/UI build available only after commit/publish is requested; confirm the installed version and one understandable Safari session.
2. Complete the small trust fixes in rank 1.
3. Build the persistent focus/plan in Today, with a source example, one next action and retained study/baseline evidence. Improve position-specific coaching alongside it where supported.
4. Use the owner's next analysed games to choose the next tactical pattern or practical-mate execution gap. Develop exposure-aware retention and later-game observations incrementally; unfamiliar assessment follows a defined protocol.
5. Reconsider optional content or AI only if measured needs remain.

Measure software correctness, unaided usability, delayed/unfamiliar recognition and real-game outcomes separately. Account for analysis selection, sample size, rating/platform, opponent strength, colour, time control and engine/grading settings. Current engineering acceptance is PASS; physical-device comprehension and learning benefit remain unmeasured. No tests were rerun for this documentation-only inventory.

## Source references

- Imports/profile/library: `apps/server/src/imports/{import-service,lichess-sync-service,chesscom-import-service}.ts`; `apps/web/src/components/{ProfilePage,GameLibrary}.tsx`.
- Evidence and tactical value: `apps/server/src/analysis/{analysis-service,tactical-punishment,tactical-motif,v1-generator}.ts`; `apps/server/src/games/game-tactical-evidence.ts`.
- Review and source credit: `apps/server/src/games/{game-replay-service,training-review-link}.ts`.
- Selection/plan/scheduling: `apps/server/src/training/{learning-focus-service,daily-practice-service,v1-training-service,review-scheduler,focus-transfer}.ts`; `apps/server/src/openings/opening-review-scheduler.ts`.
- Measurement: `apps/server/src/analysis/game-quality-service.ts`; `apps/server/src/openings/opening-quality-metrics.ts`; `docs/learning-quality/QUALITY.md`.
- Openings/study: `apps/server/src/openings/{opening-workspace-service,opening-coverage-service,opening-study-discovery}.ts`; `apps/web/src/{opening-branch-tree,opening-navigation}.ts`.
