# Thinking Board workflow review — 31 October 2026

The subsequent [implementation follow-through](WORKFLOW_FOLLOW_THROUGH_2026_10_31.md)
records changes made after this audit and their current verification.

## Purpose and scope

The purpose is a clear learning cycle from the learner's own games: identify a
useful lesson, practise it, revisit it and look for change in later games. Review
completion, recall performance and chess improvement are different outcomes.

This review inventories every current user-facing workflow family, including its
completion and recovery paths. It uses application/service source, existing
regression journeys and the verification noted below. Code/test coverage does
not establish that a person understands the UI, that every possible branch has
been manually exercised, or that training improves play. Physical Safari and
assistive-technology checks remain unmeasured.

### Purpose checks for the two immediate improvements

- **Game-review lifecycle — LR02/07/10/11.** The library displays a fixed number of
  marked decisions; the board highlights its selected decision. Reveals and
  successful local answers are stored, but there is no review checklist. Reuse
  the existing snapshot and chronological local-event table to derive Not started,
  Partially reviewed and Complete. Add manual decision/game marking and reopening,
  and a library status filter. Revealing an answer counts as reviewing, not
  unaided recall. Skipping or an unverified answer does not count. Preserve all
  attempts, scheduled practice and old snapshots. Refreshing feedback gets a new
  checklist; history remains. Acceptance: reload, return to library, filters,
  manual reset/reopen, old saved attempts, stale tabs and profile isolation.
  Cost: bounded summary reads and small controls; no migration or scheduler change.
  Decision: implement as a checklist rather than inventing a mastery score.
- **Profile and linked usernames — LR10/11/12.** Account editing is hidden inside
  importing games; the player selector is elsewhere. Add a single Profile page
  for Lichess/Chess.com usernames and active player selection. Reuse validated
  account connection endpoints and existing per-player connections. Keep import
  month/sync actions in My games, with links to Profile, avoiding duplicate
  username forms. Changing an account must preserve games and alias history.
  Keep an unsaved second username when saving the first and retain a pasted PGN
  while visiting Profile (in memory for this tab, not saved browser storage); abort stale UI responses
  and reject a save for a changed player. No password or cloud coach is introduced.
  Acceptance: both usernames, errors, persistence, player switch, import hand-off,
  narrow layouts and no automatic engine request. Decision: implement bounded
  account management, without adding profile merging or destructive unlinking.

## Overall judgement

The app has a substantial, reusable analysis and scheduling core. Most main paths
are implemented with saved state and recovery coverage. It is not yet a uniformly
simple learning experience: Today has competing starts, opening preparation has
several statistical/reference views, and feedback sometimes asks the learner to
interpret engine results rather than teaching the transferable warning sign.
The review-completion gap and scattered account setup are addressed in this change.

The next investment should connect the existing workflows into one clear lesson
and practice plan, then improve its content and measure later recognition. More
training modes or external engines are lower priority than that work. Do not remove
existing manual workflows or hide incomplete/uncertain evidence to make the app
appear simpler.

## Assessment rubric

Implementation: **1** broken/missing, **2** usable with material gaps, **3** solid
bounded implementation with regression evidence, **4** independently verified
across the target environments with no known critical implementation gap.
UX: **1** blocked/confusing, **2** usable but requires discovery or clarification,
**3** clear main path with identifiable completion/recovery, **4** demonstrated
unaided human task success. UX scores below are design assessments, not measured
usability results; none earns 4 without learner observation. Critical defects
are not averaged away. Scores describe the inspected implementation, with the
changes in this review explicitly identified.

## Workflow inventory and assessment

| Workflow | Implementation / UX | Findings and next action | Relevant source and regression evidence |
|---|---|---|---|
| First visit and choosing the next action | 3 / 2 | Daily plan, learning focus and manual practice compete for attention. Keep the daily plan as the primary start; evaluate consolidation after the current fixes. Empty states and retry paths exist. | [App.tsx](../../apps/web/src/App.tsx), [DailyPracticePlan.tsx](../../apps/web/src/components/DailyPracticePlan.tsx), [Dashboard.tsx](../../apps/web/src/components/Dashboard.tsx); [ui-review.spec.ts](../../tests/e2e/ui-review.spec.ts), [daily-practice.spec.ts](../../tests/e2e/daily-practice.spec.ts) |
| Active learner and linked accounts | 2 → 3 / 2 → 3 | **Changed here:** dedicated Profile entry, both account names together, per-player saves and import hand-off. Player quick-switch remains for compatibility. Rename/merge/unlink are not added. | [ProfilePage.tsx](../../apps/web/src/components/ProfilePage.tsx), [profile.ts](../../apps/server/src/training/profile.ts), provider connection services |
| PGN preview, player choice and saving | 3 / 3 | Good separation of preview and save; edits invalidate stale previews. Import can select another learner, which deserves a clearer confirmation in a future pass. | [ImportPanel.tsx](../../apps/web/src/components/ImportPanel.tsx), [import-service.ts](../../apps/server/src/imports/import-service.ts); [ui-review.spec.ts](../../tests/e2e/ui-review.spec.ts) |
| Lichess connection and sync | 3 / 2 → 3 | Username setup moves to Profile; bounded sync, duplicate handling, boundary safety and retry remain. Automatic six-hour checks when opening My games differ from Chess.com's manual monthly import; make that policy clearer next. | [lichess-sync-service.ts](../../apps/server/src/imports/lichess-sync-service.ts), [ImportPanel.tsx](../../apps/web/src/components/ImportPanel.tsx); service tests |
| Chess.com connection and monthly import | 3 / 2 → 3 | Username setup moves to Profile; explicit month selection, no automatic analysis, deduplication and account validation stay. Empty months/provider delays must remain distinguishable from errors. | [chesscom-import-service.ts](../../apps/server/src/imports/chesscom-import-service.ts), [ChessComImport.tsx](../../apps/web/src/components/ChessComImport.tsx); [chesscom-import.spec.ts](../../tests/e2e/chesscom-import.spec.ts) |
| Requested engine analysis | 3 / 3 | Single, selected/all, reanalysis, stop/retry and saved-report preservation exist. Explicit requests protect control; long-running progress stays visible. | [GameAnalysisRequest.tsx](../../apps/web/src/components/GameAnalysisRequest.tsx), [game-quality-service.ts](../../apps/server/src/analysis/game-quality-service.ts); [game-analysis.spec.ts](../../tests/e2e/game-analysis.spec.ts) |
| Game library, search and selection | 3 / 3 | Bounded rendering searches the full library. **Changed here:** review-status filtering and progress summaries; selection is distinct from completion. | [GameLibrary.tsx](../../apps/web/src/components/GameLibrary.tsx), [GameReview.tsx](../../apps/web/src/components/GameReview.tsx); [ui-review.spec.ts](../../tests/e2e/ui-review.spec.ts) |
| Replay and source-position links | 3 / 3 | One board, saved position and old game/ply links work. Background refresh must preserve open reports and selection. | [GameReplay.tsx](../../apps/web/src/components/GameReplay.tsx), [game-replay-service.ts](../../apps/server/src/games/game-replay-service.ts); [game-replay.spec.ts](../../tests/e2e/game-replay.spec.ts), [game-analysis.spec.ts](../../tests/e2e/game-analysis.spec.ts) |
| Marked decisions and review completion | 1 → 3 / 1 → 3 | **Changed here:** chronological reviewed/unreviewed markers, partial/complete status, reopening/reset and visible saved-library state. Completion is a checklist, not mastery or scheduled practice. | [game-review-progress.ts](../../apps/server/src/games/game-review-progress.ts), replay service/UI; new service/browser regressions |
| Filtered practice within a game | 3 / 3 | Opening, mistakes, attacking, defending and missed-mate selections share one board; rounds resume and distinguish skipped from reviewed. A completed round may cover only a subset of the game. Keep that distinction visible. | [GamePracticeControls.tsx](../../apps/web/src/components/GamePracticeControls.tsx), shared selector; [game-replay.spec.ts](../../tests/e2e/game-replay.spec.ts), [learning-quality.spec.ts](../../tests/e2e/learning-quality.spec.ts) |
| Explain a decision and schedule later practice | 3 / 2 | Stored continuations and next-day follow-ups are useful. Several disclosure/buttons require discovery, and root-move recall is not proof of calculating the full continuation. | [GameReplay.tsx](../../apps/web/src/components/GameReplay.tsx), replay service; [daily-practice.spec.ts](../../tests/e2e/daily-practice.spec.ts) |
| Opening patterns across games | 3 / 3 | Bounded rows and one expanded pattern reduce clutter. Reviewing a pattern is separate from completing a game; ensure labels keep that scope clear. | [OpeningGameInbox.tsx](../../apps/web/src/components/OpeningGameInbox.tsx), opening game service; [opening-quality.spec.ts](../../tests/e2e/opening-quality.spec.ts) |
| Prepare a reply or keep an idea | 3 / 3 | Useful choice between a saved line and a short principle; unsaved notes survive background refresh. Do not turn every surprise into mandatory content. | [OpeningPreparationAdvice.tsx](../../apps/web/src/components/OpeningPreparationAdvice.tsx), [OpeningSurprisePrep.tsx](../../apps/web/src/components/OpeningSurprisePrep.tsx); opening/UI journeys |
| Daily plan start, resume and finish | 3 / 3 | Reuses opening and thinking schedules; saved queues and completion are persistent. Game-date filters scope source games; resumed plans keep their original filter. Other due material may remain after the short plan, which is explained. | daily-practice service/UI; [daily-practice.spec.ts](../../tests/e2e/daily-practice.spec.ts) |
| Recurring learning focus | 2 / 3 | Clear evidence and bounded due practice, but grouping is broad material/mate patterns; it is not a complete tactical/decision-making diagnosis. Add useful motif distinctions and evidence of transfer before more training modes. | learning-focus service/UI; [learning-quality.spec.ts](../../tests/e2e/learning-quality.spec.ts) |
| What changed | 3 / 2 | Legal observations and multiple supported answers are useful. Several observations may be valid; avoid teaching one phrasing as the only insight. Error/retry exists. | [WhatChangedPanel.tsx](../../apps/web/src/components/WhatChangedPanel.tsx), training service; thinking/real-engine checks |
| Candidates | 3 / 2 | Accepts multiple plausible candidates and engine-checks alternatives. Candidate strength alone does not show whether a threat was noticed or calculation was sound. | [CandidateGenerationPanel.tsx](../../apps/web/src/components/CandidateGenerationPanel.tsx), candidate service; thinking/real-engine checks |
| Blunder check | 3 / 3 | Sound-development negative controls and material/mate evidence protect against false "punishments". Missed attack and allowed defence can coexist. Keep unknown causes unknown. | [TrainingPanel.tsx](../../apps/web/src/components/TrainingPanel.tsx), tactical evidence/punishment; real Stockfish corpora |
| Punish | 3 / 2 | Useful opponent-perspective practice, but the change of side can confuse. Retain clear mover labels and avoid mixing likely replies with objectively winning continuations. | [PunishBlunderPanel.tsx](../../apps/web/src/components/PunishBlunderPanel.tsx), V1 service; thinking/browser checks |
| Quiet plan | 2 / 2 | Reasonable alternatives receive credit, but qualitative plan feedback is necessarily limited. Avoid implying engine agreement proves a uniquely correct strategic plan. | [QuietPositionPanel.tsx](../../apps/web/src/components/QuietPositionPanel.tsx), quiet service; quiet smoke/browser checks |
| Repertoire library and imports | 3 / 3 | Existing/private lines, ownership preview and either colour are supported. Library, source provenance and account usernames should stay distinct. | [OpeningImporter.tsx](../../apps/web/src/components/OpeningImporter.tsx), library manager/import services; stable/opening journeys |
| Build and edit lines | 3 / 3 | Multi-start lines, undo, notes, engine scores and frequency replies exist. Strongest own move and most frequent opponent replies have different meanings. Keyboard hover priority and responsive native pieces have regression coverage. | board builder/line explorer/suggestions; opening/chessboard journeys |
| Branch navigation and choosing practice | 3 / 2 | Capable but dense. Retained workspaces and branch scopes reduce loss of context; further simplification should use observed learner tasks. | branch navigation, line library/selection; opening journeys |
| Guided first learning | 3 / 3 | Explains before recall, resumes saved decisions and distinguishes introduction from independent recall. | opening training/review components and services; first-exposure tests |
| Spaced opening recall | 3 / 3 | Due/new counts, help/retry distinctions and persistent queues exist. Do not conflate completion, accuracy and future retention. | opening review/scheduler; opening review/history tests |
| Opening practice/data preferences | 3 / 2 | Level/platform, sampled time controls, goals, depth, pace, sounds, pauses and time zone are grouped together under opening settings. This is distinct from the new Profile account names, but the label should make that distinction easier. Editing drafts can be reset by changed preference props; protect that path in a future settings pass. | [OpeningPlayerContext.tsx](../../apps/web/src/components/OpeningPlayerContext.tsx); stable/opening preference journeys |
| Optional variation sandbox | 3 / 2 | Trying moves, undo/reset/flip and deliberately adding a variation are supported. Its purpose differs from the build board, but another board adds visual load; keep it optional and closed until requested. Exploration alone does not save a repertoire line. | [OpeningAnalysisSandbox.tsx](../../apps/web/src/components/OpeningAnalysisSandbox.tsx), opening workspace journeys |
| Master-versus-rating-band reference | 3 / 2 | Sample counts, retrieval dates and unavailable evidence are shown separately. This is useful reference, not an engine verdict or another recommendation feed. Keep it behind the current disclosure; avoid showing identical frequency claims in multiple open panels. | [OpeningMasterEvidence.tsx](../../apps/web/src/components/OpeningMasterEvidence.tsx), opening quality journeys |
| Coverage and gaps | 3 / 2 | Own-game observations and Lichess sample evidence are separate. Statistical labels remain hard for a learner; favour one actionable missing reply over headline totals. | coverage panels/services; opening quality tests |
| Notes and repertoire annotations | 3 / 3 | Personal ideas and authored explanations persist, including transpositions. Preserve drafts and distinguish old saved game feedback from current notes. | explanation/comment editors; opening/UI tests |
| Find and study stronger-player/model games | 3 / 2 | Exact position matching, transpositions, source choices and provider recovery exist. Discovery remains less obvious than review/practice. Keep study optional and contextual. | [OpeningModelGameStudy.tsx](../../apps/web/src/components/OpeningModelGameStudy.tsx), study discovery/service; model-game journeys |
| Guess moves in a model game | 3 / 3 | Hidden answers, hints, side-specific continuation and saved progress exist. Matching the historical move is not the same as proving the only good move. | study quiz/service; model-game journeys |
| Archive, restore and source updates | 3 / 2 | Reversible archive and deliberate source updates preserve history. Destructive actions need clear scope, separate from routine line work. | library manager/source update services; opening journeys |
| Real-game progress | 3 / 3 | Comparable engine/time-control cohorts, denominators, date windows and source links are present. Sparse evidence and unanalysed games must remain visible. | [GameQualityProgress.tsx](../../apps/web/src/components/GameQualityProgress.tsx), quality service; game-analysis journeys |
| Opening learning measures | 2 / 2 | Helpful separation of helped/unaided evidence; delayed retention and unfamiliar-position results are often unavailable. Unknown must stay unknown. | [OpeningLearningMeasures.tsx](../../apps/web/src/components/OpeningLearningMeasures.tsx), opening metrics; delayed-learning journey |
| Thinking progress and diagnoses | 2 / 2 | Due counts and repeated exercise concepts exist. Different charts/starting buttons compete with the daily focus, and engine data cannot establish a psychological cause. | [Dashboard.tsx](../../apps/web/src/components/Dashboard.tsx), V1 service; practice scope/progress tests |
| Loading, saving, failures and session restoration | 3 / 3 | Abort/stale-response guards, save recovery and reload paths are widespread. Test cross-view/player transitions and late refreshes, not just isolated widgets. | API wrapper and all load-state components; UI/replay/profile journeys |
| Board input and accessibility | 3 / 2 | Native piece alignment, drag, keyboard, promotion, castling and touch layouts have automated coverage. Physical Safari and assistive technology remain unmeasured. | [ChessBoard.tsx](../../apps/web/src/components/ChessBoard.tsx); [chessboard.spec.ts](../../tests/e2e/chessboard.spec.ts), responsive journeys |
| Self-hosting, source/licences and backup/restore | 3 / 2 | Container, persistence and bundled source checks exist; administrative backup/restore remains a documented operator workflow rather than a learner page. Do not add routine admin controls to the training UI. | deployment/scripts, legal page; container/source smoke checks |

## Ranked next work after these two fixes

1. Verify the new completion and Profile journeys with the learner on their actual
   Safari device. Watch whether they can distinguish reviewed, recalled and due.
2. Consolidate Today around one recommended session, keeping manual modes as an
   explicit secondary choice. Avoid maintaining competing versions of a plan.
3. Improve the content of the plan: recurring forks/captures/defensive warnings
   with supporting examples, and full short-mate execution where justified.
4. Measure delayed unaided recognition and recurrence in later comparable games;
   include unfamiliar and no-tactic positions before claiming improved play.
5. Simplify opening coverage language and study discovery using observed task
   failures. Do not prioritise cosmetic feature count over the learning cycle.

## Verification record

Completed 31 October 2026, against the original review pass’s application source
(before the follow-through changes linked above):

- Type checks and production server/web build passed.
- **448/448 unit tests** passed.
- **224/224 browser journeys** passed across Chromium and mobile WebKit, with
  no skipped, flaky or unexpected results in the final run.
- **25/25 genuine Stockfish 18 checks** passed: 16 tactical regressions and
  nine thinking/full-game cases. Browser fixtures use a deterministic engine;
  these separate checks use real Stockfish in Docker.
- The existing three-stage [engineering quality gate](../learning-quality/QUALITY.md)
  reports **PASS**, with a current, unchanged source fingerprint. Its individual
  criteria cover focused game review/practice/tactical safety; passing is not a
  claim of measured human usability or learning benefit.
- An additional Linux Docker run passed **50/50 affected browser journeys**.
  After the final recall-filter and dropdown-contrast fixes, both new workflows
  were rechecked in Linux Chromium and WebKit: **4/4 passed**.
- Desktop and mobile game-library/Profile captures were inspected. Narrow-width
  checks cover 320, 360, 390, tablet and desktop layouts as appropriate to each
  journey. Linux WebKit exposed pale text on a native light dropdown; the new
  dropdowns now have explicit dark styling, and the corrected capture was inspected.
- New regressions cover partial/complete/reset/reopen, library filtering and
  persistence, reveals versus failed/skipped answers, no fabricated training
  credit, checklist events not changing recall grading, stale review tabs,
  profile isolation, invalid account recovery, both username saves, unsaved second
  username and pasted-PGN preservation, and explicit import/analysis separation.

All test data was isolated from the learner's live library. Public account
responses were fixture-backed in browser tests; this run does not certify current
provider uptime or real-device Safari interaction. Human task success, assistive
technology and improvement in later games remain unmeasured. Publication is separate from this original verification record; see the subsequent
implementation record and GitHub workflow for current release status.

No database schema, stored-game migration, scheduling algorithm or deployment
configuration is changed. Review checklist actions append to the existing local
review history; account saves use the existing connection and alias tables. The two authorised UI/lifecycle changes
reuse existing tables/services and add no mandatory external service.

## Incremental follow-up plan

| Phase | User outcome / acceptance | Dependencies and scope | Protection / rollback |
|---|---|---|---|
| 1 — Finish this lifecycle pass | A game can be not started, partially reviewed, complete and reopened; the library agrees after reload. Both public usernames live in Profile; switching players isolates accounts and history. Saves do not start analysis or award recall. | Existing replay snapshots/events, profile connections and import routes; implemented and passed the checks recorded above. | Additive event values, no schema migration. Historical games, attempts and schedules remain. The UI can be reverted independently; retain the new result filters in the replay service so older code does not count checklist events as local tries/prior practice. Preserve the database before deployment rollback. |
| 2 — One clear daily start | On first view the learner can explain the recommended focus, its evidence and the next action. One primary session entry; existing manual modes, opening practice and full game review remain discoverable. Resume and completion must agree with the existing saved session. | Resolve how recurring focus feeds the daily plan before changing presentation. Reuse current selectors and scheduler; do not create another queue. | Test existing active/completed sessions and player switches. Roll back presentation independently of stored schedules. |
| 3 — Better lessons from the same games | Distinguish supported missed tactics and defensive warnings with legal, engine-backed examples; unknown explanations stay unknown. Short mate exercises require appropriate execution rather than credit for guessing only the first move. | Verified tactical evidence, game decision snapshots and adjustable mate limit. No external engine or dataset required first. | Positive and negative tactical examples, alternative solutions, both colours and practical mate boundaries. Version new feedback; retain old saved reviews. |
| 4 — Demonstrate transfer and simplify remaining study flows | Separate delayed recall, first-seen recognition and recurrence in later comparable games. Revise coverage/model-game discovery when observed learner tasks show where it fails. | Enough dated analysed games and clearly identified first/helped/repeated encounters. Respect platform, rating, time-control and engine-setting differences. | Sparse cohorts show counts/unknowns; do not backfill invented first attempts or claim causal improvement from completion. |

## How to assess workflow quality

For a learner check, use five concrete tasks: link both accounts; import one game;
find and review one useful decision; leave and resume a partial review; complete
that review and explain what to practise later. Record whether each task is
completed without help, wrong turns, any lost work and the learner's explanation
of reviewed versus recalled versus due. Physical Safari drag/promotion and
assistive-technology checks remain separate from emulated WebKit checks.

For later learning changes, record serious errors per 100 own moves, blunders
per game, timing of the first serious error and supported motif recurrence, with
numerators, denominators and analysis coverage. Compare within platform/time
control/analysis settings and inspect rating/opponent shifts; show sample size
rather than treating a handful of games as a trend. Measure first unaided answers
on unseen positions and delayed recall separately from helped/repeated attempts.
These are outcome checks, not a reason to make the main interface show more charts.
