# Build validation and next quality gates — 7 November 2026

**Follow-up, 12 November:** Safari access and the installed build identity are now verified. See the [native Safari validation](SAFARI_VALIDATION_2026_11_12.md) for the current result and a reproduced post-completion workflow issue. The text below preserves the 7 November checkpoint.

## Decision

**The current local source passes its engineering gate. Installed-build/Safari validation remains pending.** Finish that checkpoint before treating the release/usability stage as complete or expanding into the trust fixes and persistent plan.

This follows the owner's request to validate first, then address trust and a persistent training plan, and assess whether those improvements are sufficient. No application code, schema, dependency or deployment configuration was changed during this validation. Earlier tactical/UI work remains local and uncommitted. No release was published and no personal database was opened or modified.

The charter's priority remains learning from the owner's games to reduce serious errors, rather than increasing feature count. Correct software behaviour is necessary; it does not establish comprehension, retention or improved play.

## Purpose check

| Stage | Learner need and requirements | Existing capability / simplest option | Benefit and acceptance | Cost, protections and decision |
|---|---|---|---|---|
| Validate current build | Trust the normal learning journey and retained records, LR05/10/11 | Reuse fingerprinted unit/browser/engine gates, existing container smoke and backup/restore scripts; inspect the actual UI | Requested analysis produces reviewable results, review/recall remain distinct, changes appear in the library, data survives restart and recovery; confirm the installed build and an understandable Safari session separately | Disposable local database only; no mandatory service or dependency. Local engineering acceptance passes; installed/Safari acceptance pending |
| Trust fixes, subsequent stage | Avoid unsupported diagnoses and misleading comparisons, LR03/07/09/12 | Keep objective motifs and existing metrics; distinguish automatic hypotheses, learner reports and unknown causes; separate platforms using the existing source helper | No engine score presented as proof of a mental cause; general trends compare matching platform/time control/analysis settings and disclose counts, dates and limitations | Preserve historical labels, provenance, attempts and schedules; no automatic reanalysis. Proceed after validation checkpoint; not implemented by this review |
| Persistent plan, subsequent stage | Continue one explainable lesson across sessions, LR01/02/10/11/13 | Extend existing learning focus and saved daily practice rather than another tab, mode or scheduler | Chosen focus, source evidence and baseline survive reload/import; explicit keep/change; stale evidence is marked after reanalysis; existing active session resumes without duplicate credit | Additive profile-scoped persistence, migration/backup/rollback checks; keep scheduling separate. Proceed after trust fixes; not implemented by this review |

## Local evidence

### Existing comprehensive evidence is still current

`node scripts/learning-quality.mjs --stage 3` rechecked the source fingerprint and reported **PASS for all three stages**. It did not rerun the unchanged comprehensive suite.

- Fingerprint: `d0378b33be79167f296e6b9422da2b6b18e14e15a32709838cd1e09c31c84782`.
- The authoritative exact fingerprint is in `docs/learning-quality/grade.json`; its measured run is 7 November at 08:05:53 UTC.
- Type checking and build passed in that run; 480 unit/integration tests and 240 browser journeys passed, including mobile WebKit, with no failed/skipped/retried/flaky journeys.
- Stockfish 18 passed 21 tactical/value cases and nine full-game cases.

See [quality evidence](../learning-quality/QUALITY.md) and [machine-readable grade](../learning-quality/grade.json). These are regression results, not evidence that the learner has improved.

### Additional runtime validation performed now

The clean production Docker build stalled while resolving `docker.io/docker/dockerfile:1.7`, before compilation. It was stopped rather than reported as successful. See [build log](evidence/2026-11-07-build-validation/docker-build.txt).

The fallback used the cached `thinking-board-audit:1.5.25` runtime (Node 24.22.1 and Stockfish 18), with **current** compiled server, web assets, migrations, scripts and package metadata mounted read-only. Its declared production dependency requirements match the current package. This checks current application behaviour in a production-style runtime; it does not verify a fresh image build, package installation, multi-architecture publication or an installed update.

Only the disposable `thinking-board-validation-20261107` container/volume and loopback port 18007 were used. The UI identified itself as version 1.5.27, build `local-d`. That deliberately denotes local, uncommitted source, not a published Git commit.

| Check | Result | Evidence / scope |
|---|---|---|
| Fresh database and requested analysis | PASS | PGN import creates no analysis job; explicit request completes with real Stockfish; candidates returned. [Smoke result](evidence/2026-11-07-build-validation/runtime.txt) |
| Opening/practice integration | PASS | Source-update branches/notes/arrows, preparation choices, coverage boundaries, practice selection and recall checked by the existing container smoke |
| Restart persistence | PASS | Imported games, updated repertoire, preparation notes, choices, authored hints and practice settings survive restart. [Restart result](evidence/2026-11-07-build-validation/restart.txt) |
| Additional real-engine reliability | PASS, 15 cases | Repetition history for both colours, 12 bounded candidate queries, latest replay retaining earlier snapshot. [Detailed results](evidence/2026-11-07-build-validation/reliability.json) |
| Backup and restore | PASS | Current backup script, then restore into a separate file; all 80 user tables and 301 rows compare identically; SQLite integrity and foreign-key checks pass. Original test database not replaced |
| Visible game review → library → reload | PASS for this test case | In-app browser with real runtime; see observations below. Not physical Safari or a learner comprehension trial |

### Direct UI observations

In the disposable library, the PGN source, analysis status, blunder/mistake counts and opponent/colour/result columns were visible. Opening the four-ply test loss showed two own moves assessed, one blunder and one mistake. The review checklist separately included a repertoire departure; it did not equate that departure with a chess-quality error.

Selecting the blunder and revealing the response displayed the mate-in-one consequence and explicitly classified the exercise as helped practice, not unaided recall. The checklist changed from 0/3 to 1/3, and returning to the library immediately showed **Partially reviewed, 1/3**. That state survived a container restart and browser reload. No unaided mastery or learning improvement is inferred from this assisted test.

The revealed explanation still combines the specific mating cue with generic capture advice and a long explanation of accepted answers. This is a bounded coaching/text refinement candidate, not a reason for another training screen. Observe whether the learner needs that detail before changing the default presentation.

## What is not validated

- The installed Unraid version/build: the app URL is not yet available in this turn.
- A normal physical Safari session: the Mac was locked and native inspection was unavailable. An asynchronous request for the URL/unlock is pending.
- A clean release-container build/publication: the registry metadata step stalled; the cached-runtime fallback is explicitly narrower.
- Physical touch/drag/promotion behaviour, accessibility assistive use or unaided learner comprehension. Automated mobile WebKit coverage is useful but does not establish these outcomes.
- Retention, unfamiliar-position recognition or fewer serious errors in subsequent games.

Do not describe the installed update as validated or silently publish the local changes. Once accessible, inspect `/api/v1/health` to establish version/build, and compare the installed release to the source being assessed. A passing local candidate does not mean the installed application contains it.

## Are these areas good enough?

| Area | Current judgement | What would make it sufficient for the next stage? |
|---|---|---|
| Tactical value and recent UI changes | Engineering acceptance passes; suitable for an installed usability checkpoint | Owner can find a focus, understand a source lesson, practise, find the reviewed decision and resume in Safari. Address reproduced blockers before adding features |
| Trust in labels | Needs improvement | Automatic `process.calculation_failure` and `process.pattern_failure` cannot appear as established personal causes; display/query paths must preserve their automatic provenance or treat the cause as unknown. Learner reports remain separate |
| Trust in comparisons | Needs improvement | General move-quality trends split playing platform as well as existing time-control and analysis cohorts; unknown-platform PGNs remain explicit. Current-focus follow-up already separates platform/colour and should be reused |
| Persistent training plan | Not yet sufficient | Daily-session persistence exists, but a recalculated focus is not a lasting plan. Preserve the chosen lesson, evidence and baseline, with explicit keep/change and safe stale-evidence handling |
| Demonstrated learning benefit | Unmeasured | Delayed unaided performance and later-game error rates with denominators, coverage and comparable cohorts; do not substitute completion counts |

## Next-stage acceptance specification

### 1. Close installed-build validation

Identify installed version/build, check a normal Safari flow (Today → source example → practice → source review → return/resume), and record observed behaviour separately from owner comprehension. Confirm current local changes are actually present before evaluating their installed behaviour. Publish only when requested. No personal-game analysis should be triggered merely to inspect the installation.

### 2. Trust fixes

Inspect generators **and consumers**, not only text: `analysis/v1-generator.ts`, `analysis/analysis-service.ts`, `training/v1-training-service.ts`, game-review concept chips and progress summaries. Engine evidence establishes chess events and supported motifs; it does not establish why the learner missed them. Existing automatic/manual records must remain recoverable. Add targeted regressions for old automatic labels, learner classifications, summary/selection behaviour and unchanged attempt/schedule history.

Reuse `games/game-source.ts` to scope `analysis/game-quality-service.ts` trends. Test identical time controls and analysis settings across Lichess, Chess.com and unknown PGN games; invalid/empty source selections; visible scope and denominators. Preserve the existing explicitly requested analysis model. Do not treat source filtering as statistical adjustment for player or opponent rating.

### 3. Persist one learning plan

Extend `training/learning-focus-service.ts`, `training/daily-practice-service.ts` and the existing Today components. Keep recommendation generation, saved focus choice, training sessions and scheduling as separate responsibilities. The saved plan should retain profile, focus identity, selected scope, chosen-at time, source/run/content provenance, baseline and study references. New evidence may propose a change; it must not silently replace the selected plan.

Reanalysis must mark old supporting evidence as superseded without erasing the plan or completed study. Unavailable/retired tasks must not be practised using stale solutions. A date/time-control filter must not delete or covertly replace the plan. Existing active sessions continue unchanged; saving/changing a focus must not itself create attempts, exposure, review completion or scheduling credit.

Acceptance requires restart/reload/import persistence, profile isolation, explicit keep/change, no double-credit, stale-content safety, source links, migration from existing databases and backup/recovery. Preserve daily plan behaviour and opening practice. Use additive persistence and document compatible rollback; do not drop historical rows to undo the feature.

Capture a baseline before changing selection. Report later serious errors and blunders per 100 own moves, supporting pattern recurrence, analysed games/own moves, missing analysis, dates and uncertainty. Separate platform, time control, colour and analysis settings; disclose learner/opponent rating context. Retain study timing and content provenance so follow-up does not disappear merely because the current 100-game window changes. Reading/revealing, first unaided recall, later recall and unfamiliar assessment remain different observations.

### 4. Review sufficiency before expansion

Re-run relevant correctness and journey tests after implementation, then assess the complete normal session. A release is acceptable when the scope above works without history loss or misleading claims. A learning intervention remains provisional until a longitudinal pilot supplies retention/transfer evidence. Do not use a numerical feature-parity score to override a reproduced reliability or comprehension problem.

## Recheck of purpose

This pass provides additional reliability and recovery evidence for LR05/10/11, retains the earlier engineering gate, and identifies remaining LR03/09 and LR01/02 gaps without presenting proposals as shipped behaviour. The costs were local test containers and disposable data. No personal data, history, production settings or analysis jobs were touched. Installed usability and learning outcomes remain explicitly unmeasured.
