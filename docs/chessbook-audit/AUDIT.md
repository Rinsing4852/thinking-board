# Chessbook feature audit and quality tracker

Audit date: 2026-10-17. Baseline: `25d5efe`. Evidence status: **CURRENT**.

57-feature public inventory originally observed 14 October; core build, practice, coverage, autofill setup and model-game observations refreshed 17 October. Account/paid/destructive workflows and matched human outcomes remain unverified.

This is an independent behavioural specification. Chessbook source code, assets, trained models and private databases were not accessed. Public UI observations and documentation are not proof of hidden implementation or measured learning outcomes.

## Behaviour and quality review

The [17 October behaviour reconstruction](./RECONSTRUCTION.md) records fresh
build/practice/model-game observations, independent algorithm specifications,
nine task-quality gates and delivery priorities. Its user-task measurements
remain separate from the verified requirement counts below.

## What the tracker measures

- **57 feature descriptions**, each with three acceptance criteria and a repeatable comparison task.
- Current inventory: 22 existing, 10 partial, 14 absent, 5 implemented, 1 improved, 4 enhanced, 1 not_targeted.
- Acceptance checks: 84 passed, 0 failed, 0 flaky, 42 unknown, 42 unmet, 3 excluded.
- Priority-weighted verified requirement coverage: **60.7%** (386/636 points). This is a conservative evidence measure, not “60.7% as good as Chessbook”. Untested manual criteria remain unknown; missing features remain unmet.
- Like-for-like unit-evidence baseline: 26.7% → 36.9%. Browser checks were measured only for the current revision, so their improvement is not attributed to product changes.
- Current validation records: 294 unit/integration tests and 142 browser journeys; 0 failures, 0 flaky results, 0 skipped.

## Implemented from this audit

- CB17 Time-control selection for samples: absent → implemented.
- CB18 Encounter-based coverage goal: partial → improved.
- CB20 Find the biggest useful gap: existing → enhanced.
- CB30 FSRS spaced repetition: existing → enhanced.
- CB34 Hints and first exposure: existing → enhanced.
- CB36 Recommended short sessions: existing → enhanced.
- CB37 Daily practice goal: absent → implemented.
- CB38 Practice streak: absent → implemented.
- CB39 Daily activity and recall history: absent → implemented.
- CB57 Turn-aware move arrows while building: absent → implemented.

Daily effort counts scheduled encounters once, excludes lapse repeats, and shows independent recall separately. Local calendar days use a validated player time zone. A streak records consecutive days with completed practice, not consecutive days meeting the goal. The compact display shows seven days; the activity endpoint retains a 28-day view. Recommended sessions use up to ten remaining goal positions; deliberate line practice remains available after the goal is reached.

## Measurement protocol

For each comparison task, use the same legal fixture, side, rating context, depth and data availability in both tools. Record completion, action count, user-task time, errors, recovery, mobile/keyboard access and data provenance. Run five repetitions after one warm-up and report median plus worst time. Benchmark warm-cache optional API requests separately. Test unaided recall with delayed retests; a green test suite is not evidence of better learning.

The audit has **no measured Chessbook latency or human-usability scores**. Those fields intentionally remain null. We also have no valid substitute for its trained learnability model or its 1–99 score calibration. Our target is independently specified useful behaviour rather than fabricated numerical parity.

To update: edit `catalog.json`, map exact tests to individual criteria, and run `npm run audit:features:verify`. To regenerate the report without rerunning tests, use `npm run audit:features`. Source fingerprints invalidate present-day credit if code, migrations, test definitions or the catalogue change. Tests which pass after retry are marked flaky rather than clean passes. The JSON report contains the exact test evidence.

## Largest remaining gaps

- CB22 Master-game move statistics (P1).
- CB24 Repertoire effectiveness assessment (P1).
- CB25 Repertoire soundness assessment (P1).
- CB27 Autofill repertoire gaps (P1).
- CB29 Undo generated repertoire moves (P1).
- CB40 Model-game learning (P1).
- CB43 Chess.com game connection (P1).
- CB44 Played games contribute recall evidence (P1).

Recommended next batches: master-game statistics and model-game study; then safe single-gap draft generation; then transparent repertoire quality reports. Speed filtering and Chess.com archive imports are separate bounded integrations. Cross-repertoire shared recall requires careful identity and alternative-move handling.

## Limits and access boundaries

Guest menus, board browsing, first-exposure practice, model-game entry and settings were inspected. Connected-account game review, account sync, native-app runtime, paid purchase, destructive controls and live autofill were not exercised. Automatic approval review rejected opening the autofill control because it could modify many repertoire moves; official documentation supplies its description, and execution remains unverified. Daily activity history is an independent extension, not a claimed Chessbook feature. Billing is documented but excluded from the personal self-hosted target.

## Feature specifications

## CB01 — White and Black repertoire collections

**Build · P0 · existing**

Chessbook evidence: Guest home exposes separate White and Black collections and Add new. [Chessbook guest app — direct UI audit](https://chessbook.com/)

Our feature description: Create named repertoires for either side; preserve separate learning context while allowing several sources within a repertoire.

Acceptance criteria:

- **passed** — A private PGN produces the selected sides without duplicate repertoires. Evidence: unit: previews and imports both sides as private, deduplicated repertoires.
- **passed** — Build and reopen a repertoire for either side on desktop and phone. Evidence: browser/chromium: builds with automatic saves, retry safety and one board with an optional unsaved exploration mode; browser/webkit: builds with automatic saves, retry safety and one board with an optional unsaved exploration mode.
- **unknown** — A new repertoire can be created in under 60 seconds in a first-use study.

Implementation: `apps/server/src/openings/opening-pgn-import.ts`

Repeatable comparison task: Build and reopen a repertoire for either side on desktop and phone. Competitor timing and our user-task timing remain unmeasured.

## CB02 — Multiple first moves in one repertoire

**Build · P0 · existing**

Chessbook evidence: Black collection and alternative-move controls are visible; saving several root branches was not exercised. [Chessbook guest app — direct UI audit](https://chessbook.com/)

Our feature description: Allow e4, d4, Nf3 and other initial branches together, with names that describe the new route and unchanged progress on existing paths.

Acceptance criteria:

- **passed** — Root branches preserve old move IDs and review cards. Evidence: unit: builds and practises different first moves while preserving original moves and export paths.
- **passed** — Save d4 and g6 from the start of an existing e4 repertoire, then reload. Evidence: browser/chromium: builds a Black response to a different first move in the same repertoire; browser/webkit: builds a Black response to a different first move in the same repertoire.
- **passed** — A duplicate network retry never creates a second root branch. Evidence: unit: builds and practises different first moves while preserving original moves and export paths.

Implementation: `apps/server/src/openings/opening-workspace-service.ts`

Repeatable comparison task: Save d4 and g6 from the start of an existing e4 repertoire, then reload. Competitor timing and our user-task timing remain unmeasured.

## CB03 — Alternative saved responses

**Build · P0 · existing**

Chessbook evidence: Saved move view offers Add an alternative move. [Chessbook guest app — direct UI audit](https://chessbook.com/)

Our feature description: Save several learner responses at a position; practise all enabled responses without treating one fixed order as chess truth.

Acceptance criteria:

- **passed** — Every enabled alternative appears in the shared-response queue. Evidence: unit: recalls all enabled shared responses without requiring them in one fixed order.
- **passed** — Recall alternatives without requiring them in a fixed order. Evidence: browser/chromium: automatically recalls different saved responses at the same position without a fixed order; browser/webkit: automatically recalls different saved responses at the same position without a fixed order.
- **passed** — Paused alternatives stay saved but are not automatically requested. Evidence: unit: does not add paused alternatives to shared-response practice.

Implementation: `apps/server/src/openings/opening-review-service.ts`

Repeatable comparison task: Recall alternatives without requiring them in a fixed order. Competitor timing and our user-task timing remain unmeasured.

## CB04 — Board editing and immediate save

**Build · P0 · existing**

Chessbook evidence: Moves can be selected on the board while building. [Chessbook guest app — direct UI audit](https://chessbook.com/)

Our feature description: Support click, drag, keyboard and legal promotions, save new moves immediately, and show failures without moving to an unsaved position.

Acceptance criteria:

- **passed** — Illegal moves are rejected with a useful location. Evidence: unit: rejects illegal moves with their authored location.
- **passed** — Create and extend a branch with automatic saves and one board with an optional unsaved exploration mode. Evidence: browser/chromium: builds with automatic saves, retry safety and one board with an optional unsaved exploration mode; browser/webkit: builds with automatic saves, retry safety and one board with an optional unsaved exploration mode.
- **unknown** — After a save failure, the original position and an explicit retry are available.

Implementation: `apps/web/src/components/ChessBoard.tsx`, `apps/web/src/components/OpeningLineExplorer.tsx`

Repeatable comparison task: Create and extend a branch with automatic saves and one board with an optional unsaved exploration mode. Competitor timing and our user-task timing remain unmeasured.

## CB05 — Branch navigation and opening names

**Build · P0 · existing**

Chessbook evidence: Opponent moves show opening names and lead to saved continuations. [Chessbook guest app — direct UI audit](https://chessbook.com/)

Our feature description: Provide line search, fork summaries, back/forward traversal and optional opening names; navigation never writes moves.

Acceptance criteria:

- **unknown** — Navigation retains fork context across line changes.
- **passed** — Browse nested variations through shared moves without writing the repertoire. Evidence: browser/chromium: navigates nested variations through shared moves without changing the repertoire; browser/webkit: navigates nested variations through shared moves without changing the repertoire.
- **unknown** — Finding a named branch takes no more than three actions from its repertoire.

Implementation: `apps/web/src/opening-navigation.ts`

Repeatable comparison task: Browse nested variations through shared moves without writing the repertoire. Competitor timing and our user-task timing remain unmeasured.

## CB06 — Transposition handling

**Build · P0 · existing**

Chessbook evidence: Official feature list describes transpositions. [Official Chessbook Android listing](https://play.google.com/store/apps/details?id=com.chessbook.android)

Our feature description: Identify equal chess positions across legal move orders, share recall where appropriate, and preserve route-specific source explanations.

Acceptance criteria:

- **passed** — Equivalent move orders converge to the same graph position. Evidence: unit: compiles authored lines into a graph and merges transpositions.
- **passed** — Change move order while retaining the board and protecting shared notes. Evidence: browser/chromium: keeps the board when changing move order and protects shared comments while editing; browser/webkit: keeps the board when changing move order and protects shared comments while editing.
- **unknown** — Alternatives at one position must not be collapsed into one required move.

Implementation: `apps/server/src/openings/opening-content.ts`

Repeatable comparison task: Change move order while retaining the board and protecting shared notes. Competitor timing and our user-task timing remain unmeasured.

## CB07 — Move notes and visual annotations

**Build · P0 · existing**

Chessbook evidence: Saved c4 includes an explanation and Edit note. [Chessbook guest app — direct UI audit](https://chessbook.com/)

Our feature description: Keep source notes, personal notes, idea hints and coloured board marks distinct, portable and visible only when they help the current task.

Acceptance criteria:

- **passed** — Chapter-specific reasons and marks survive shared moves and updates. Evidence: unit: keeps chapter-specific reasons and marks with shared memory, including updates and export/reimport.
- **passed** — Explain the prior move and save a comment without spoiling the next recall. Evidence: browser/chromium: explains the previous move on request after advancing, and saves its comment without spoiling the next move; browser/webkit: explains the previous move on request after advancing, and saves its comment without spoiling the next move.
- **unknown** — Reimport preserves each note and arrow without changing personal learning history.

Implementation: `apps/server/src/openings/opening-context.ts`, `apps/web/src/components/OpeningLearningComment.tsx`

Repeatable comparison task: Explain the prior move and save a comment without spoiling the next recall. Competitor timing and our user-task timing remain unmeasured.

## CB08 — PGN import

**Import · P0 · existing**

Chessbook evidence: Import menu exposes PGN file. [Chessbook guest app — direct UI audit](https://chessbook.com/)

Our feature description: Preview legal PGN with variations and comments, select side, and import multiple chapters and initial moves into one repertoire.

Acceptance criteria:

- **passed** — Nested variations and comments parse without loss. Evidence: unit: preserves a main line, side variation, and comments.
- **unknown** — Import a PGN through the visible importer and reopen its saved lines.
- **passed** — Invalid PGN leaves the existing library unchanged. Evidence: unit: gives useful errors for illegal moves and custom positions.

Implementation: `apps/server/src/openings/opening-pgn-import.ts`

Repeatable comparison task: Import a PGN through the visible importer and reopen its saved lines. Competitor timing and our user-task timing remain unmeasured.

## CB09 — Lichess study import

**Import · P0 · existing**

Chessbook evidence: Import menu exposes Lichess study. [Chessbook guest app — direct UI audit](https://chessbook.com/)

Our feature description: Import selected public or authorised private study chapters with names and explanations; support source-only refreshes without replacing personal notes.

Acceptance criteria:

- **passed** — Private study import authenticates and preserves multiple chapters. Evidence: unit: authenticates, previews, and imports a private multi-chapter Lichess Study.
- **passed** — Preview and apply source changes in an expanded repertoire card. Evidence: browser/chromium: previews and applies source changes from an expanded repertoire card; browser/webkit: previews and applies source changes from an expanded repertoire card.
- **unknown** — A failed private fetch never leaks the token or corrupts existing lines.

Implementation: `apps/server/src/openings/opening-lichess-import.ts`

Repeatable comparison task: Preview and apply source changes in an expanded repertoire card. Competitor timing and our user-task timing remain unmeasured.

## CB10 — PGN export and round trip

**Import · P0 · existing**

Chessbook evidence: Repertoire settings exposes Export to PGN. [Chessbook guest app — direct UI audit](https://chessbook.com/)

Our feature description: Export chapters, nested branches, shorter terminal paths, comments and marks; reimport recovers the same playable content.

Acceptance criteria:

- **passed** — A shorter saved path survives export alongside longer continuations. Evidence: unit: preserves a shorter saved path when exporting a chapter with longer continuations.
- **unknown** — Export and reimport e4, d4 and Nf3 paths together.
- **passed** — Explain that PGN is content portability rather than a review-history backup. Evidence: unit: round trips the supplied Ruy Lopez study's nested variations and source highlight.

Implementation: `apps/server/src/openings/opening-pgn-export.ts`

Repeatable comparison task: Export and reimport e4, d4 and Nf3 paths together. Competitor timing and our user-task timing remain unmeasured.

## CB11 — Combine material and refresh sources

**Import · P0 · existing**

Chessbook evidence: Official description promotes combining opening sources. [Official Chessbook Android listing](https://play.google.com/store/apps/details?id=com.chessbook.android)

Our feature description: Merge changed source chapters by stable identities; keep locally added branches, archived lines, private notes and recall cards.

Acceptance criteria:

- **passed** — Source updates retain cards, notes, names and archives. Evidence: unit: merges nested variations, extends a source line and preserves cards, notes, names and archives.
- **passed** — Preview a source update before applying it. Evidence: browser/chromium: previews and applies source changes from an expanded repertoire card; browser/webkit: previews and applies source changes from an expanded repertoire card.
- **passed** — A stale preview or mid-merge failure leaves the previous graph intact. Evidence: unit: rejects stale, expired, wrong-target and unconfirmed previews without changing the graph.

Implementation: `apps/server/src/openings/opening-update-service.ts`

Repeatable comparison task: Preview a source update before applying it. Competitor timing and our user-task timing remain unmeasured.

## CB12 — Disable lines for practice

**Build · P0 · existing**

Chessbook evidence: A saved move has Disable control. [Chessbook guest app — direct UI audit](https://chessbook.com/)

Our feature description: Pause selected practice paths independently of deleting content; shared moves needed by enabled paths still practise.

Acceptance criteria:

- **passed** — Paused branches retain shared progress and exclude unique paused moves. Evidence: unit: defaults on, pauses a branch without hiding it, keeps shared moves and excludes unique paused moves.
- **passed** — Pause branches and inspect separate move recall and full-line recall. Evidence: browser/chromium: pauses branches without deleting them and distinguishes move recall from full-line runs; browser/webkit: pauses branches without deleting them and distinguishes move recall from full-line runs.
- **passed** — Practice selection is isolated between players. Evidence: unit: isolates player choices and preserves them through archive/restore and source import.

Implementation: `apps/server/src/openings/opening-practice-selection-service.ts`

Repeatable comparison task: Pause branches and inspect separate move recall and full-line recall. Competitor timing and our user-task timing remain unmeasured.

## CB13 — Exclude responses and set stopping points

**Coverage · P0 · partial**

Chessbook evidence: Opponent reply list offers Exclude specific moves. [Chessbook guest app — direct UI audit](https://chessbook.com/)

Our feature description: Deliberately leave replies unprepared or stop at a justified boundary; retain the reason and show excluded probability instead of silently renormalising.

Acceptance criteria:

- **passed** — Ideas and deliberate omissions remain separate outcomes. Evidence: unit: keeps ideas and deliberate omissions separate, without renormalising.
- **passed** — Choose and reverse a stopping point without changing saved lines. Evidence: browser/chromium: shows honest coverage, distinct recall and reversible stopping points without altering saved lines; browser/webkit: shows honest coverage, distinct recall and reversible stopping points without altering saved lines.
- **unknown** — A deliberate omission is never displayed as a saved response or learned move.

Implementation: `apps/server/src/openings/opening-preparation-service.ts`

Repeatable comparison task: Choose and reverse a stopping point without changing saved lines. Competitor timing and our user-task timing remain unmeasured.

## CB14 — Trim unnecessary moves

**Build · P2 · absent**

Chessbook evidence: Repertoire settings offers Trim unnecessary moves; destructive action not exercised. [Chessbook guest app — direct UI audit](https://chessbook.com/)

Our feature description: Preview branches below a selected practical reach threshold; archive approved candidates, with a recovery path and no removal of shared required moves.

Acceptance criteria:

- **unmet** — Preview identifies exactly which branches and notes are affected.
- **unmet** — Review and archive an unwanted branch, then restore it.
- **unmet** — Unknown frequency or shared membership prevents automatic trimming.

Implementation: No implementation identified.

Repeatable comparison task: Review and archive an unwanted branch, then restore it. Competitor timing and our user-task timing remain unmeasured.

## CB15 — Delete and reset repertoire content

**Build · P1 · existing**

Chessbook evidence: Repertoire settings exposes Delete; no deletion was performed. [Chessbook guest app — direct UI audit](https://chessbook.com/)

Our feature description: Support explicit line, repertoire and library removal with named targets, export access and transactional validation; keep imported games.

Acceptance criteria:

- **passed** — A failed library clear rolls back every targeted deletion. Evidence: unit: rolls back every repertoire deletion if clearing the library fails part-way through.
- **passed** — Delete the final line or library without losing games. Evidence: browser/chromium: deletes the final line and clears a confirmed library without losing games; browser/webkit: deletes the final line and clears a confirmed library without losing games.
- **unknown** — A changed target list is rejected before any destructive write.

Implementation: `apps/server/src/openings/opening-workspace-service.ts`

Repeatable comparison task: Delete the final line or library without losing games. Competitor timing and our user-task timing remain unmeasured.

## CB16 — Rating and platform context

**Coverage · P0 · partial**

Chessbook evidence: Settings has rating, platform and time control; default visible settings are inconsistent with slider until confirmed. [Chessbook guest app — direct UI audit](https://chessbook.com/)

Our feature description: Let the user set a rating band and its source; show the actual Lichess sample band instead of implying rating conversion that has not been established.

Acceptance criteria:

- **passed** — Player context persists and practical data can remain off. Evidence: unit: stores the player's practical opening context.
- **unknown** — Change level, save, reload and see the same sample band.
- **unknown** — A missing token or unknown mapping cannot produce claimed platform-specific statistics.

Implementation: `apps/server/src/openings/opening-preferences-service.ts`

Repeatable comparison task: Change level, save, reload and see the same sample band. Competitor timing and our user-task timing remain unmeasured.

## CB17 — Time-control selection for samples

**Coverage · P1 · implemented**

Chessbook evidence: Rating settings exposes Blitz time control. [Chessbook guest app — direct UI audit](https://chessbook.com/)

Our feature description: Select supported speeds and include them in explorer cache identity, coverage summaries and all sample citations.

Acceptance criteria:

- **passed** — Blitz and rapid requests use different cache keys. Evidence: unit: keeps blitz and rapid samples separate across fetches and cache reads.
- **unknown** — Change speed and see refreshed frequencies without losing the current board.
- **unknown** — A late response for the previous speed cannot replace the current sample.

Implementation: `apps/server/src/openings/opening-quality-preferences.ts`, `apps/server/src/openings/opening-explorer-service.ts`, `apps/web/src/use-opening-move-evidence.ts`, `apps/web/src/components/OpeningPlayerContext.tsx`

Repeatable comparison task: Change speed and see refreshed frequencies without losing the current board. Competitor timing and our user-task timing remain unmeasured.

## CB18 — Encounter-based coverage goal

**Coverage · P0 · improved**

Chessbook evidence: Settings offers practical reach thresholds from 1 in 150 through 1 in 800 games. [Chessbook completion documentation](https://wiki.chessbook.com/completion)

Our feature description: Choose a reach-probability target separately from depth. Check distinct saved-line policies across the repertoire, combining transpositions before applying the threshold. Show missing answers, uncertain evidence and unfinished work honestly; retain the selected-line view for scoped and personal-game diagnostics. Continue bounded saved-policy batches under one evidence snapshot and confirm completion only after all contiguous batches are checked.

Acceptance criteria:

- **passed** — Coverage threshold uses opponent path probabilities under an explicit learner policy. Evidence: unit: multiplies successive opponent probabilities rather than pooling sample counts; unit: checks both Black first-move responses together and keeps White alternatives separate; unit: combines variable-length transpositions before deciding a reply is rare.
- **passed** — Change target and inspect newly relevant gaps. Evidence: unit: changes relevant gaps at the exact encounter threshold using unrounded probabilities; browser/chromium: persists preparation goals and allows postponing, skipping and restoring tasks; browser/webkit: persists preparation goals and allows postponing, skipping and restoring tasks; unit: uses the encounter threshold without letting a skipped task count as preparation.
- **passed** — Unknown samples, checking limits, repeated positions and unassessed plans cannot confirm whole-repertoire completion. Evidence: unit: considers a useful thirteenth repertoire and does not confirm an unknown coverage goal; unit: never turns a safety cap or missing/stale/mismatched samples into completion; unit: does not turn unassessed plans into a whole-repertoire success; browser/chromium: checks the whole repertoire without treating unknown data or a checking limit as completion; browser/webkit: checks the whole repertoire without treating unknown data or a checking limit as completion; browser/chromium: discards an obsolete whole-repertoire success after the safety limit changes; browser/webkit: discards an obsolete whole-repertoire success after the safety limit changes; unit: confirms the repertoire only after every contiguous saved-plan batch; unit: rejects changed evidence, settings, out-of-order, duplicate and truncated batches; unit: binds continuation to sample content and freshness rather than cache delivery metadata; browser/chromium: continues saved-plan batches and refuses changed evidence instead of showing stale completion; browser/webkit: continues saved-plan batches and refuses changed evidence instead of showing stale completion.

Implementation: `apps/server/src/openings/opening-coverage-model.ts`, `apps/server/src/openings/opening-quality-preferences.ts`, `apps/web/src/components/OpeningPlayerContext.tsx`, `apps/web/src/components/OpeningCoveragePanel.tsx`, `apps/server/src/openings/opening-repertoire-goal.ts`, `apps/server/src/openings/opening-coverage-service.ts`, `apps/web/src/components/OpeningRepertoireGoalPanel.tsx`, `apps/web/src/opening-goal-pages.ts`

Repeatable comparison task: Change target and inspect newly relevant gaps. Competitor timing and our user-task timing remain unmeasured.

## CB19 — Honest coverage calculation

**Coverage · P0 · existing**

Chessbook evidence: Completion documentation follows saved learner choices and multiplies opponent probabilities. [Chessbook completion documentation](https://wiki.chessbook.com/completion)

Our feature description: Separate prepared paths, missing responses, idea-only, deliberately unprepared and unknown; make chosen route, horizon and sample provenance visible. Show per-reply personal-game counts and empirical prepared coverage independently of Lichess sample probabilities; a single real missing reply is evidenced even without a global frequency sample.

Acceptance criteria:

- **passed** — Personal and Lichess frequencies retain independent sample denominators. Evidence: unit: retains independent Lichess denominators when both sources exist.
- **passed** — Inspect coverage explanations and reverse boundaries. Evidence: browser/chromium: shows honest coverage, distinct recall and reversible stopping points without altering saved lines; browser/webkit: shows honest coverage, distinct recall and reversible stopping points without altering saved lines.
- **passed** — A saved opponent move without a learner reply is not prepared coverage. Evidence: unit: does not count a saved opponent move without our response.

Implementation: `apps/server/src/openings/opening-coverage-model.ts`

Repeatable comparison task: Inspect coverage explanations and reverse boundaries. Competitor timing and our user-task timing remain unmeasured.

## CB20 — Find the biggest useful gap

**Coverage · P0 · enhanced**

Chessbook evidence: Build screens offer biggest-gap and next-gap navigation. [Chessbook guest app — direct UI audit](https://chessbook.com/)

Our feature description: Rank replies by reliable practical evidence and actual personal encounters; open the matching board with a direct path to prepare or practise it.

Acceptance criteria:

- **passed** — Choose personal preparation gaps independently of the repertoire selected for memory practice. Evidence: unit: finds a game-based preparation gap independently of a different recommended practice repertoire.
- **passed** — Show and open game-based preparation recommendations even with Lichess frequencies off. Evidence: browser/chromium: shows game-based preparation recommendations even with Lichess frequencies off; browser/webkit: shows game-based preparation recommendations even with Lichess frequencies off.
- **unknown** — If frequency is unavailable, label uncertainty rather than inventing a biggest probability gap.

Implementation: `apps/server/src/openings/opening-preparation-policy.ts`

Repeatable comparison task: Inspect a covered reply in its saved branch without creating duplicates. Competitor timing and our user-task timing remain unmeasured.

## CB21 — Engine move comparison

**Analysis · P0 · existing**

Chessbook evidence: Build view shows Eval; official docs specify precomputed Stockfish analysis. [Chessbook engine evaluations documentation](https://wiki.chessbook.com/evaluations)

Our feature description: Show legal Stockfish candidates with explicit perspective, search depth and mate units; cache compatible requests and keep editing usable if analysis fails.

Acceptance criteria:

- **passed** — Current-position local analysis is cached and exposes legal moves. Evidence: unit: serves cached local analysis and current-position practical moves for the opening studio.
- **passed** — Use the analysis board without writing unsaved variations. Evidence: browser/chromium: builds with automatic saves, retry safety and one board with an optional unsaved exploration mode; browser/webkit: builds with automatic saves, retry safety and one board with an optional unsaved exploration mode.
- **unknown** — Measured warm-cache response is below 500ms and failed engine requests stay local to analysis.

Implementation: `apps/server/src/openings/opening-analysis-service.ts`

Repeatable comparison task: Use the analysis board without writing unsaved variations. Competitor timing and our user-task timing remain unmeasured.

## CB22 — Master-game move statistics

**Analysis · P1 · absent**

Chessbook evidence: Build table includes Masters alongside Eval and Peer results. [Chessbook guest app — direct UI audit](https://chessbook.com/)

Our feature description: Offer master-database popularity and results beside practical samples, with independent denominators, source and date.

Acceptance criteria:

- **unmet** — Master and rating-band samples use distinct schemas and cache keys.
- **unmet** — Compare the same position in the master and practical databases.
- **unmet** — Empty samples display unknown rather than 0% popularity.

Implementation: No implementation identified.

Repeatable comparison task: Compare the same position in the master and practical databases. Competitor timing and our user-task timing remain unmeasured.

## CB23 — Practical results at the player level

**Analysis · P0 · existing**

Chessbook evidence: Build view shows peer results next to each candidate. [Chessbook guest app — direct UI audit](https://chessbook.com/)

Our feature description: Show win, draw and loss counts and expected score for the selected side, accompanied by sample size and stale-data warnings.

Acceptance criteria:

- **passed** — Explorer responses retain the current position and practical moves. Evidence: unit: serves cached local analysis and current-position practical moves for the opening studio.
- **passed** — Change a rating and ignore the older delayed response. Evidence: browser/chromium: discards an older coverage request when the selected rating changes; browser/webkit: discards an older coverage request when the selected rating changes.
- **unknown** — A small sample is not presented as a predicted personal win rate.

Implementation: `apps/server/src/openings/opening-explorer-service.ts`

Repeatable comparison task: Change a rating and ignore the older delayed response. Competitor timing and our user-task timing remain unmeasured.

## CB24 — Repertoire effectiveness assessment

**Quality · P1 · absent**

Chessbook evidence: Official docs describe reach-weighted practical results with rating-specific calibration. [Chessbook repertoire statistics documentation](https://wiki.chessbook.com/repertoire-statistics)

Our feature description: Provide an independently defined practical-results report with uncertainty and sample support; never copy Chessbook calibration constants or call results a personal forecast.

Acceptance criteria:

- **unmet** — Learner perspective and draws are handled correctly.
- **unmet** — Inspect the sample and path contribution behind each result.
- **unmet** — If data is insufficient, expose unknown and exclude unsupported paths from confidence claims.

Implementation: No implementation identified.

Repeatable comparison task: Inspect the sample and path contribution behind each result. Competitor timing and our user-task timing remain unmeasured.

## CB25 — Repertoire soundness assessment

**Quality · P1 · absent**

Chessbook evidence: Official docs aggregate path concession and critical risky routes. [Chessbook repertoire statistics documentation](https://wiki.chessbook.com/repertoire-statistics)

Our feature description: Show engine concessions along saved routes using compatible engine settings and a clear worst-path view; compare gambit risk with practical aims.

Acceptance criteria:

- **unmet** — Sign, mate scores and engine budgets remain compatible across positions.
- **unmet** — Open the route contributing most to objective concessions.
- **unmet** — Do not manufacture a 1–99 parity score from a different engine or search budget.

Implementation: No implementation identified.

Repeatable comparison task: Open the route contributing most to objective concessions. Competitor timing and our user-task timing remain unmeasured.

## CB26 — Learnability assessment

**Quality · P1 · partial**

Chessbook evidence: Official docs use a model trained on user recall mistakes and positional similarity. [Chessbook repertoire statistics documentation](https://wiki.chessbook.com/repertoire-statistics)

Our feature description: Use this player’s first-try recall, hint use, depth and repeated mistakes as transparent difficulty evidence; mark untested moves unknown rather than pretending to reproduce their AI.

Acceptance criteria:

- **passed** — First-encounter evidence excludes retries and includes corrected failures. Evidence: unit: counts first encounters and includes corrected full runs in the recall denominator.
- **passed** — Compare tested-move evidence with complete-line recall. Evidence: browser/chromium: pauses branches without deleting them and distinguishes move recall from full-line runs; browser/webkit: pauses branches without deleting them and distinguishes move recall from full-line runs.
- **unknown** — A new or sparsely tested line must not be called easy or mastered.

Implementation: `apps/server/src/openings/opening-recall.ts`

Repeatable comparison task: Compare tested-move evidence with complete-line recall. Competitor timing and our user-task timing remain unmeasured.

## CB27 — Autofill repertoire gaps

**Build · P1 · absent**

Chessbook evidence: Official docs describe drafting then whole-repertoire refinement; live control was not executed. [Chessbook autofill documentation](https://wiki.chessbook.com/autofill)

Our feature description: Generate a bounded, reviewable draft around user-authored choices using supported engine and sample data; require preview, explicit apply, provenance and cancellation.

Acceptance criteria:

- **unmet** — Existing authored moves and notes are never replaced.
- **unmet** — Preview a single gap and a bounded full build before saving.
- **unmet** — Same inputs and source snapshots give reproducible output; cancellation and failed data leave saved content intact.

Implementation: No implementation identified.

Repeatable comparison task: Preview a single gap and a bounded full build before saving. Competitor timing and our user-task timing remain unmeasured.

## CB28 — Autofill style preferences

**Build · P2 · absent**

Chessbook evidence: Official docs allocate style between practical results, soundness and learnability. [Chessbook autofill documentation](https://wiki.chessbook.com/autofill)

Our feature description: Provide transparent weighting of supported objectives; describe trade-offs and display the actual formula and unavailable inputs.

Acceptance criteria:

- **unmet** — Each objective weight changes a controlled fixture as documented.
- **unmet** — Compare two proposed styles without editing the saved repertoire.
- **unmet** — Missing objectives are not silently treated as zero or renormalised without disclosure.

Implementation: No implementation identified.

Repeatable comparison task: Compare two proposed styles without editing the saved repertoire. Competitor timing and our user-task timing remain unmeasured.

## CB29 — Undo generated repertoire moves

**Build · P1 · absent**

Chessbook evidence: Settings includes Remove autofilled moves; docs promise authored moves remain. [Chessbook autofill documentation](https://wiki.chessbook.com/autofill)

Our feature description: Record generated batches separately and let the user undo only an identified batch while retaining authored content and any shared nodes still required.

Acceptance criteria:

- **unmet** — Batch provenance distinguishes generated from authored content.
- **unmet** — Undo a draft batch and confirm authored branches remain.
- **unmet** — User-edited generated nodes are protected or explicitly reviewed before removal.

Implementation: No implementation identified.

Repeatable comparison task: Undo a draft batch and confirm authored branches remain. Competitor timing and our user-task timing remain unmeasured.

## CB30 — FSRS spaced repetition

**Practice · P0 · enhanced**

Chessbook evidence: Official docs identify FSRS and shared move review histories. [Chessbook spaced repetition documentation](https://wiki.chessbook.com/spaced-repetition)

Our feature description: Schedule per-position and explicit-response recall, distinguish assistance from independent success, and avoid multiplying reviews for retries.

Acceptance criteria:

- **passed** — First success schedules a later review and failure schedules relearning. Evidence: unit: schedules a first successful recall for the next day.
- **passed** — A later same-session retry keeps the first review outcome, memory cards, activity credit and next review date unchanged. Evidence: browser/chromium: persists relaxed practice and pauses only after the saved move is found; browser/webkit: persists relaxed practice and pauses only after the saved move is found; unit: keeps the scheduled review and activity unchanged after an extra retry (correct=true); unit: keeps the scheduled review and activity unchanged after an extra retry (correct=false).
- **passed** — Historical progress remains after source edits and process restart. Evidence: unit: merges nested variations, extends a source line and preserves cards, notes, names and archives.

Implementation: `apps/server/src/openings/opening-review-scheduler.ts`

Repeatable comparison task: Retry a mistaken move without relabelling the first attempt as successful. Competitor timing and our user-task timing remain unmeasured.

## CB31 — Shared progress across repertoires

**Practice · P1 · partial**

Chessbook evidence: Official docs state equivalent moves share progress even between repertoires. [Chessbook spaced repetition documentation](https://wiki.chessbook.com/spaced-repetition)

Our feature description: Keep graph sharing within a repertoire; add cross-repertoire recall sharing only when side, position, target and source context are unambiguous.

Acceptance criteria:

- **unknown** — The same recalled position in two repertoires does not need duplicate scheduling.
- **unknown** — Review one repertoire and inspect equivalent recall in another.
- **unknown** — Alternative responses and different players never inherit false success.

Implementation: `apps/server/src/openings/opening-review-service.ts`

Repeatable comparison task: Review one repertoire and inspect equivalent recall in another. Competitor timing and our user-task timing remain unmeasured.

## CB32 — Individual moves and complete lines

**Practice · P0 · existing**

Chessbook evidence: Practice settings offers individual moves and complete lines every time or once per session. [Chessbook guest app — direct UI audit](https://chessbook.com/)

Our feature description: Provide scheduled recall and continuous full-line practice with bounded depth, branch variety, repeat and next enabled line.

Acceptance criteria:

- **passed** — Full-line evidence is distinct from partial drills and hints. Evidence: unit: distinguishes full-line unaided runs from partial drills, hints and shared move recall.
- **passed** — Play a whole line without automatic explanations or Continue buttons. Evidence: browser/chromium: plays a complete line without automatic explanations or Continue buttons; browser/webkit: plays a complete line without automatic explanations or Continue buttons.
- **unknown** — Changing paths invalidates old exact-line evidence without deleting recorded attempts.

Implementation: `apps/server/src/openings/opening-review-service.ts`

Repeatable comparison task: Play a whole line without automatic explanations or Continue buttons. Competitor timing and our user-task timing remain unmeasured.

## CB33 — Sound alternatives versus recall errors

**Practice · P0 · partial**

Chessbook evidence: Soft-fail docs separate sound unsaved moves from chess errors and terminal alternatives. [Chessbook soft fails documentation](https://wiki.chessbook.com/soft-fails)

Our feature description: Grade repertoire recall independently from chess quality; allow a supported engine judgment on sound alternatives without granting recalled-move credit.

Acceptance criteria:

- **passed** — An unsaved move cannot count as remembered repertoire content. Evidence: unit: records an unassisted off-repertoire move as a lapse.
- **unknown** — Play a sound alternative and see separate chess-quality and recall feedback.
- **unknown** — A failed or shallow engine evaluation cannot label the move a blunder.

Implementation: `apps/server/src/openings/opening-review-service.ts`

Repeatable comparison task: Play a sound alternative and see separate chess-quality and recall feedback. Competitor timing and our user-task timing remain unmeasured.

## CB34 — Hints and first exposure

**Practice · P0 · enhanced**

Chessbook evidence: First guest practice shows a reminder arrow and Skip first practice. [Chessbook guest app — direct UI audit](https://chessbook.com/)

Our feature description: Offer an explicit learn-first batch: show each new move and its saved explanation, require execution, persist the stage, then return to hidden-answer recall. Demonstrations earn no review or activity credit. Retain idea, piece and answer help during recall and preserve that assistance across reload. Select unseen responses individually, including alternatives at an already-reviewed position; bound the batch and test each taught response explicitly.

Acceptance criteria:

- **passed** — Idea help persists and assisted moves do not count as independent recall. Evidence: unit: persists practice preferences and idea help without claiming an independent recall; unit: persists three demonstrations before recall without earning review or activity credit; unit: keeps recalled help separate from the earlier demonstration after reload; unit: teaches bounded exact alternatives and keeps untaught responses available after the position is reviewed; unit: deduplicates shared responses and excludes paused and archived alternatives from teaching.
- **passed** — Use an idea hint without exposing the answer and retain help after reload. Evidence: browser/chromium: uses optional idea hints without revealing a square, and keeps that assistance after reload; browser/webkit: uses optional idea hints without revealing a square, and keeps that assistance after reload; browser/chromium: teaches three new moves before hidden recall and resumes the saved learning stage; browser/webkit: teaches three new moves before hidden recall and resumes the saved learning stage; browser/chromium: teaches both saved alternatives and asks for the taught response without claiming a chess blunder; browser/webkit: teaches both saved alternatives and asks for the taught response without claiming a chess blunder.
- **passed** — Demonstrations require the shown move; wrong attempts and alternate endpoints cannot earn recall credit or skip ahead. Evidence: unit: teaches new opening decisions without counting assisted moves as remembered; unit: rejects wrong demonstrations and recall/help bypasses without mutating memory; unit: retries an acknowledged demonstration without advancing a second move; unit: isolates exposure stages by player and rejects replaced sessions; unit: identifies taught alternatives by order without revealing the recall answer.

Implementation: `apps/web/src/components/OpeningReview.tsx`, `apps/server/src/openings/opening-review-service.ts`, `apps/server/src/openings/opening-review-routes.ts`, `migrations/036_opening_first_exposure.sql`, `apps/server/src/openings/opening-first-exposure.ts`

Repeatable comparison task: Use an idea hint without exposing the answer and retain help after reload. Competitor timing and our user-task timing remain unmeasured.

## CB35 — Pacing and pause policy

**Practice · P1 · existing**

Chessbook evidence: Settings offers never, always, errors, and notes pauses. [Chessbook guest app — direct UI audit](https://chessbook.com/)

Our feature description: Offer normal or relaxed feedback and deliberate pauses after mistakes, notes or every move; exclude pauses and hidden time from response timing.

Acceptance criteria:

- **passed** — Timed attempts reject invalid and stale requests. Evidence: unit: records active recall time and rejects stale or invalid timed attempts.
- **passed** — Reading notes and hidden-tab time do not inflate recall time. Evidence: browser/chromium: excludes reading notes and hidden-tab time from the next recall; browser/webkit: excludes reading notes and hidden-tab time from the next recall.
- **unknown** — Manual pause survives reload and is not conflated with automatic feedback pause.

Implementation: `apps/web/src/recall-clock.ts`

Repeatable comparison task: Reading notes and hidden-tab time do not inflate recall time. Competitor timing and our user-task timing remain unmeasured.

## CB36 — Recommended short sessions

**Practice · P0 · enhanced**

Chessbook evidence: Recommended-move docs select due moves with a daily goal, commonness and coherent paths. [Chessbook recommended moves documentation](https://wiki.chessbook.com/recommended-moves)

Our feature description: Offer small coherent batches from game misses, due work and bounded new material; size the next batch to the remaining daily target. Keep recommended next steps visible and explain empty, paused and goal-complete states. Preparation recommendations can come from a different repertoire than the practice session. Offer an explicit teach-first action for available new responses from home, within the remaining daily goal, while keeping due reviews and game misses ahead of new learning.

Acceptance criteria:

- **passed** — A recommended queue combines game misses, due work and limited new moves. Evidence: unit: sizes recommended batches to the remaining goal and leaves extra practice available; unit: offers recommended teaching within the remaining goal and keeps urgent reviews first.
- **passed** — Start a session after setting a goal and complete only the remaining practice. Evidence: browser/chromium: tracks the daily goal, streak and activity without inflating unaided recall; browser/webkit: tracks the daily goal, streak and activity without inflating unaided recall; browser/chromium: offers learn-first from the home recommendation without changing normal practice; browser/webkit: offers learn-first from the home recommendation without changing normal practice.
- **passed** — Paused-only moves and completed daily targets do not appear in automatic queues. Evidence: unit: does not add paused alternatives to shared-response practice.

Implementation: `apps/server/src/openings/opening-review-service.ts`

Repeatable comparison task: Start a session after setting a goal and complete only the remaining practice. Competitor timing and our user-task timing remain unmeasured.

## CB37 — Daily practice goal

**Practice · P0 · implemented**

Chessbook evidence: Settings exposes a daily goal, default 10 moves. [Chessbook guest app — direct UI audit](https://chessbook.com/)

Our feature description: Set 1–50 completed scheduled encounters per day in a validated time zone; preserve settings, show remaining work and allow optional extra practice.

Acceptance criteria:

- **passed** — Goal and time zone persist; omitted fields preserve values; invalid values change nothing. Evidence: unit: persists goal and time zone, preserves omitted settings, and rejects invalid input without changes.
- **passed** — Complete the goal with help and see practice credit separately from independent recall. Evidence: browser/chromium: tracks the daily goal, streak and activity without inflating unaided recall; browser/webkit: tracks the daily goal, streak and activity without inflating unaided recall.
- **passed** — Local midnight and time-zone changes produce correct daily buckets. Evidence: unit: uses local calendar days across midnight, daylight saving and fractional-hour zones.

Implementation: `apps/server/src/openings/opening-activity-service.ts`

Repeatable comparison task: Complete the goal with help and see practice credit separately from independent recall. Competitor timing and our user-task timing remain unmeasured.

## CB38 — Practice streak

**Practice · P1 · implemented**

Chessbook evidence: Guest home displays a streak indicator. [Chessbook guest app — direct UI audit](https://chessbook.com/)

Our feature description: Count consecutive local days with completed scheduled practice, keep yesterday’s streak while today is still open, and never imply a streak proves mastery.

Acceptance criteria:

- **passed** — Yesterday’s consecutive practice is retained today and resets after a missed day. Evidence: unit: keeps yesterday's streak available today and resets it after a missed day.
- **passed** — Show the current streak after a completed encounter and after reload. Evidence: browser/chromium: tracks the daily goal, streak and activity without inflating unaided recall; browser/webkit: tracks the daily goal, streak and activity without inflating unaided recall.
- **passed** — Assisted effort is allowed, but retries and lapse repeats cannot manufacture extra daily credit. Evidence: unit: counts completed scheduled encounters once and keeps assistance separate from recall.

Implementation: `apps/server/src/openings/opening-activity-service.ts`

Repeatable comparison task: Show the current streak after a completed encounter and after reload. Competitor timing and our user-task timing remain unmeasured.

## CB39 — Daily activity and recall history

**Practice · P1 · implemented**

Chessbook evidence: Chessbook exposes daily tasks and mastery; a daily history chart was not inspected. Audit-driven independent improvement

Our feature description: Show 28 local calendar days of practice and independent recall, a compact seven-day home view, and plain definitions. This is our audit-driven extension.

Acceptance criteria:

- **passed** — Scheduled encounters count once; assisted and corrected answers remain separate. Evidence: unit: counts completed scheduled encounters once and keeps assistance separate from recall.
- **passed** — A seven-day practice history remains visible after reload. Evidence: browser/chromium: tracks the daily goal, streak and activity without inflating unaided recall; browser/webkit: tracks the daily goal, streak and activity without inflating unaided recall.
- **passed** — History and targets are isolated by player profile. Evidence: unit: isolates practice activity and daily targets for each player.

Implementation: `apps/server/src/openings/opening-activity-service.ts`

Repeatable comparison task: A seven-day practice history remains visible after reload. Competitor timing and our user-task timing remain unmeasured.

## CB40 — Model-game learning

**Study · P1 · absent**

Chessbook evidence: Guest model game matches saved opening moves and supports next move, hint, random and history. [Chessbook guest app — direct UI audit](https://chessbook.com/)

Our feature description: Find a relevant legitimately sourced model game for a saved route; allow guided replay or guess-the-move with plan notes and independent history.

Acceptance criteria:

- **unmet** — Source, players, ratings, date and legal full game are retained.
- **unmet** — Play through a model game or guess the continuation without changing repertoire recall.
- **unmet** — Missing games and unavailable providers show explicit empty and retry states.

Implementation: No implementation identified.

Repeatable comparison task: Play through a model game or guess the continuation without changing repertoire recall. Competitor timing and our user-task timing remain unmeasured.

## CB41 — Master and online model-game sources

**Study · P2 · absent**

Chessbook evidence: Settings offers high-level online, master, or both sources. [Chessbook guest app — direct UI audit](https://chessbook.com/)

Our feature description: Let users filter model-game source and display selection criteria; do not describe user-imported wins as engine-verified models without evidence.

Acceptance criteria:

- **unmet** — Source filters alter available candidates consistently.
- **unmet** — Switch sources while preserving a saved study session.
- **unmet** — An empty filtered pool does not substitute an unrelated game.

Implementation: No implementation identified.

Repeatable comparison task: Switch sources while preserving a saved study session. Competitor timing and our user-task timing remain unmeasured.

## CB42 — Lichess game connection

**Games · P0 · partial**

Chessbook evidence: Connected accounts offers Lichess and promises automatic checks. [Chessbook guest app — direct UI audit](https://chessbook.com/)

Our feature description: Incrementally fetch authorised games, retain sync cursor and duplicates, then compare openings locally; disclose whether sync is manual or automatic.

Acceptance criteria:

- **passed** — Connected Lichess games enter the normal queue incrementally. Evidence: unit: connects and incrementally imports public Lichess games through the normal analysis queue.
- **unknown** — Connect or inspect an existing account and request game refresh without duplicates.
- **unknown** — Token failures retain previous games and never expose credentials in client output.

Implementation: `apps/server/src/imports/lichess-sync-service.ts`

Repeatable comparison task: Connect or inspect an existing account and request game refresh without duplicates. Competitor timing and our user-task timing remain unmeasured.

## CB43 — Chess.com game connection

**Games · P1 · absent**

Chessbook evidence: Connected accounts and import menus both offer Chess.com. [Chessbook guest app — direct UI audit](https://chessbook.com/)

Our feature description: Use supported public archive APIs for a chosen username; track month cursors, colour, deduplication and import errors.

Acceptance criteria:

- **unmet** — Repeated month imports do not duplicate games.
- **unmet** — Import a chosen player’s supported archive and inspect matched openings.
- **unmet** — Private or unavailable accounts show a supported limitation without scraping hidden data.

Implementation: No implementation identified.

Repeatable comparison task: Import a chosen player’s supported archive and inspect matched openings. Competitor timing and our user-task timing remain unmeasured.

## CB44 — Played games contribute recall evidence

**Games · P1 · absent**

Chessbook evidence: Connected-account UI promises correct game moves count as practice. [Chessbook guest app — direct UI audit](https://chessbook.com/)

Our feature description: Keep game-play evidence separate from deliberate recall; define when clocks, assistance uncertainty and correspondence games make credit unreliable.

Acceptance criteria:

- **unmet** — Game credit has distinct provenance and is idempotent.
- **unmet** — Inspect game-derived practice separately from scheduled recall.
- **unmet** — Unverified game conditions cannot inflate unaided memory accuracy.

Implementation: No implementation identified.

Repeatable comparison task: Inspect game-derived practice separately from scheduled recall. Competitor timing and our user-task timing remain unmeasured.

## CB45 — Repair opening mistakes from games

**Games · P0 · existing**

Chessbook evidence: Home offers correction of opening mistakes for connected accounts. [Chessbook guest app — direct UI audit](https://chessbook.com/)

Our feature description: Group actual player deviations, keep opponent surprises separate, locate the source game and practise or prepare the exact position.

Acceptance criteria:

- **passed** — A game deviation maps to its exact repertoire review position. Evidence: unit: connects a game deviation to its exact repertoire review position.
- **passed** — A pasted-game miss links to the source game after the answer. Evidence: browser/chromium: links a pasted-game miss to its source game only after the answer; browser/webkit: links a pasted-game miss to its source game only after the answer.
- **passed** — An opponent leaving the repertoire is not called the player’s mistake. Evidence: unit: does not blame the player when the opponent leaves the repertoire first.

Implementation: `apps/server/src/openings/opening-game-service.ts`

Repeatable comparison task: A pasted-game miss links to the source game after the answer. Competitor timing and our user-task timing remain unmeasured.

## CB46 — Performance by opening

**Games · P1 · partial**

Chessbook evidence: Home offers View performance by opening; connected view not accessed. [Chessbook guest app — direct UI audit](https://chessbook.com/)

Our feature description: Group the user’s games by matched opening route and side, with W/D/L, sample size, deviation rates and source links.

Acceptance criteria:

- **unknown** — Each game is counted once with the player’s result perspective.
- **unknown** — Open an opening’s results and inspect contributing games.
- **unknown** — Small samples and unanalysed games are disclosed; no causal claims about an opening.

Implementation: `apps/server/src/openings/opening-game-service.ts`

Repeatable comparison task: Open an opening’s results and inspect contributing games. Competitor timing and our user-task timing remain unmeasured.

## CB47 — Board themes

**Experience · P2 · absent**

Chessbook evidence: Board appearance lists Chessbook, Lichess, Chess.com and Anarchy. [Chessbook guest app — direct UI audit](https://chessbook.com/)

Our feature description: Offer independently styled high-contrast boards and pieces, with persistent settings; retain coordinates and target sizes.

Acceptance criteria:

- **unmet** — Theme settings persist per player or device as documented.
- **unmet** — Switch theme and keep the current board and focus.
- **unmet** — Every supported theme passes contrast and touch-target checks.

Implementation: No implementation identified.

Repeatable comparison task: Switch theme and keep the current board and focus. Competitor timing and our user-task timing remain unmeasured.

## CB48 — Sounds and haptics

**Experience · P2 · existing**

Chessbook evidence: Settings contains separate sound and haptics controls. [Chessbook guest app — direct UI audit](https://chessbook.com/)

Our feature description: Provide optional restrained board feedback and graceful unsupported-device behaviour; separate controls can follow later.

Acceptance criteria:

- **passed** — Board-feedback preference persists without affecting recall. Evidence: unit: persists practice preferences and idea help without claiming an independent recall.
- **unknown** — Enable feedback in settings and practise on a supported device.
- **unknown** — Reduced-motion and device limitations do not prevent a move.

Implementation: `apps/web/src/components/OpeningPlayerContext.tsx`

Repeatable comparison task: Enable feedback in settings and practise on a supported device. Competitor timing and our user-task timing remain unmeasured.

## CB49 — Animation preference

**Experience · P2 · partial**

Chessbook evidence: Settings exposes normal animation speed. [Chessbook guest app — direct UI audit](https://chessbook.com/)

Our feature description: Retain reduced-motion support and offer adjustable animation separately from recall timers; moves remain interactive only when valid.

Acceptance criteria:

- **unknown** — Board display and timing are independently controlled.
- **passed** — Resize or scroll during feedback without losing lower ranks. Evidence: browser/chromium: keeps practice help below the board and lower ranks reachable when scrolling or resizing; browser/webkit: keeps practice help below the board and lower ranks reachable when scrolling or resizing.
- **unknown** — Reduced-motion mode never waits on a visual animation to proceed.

Implementation: `apps/web/src/components/ChessBoard.tsx`

Repeatable comparison task: Resize or scroll during feedback without losing lower ranks. Competitor timing and our user-task timing remain unmeasured.

## CB50 — Responsive web and native availability

**Experience · P0 · partial**

Chessbook evidence: Guest web works and official stores list iOS and Android apps. [Official Chessbook Android listing](https://play.google.com/store/apps/details?id=com.chessbook.android)

Our feature description: Provide a responsive web experience on desktop, mobile and tablet first; track native packaging and device sync as separate optional work.

Acceptance criteria:

- **unknown** — No horizontal overflow at supported mobile and tablet widths.
- **passed** — Complete a first-move branch and recall session on mobile WebKit. Evidence: browser/chromium: builds a Black response to a different first move in the same repertoire; browser/webkit: builds a Black response to a different first move in the same repertoire.
- **unknown** — Saved work and keyboard navigation remain usable while optional summaries fail.

Implementation: `apps/web/src/styles.css`

Repeatable comparison task: Complete a first-move branch and recall session on mobile WebKit. Competitor timing and our user-task timing remain unmeasured.

## CB51 — Accounts and cross-device sync

**Platform · P2 · absent**

Chessbook evidence: Guest header offers log in and sign up; account creation and sync were not exercised. [Chessbook guest app — direct UI audit](https://chessbook.com/)

Our feature description: Preserve local profiles and portable backups now; design opt-in authenticated cross-device sync with conflict recovery before exposing data beyond self-hosting.

Acceptance criteria:

- **unmet** — Identity and access boundaries are defined and tested.
- **unmet** — Edit on two devices, reconcile a conflict and recover saved content.
- **unmet** — No account, credential or public sharing is created automatically.

Implementation: No implementation identified.

Repeatable comparison task: Edit on two devices, reconcile a conflict and recover saved content. Competitor timing and our user-task timing remain unmeasured.

## CB52 — Subscription and plan limits

**Platform · P2 · not_targeted**

Chessbook evidence: Settings offers upgrade for unlimited moves; official Android listing describes a free move cap. [Official Chessbook Android listing](https://play.google.com/store/apps/details?id=com.chessbook.android)

Our feature description: Keep the personal self-hosted tool free of repertoire move caps. Record vendor billing as a benchmark context, not a feature to add without a commercial requirement.

Acceptance criteria:

- **excluded** — No arbitrary move cap is enforced in the self-hosted repertoire.
- **excluded** — Build or import a large repertoire on supported hardware.
- **excluded** — Billing remains outside implementation until the user chooses a commercial product.

Implementation: No implementation identified.

Repeatable comparison task: Build or import a large repertoire on supported hardware. Competitor timing and our user-task timing remain unmeasured.

## CB53 — Reset learning separately from content

**Practice · P2 · absent**

Chessbook evidence: Settings exposes Reset all learning; destructive action not exercised. [Chessbook guest app — direct UI audit](https://chessbook.com/)

Our feature description: Preview a profile-specific recall reset that retains repertoire content and other players’ progress; provide a backup and explicit confirmation.

Acceptance criteria:

- **unmet** — Only the selected profile’s review state is reset.
- **unmet** — Confirm a reset and still browse every saved line and note.
- **unmet** — A changed target or failed reset is transactional and recoverable.

Implementation: No implementation identified.

Repeatable comparison task: Confirm a reset and still browse every saved line and note. Competitor timing and our user-task timing remain unmeasured.

## CB54 — Help and feedback paths

**Experience · P2 · partial**

Chessbook evidence: Guest home offers Discord, feedback and referral links. [Chessbook guest app — direct UI audit](https://chessbook.com/)

Our feature description: Provide useful local help and instructions for reporting a reproducible issue; share no user game, token or report automatically.

Acceptance criteria:

- **unknown** — Feature definitions and troubleshooting match shipped behaviour.
- **unknown** — Find instructions from the relevant settings or empty state.
- **unknown** — Sending feedback is a deliberate user action.

Implementation: `README.md`

Repeatable comparison task: Find instructions from the relevant settings or empty state. Competitor timing and our user-task timing remain unmeasured.

## CB55 — Guest onboarding and empty states

**Experience · P0 · existing**

Chessbook evidence: Guest app starts with a small sample repertoire and no signup requirement. [Chessbook guest app — direct UI audit](https://chessbook.com/)

Our feature description: Allow local use without signup; explain build/import choices and retain an intentionally empty library after restart.

Acceptance criteria:

- **passed** — Fresh production startup does not silently restore starter content. Evidence: unit: starts with an empty opening library without silently restoring starter repertoires.
- **passed** — Recover a draft after refresh without changing saved repertoires. Evidence: browser/chromium: recovers an unfinished board draft after refresh without changing saved repertoires; browser/webkit: recovers an unfinished board draft after refresh without changing saved repertoires.
- **unknown** — An empty or failed optional summary offers a meaningful next action.

Implementation: `apps/web/src/components/OpeningBoardBuilder.tsx`

Repeatable comparison task: Recover a draft after refresh without changing saved repertoires. Competitor timing and our user-task timing remain unmeasured.

## CB56 — Guided understanding before recall

**Study · P0 · existing**

Chessbook evidence: Guest first exposure includes explanatory notes; model games illustrate plans. [Chessbook guest app — direct UI audit](https://chessbook.com/)

Our feature description: Teach move purpose, opponent ideas and plans in a separate optional guided mode; recall does not automatically display the answer or explanation.

Acceptance criteria:

- **passed** — New assisted decisions are not counted as remembered. Evidence: unit: teaches new opening decisions without counting assisted moves as remembered.
- **passed** — Play a complete line while explanations stay hidden until requested. Evidence: browser/chromium: plays a complete line without automatic explanations or Continue buttons; browser/webkit: plays a complete line without automatic explanations or Continue buttons.
- **unknown** — Source notes, personal hints and full answers have distinct roles.

Implementation: `apps/web/src/components/OpeningExplanation.tsx`

Repeatable comparison task: Play a complete line while explanations stay hidden until requested. Competitor timing and our user-task timing remain unmeasured.

## CB57 — Turn-aware move arrows while building

**Build · P0 · implemented**

Chessbook evidence: User-requested independent extension; not asserted to duplicate a Chessbook board-arrow feature. Audit-driven independent improvement

Our feature description: On the repertoire learner’s turn draw the leading legal Stockfish candidate in green; on the opponent’s turn draw up to three frequent legal Lichess replies in blue, ranked by sample counts. Explain data source and depth; allow hiding; never display guidance during recall.

Acceptance criteria:

- **passed** — Rank opponent replies by frequency, not engine strength, using the repertoire side. Evidence: unit: ranks three opponent replies by sample frequency rather than engine strength; unit: uses the repertoire side rather than fixed white and black roles.
- **passed** — Draw, hide and restore arrows in a real builder, then remove them on leaving edit mode. Evidence: browser/chromium: draws our strongest move and the three most frequent opponent replies while building; browser/webkit: draws our strongest move and the three most frequent opponent replies while building.
- **passed** — Reject stale, small, mismatched and illegal suggestions without inventing a third reply. Evidence: unit: rejects stale, small, wrong-position and wrong-rating samples; unit: never draws an illegal move or fabricates a third reply from too few observations.

Implementation: `apps/web/src/opening-build-guidance.ts`, `apps/web/src/use-opening-move-evidence.ts`, `apps/web/src/components/ChessBoard.tsx`

Repeatable comparison task: Build a repertoire move and inspect three likely opponent replies; hide arrows and leave editing. Competitor timing and our user-task timing remain unmeasured.

## Sources

- **UI** [Chessbook guest app — direct UI audit](https://chessbook.com/); Guest browser inspection; checked 2026-10-14. Limit: Account connections, paid purchase, autofill execution, trimming, learning reset and deletion were not performed.
- **APP** [Official Chessbook Android listing](https://play.google.com/store/apps/details?id=com.chessbook.android); Publisher feature description; checked 2026-10-14. Limit: Claims about availability do not prove runtime quality; store limits can change.
- **COMPLETION** [Chessbook completion documentation](https://wiki.chessbook.com/completion); Official documentation read in browser; checked 2026-10-14. Limit: Coverage algorithm description, not a validated prediction.
- **STATS** [Chessbook repertoire statistics documentation](https://wiki.chessbook.com/repertoire-statistics); Official documentation read in browser; checked 2026-10-14. Limit: Calibration and trained models cannot be independently reproduced from descriptions.
- **AUTOFILL** [Chessbook autofill documentation](https://wiki.chessbook.com/autofill); Official documentation read in browser; checked 2026-10-14. Limit: Live autofill control blocked by automatic approval review because it could modify repertoire data.
- **SRS** [Chessbook spaced repetition documentation](https://wiki.chessbook.com/spaced-repetition); Official documentation read in browser; checked 2026-10-14. Limit: Scheduling policy described, no internal code or parameters inspected.
- **SOFT** [Chessbook soft fails documentation](https://wiki.chessbook.com/soft-fails); Official documentation read in browser; checked 2026-10-14. Limit: Terminal no-penalty handling not live-tested.
- **RECOMMENDED** [Chessbook recommended moves documentation](https://wiki.chessbook.com/recommended-moves); Official documentation read in browser; checked 2026-10-14. Limit: No measured competitor throughput or effectiveness.
- **EVAL** [Chessbook engine evaluations documentation](https://wiki.chessbook.com/evaluations); Official documentation read in browser; checked 2026-10-14. Limit: Precomputed engine database was not accessed or copied.
- **EXTENSION** Audit-driven independent improvement; Own product requirement; checked 2026-10-14. Limit: Not asserted to be a Chessbook feature.
- **REA_METHOD** [REA browser observation and evidence methodology](https://github.com/morluto/rea/blob/main/docs/browser-observation.md); Official repository guidance read; method adapted using available browser inspection; checked 2026-10-17. Limit: REA MCP/CLI was not run. No claim of client-bundle, network-body, server-source or trained-model recovery.
