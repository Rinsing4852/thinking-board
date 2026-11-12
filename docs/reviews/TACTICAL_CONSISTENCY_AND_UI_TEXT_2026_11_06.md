# Tactical consistency and concise UI — 6 November 2026

## Purpose checks

**Tactics — LR04/05/07/11/13.** A missed winning fork can appear in game review but fail to become a training item because its first move does not capture. Reuse the current Stockfish continuations, significant-mistake gate, practice queue and saved-analysis revalidation. Allow non-capturing winning opportunities with retained material evidence; use one conservative motif classifier for review, focus and automatic tactical enrichment. Expected benefit: important decisions reach useful practice with consistent labels. Accept with both-colour real-engine cases, a standard-start game reaching the focus, negative sound-move cases, and unchanged schedules/history after repeated revalidation. No new engine, mode, schema or analysis request. Proceed with this bounded fix, not a claim of complete tactical detection.

**UI — LR02/10/11/13.** The owner reports bloated pages. Existing actions and disclosures already support the workflows; shorten their wording rather than add navigation. Remove repeated introductory instructions, repeated board-state commentary and duplicate next-step explanations. Keep task prompts, coaching cues, useful empty states, errors/recovery, saving/deletion consequences, and distinctions between review, recall, repertoire adherence and engine quality. Expected benefit: less reading to reach the next action. Accept with existing desktop/mobile journeys and screenshot inspection; physical-Safari comprehension remains to be observed. No feature/history removal or new dependencies. Proceed with a text pass; broader layout redesign is not necessary for this change.

## Tactical changes

- Missed opportunities no longer require a capturing first move. They still require a significant actual loss, a legal retained-gain/mating continuation, an unplayed acceptable engine alternative and the existing tolerance checks. A demonstrated gain can be classified as a threat even when its first move neither checks nor newly attacks a valuable piece.
- `analysis/tactical-motif.ts` supplies the same rule to source review, focus feedback and V1 tactical enrichment. A non-capturing fork needs attacks on at least two valuable targets and a saved continuation in which the forking piece captures a target. Immediate captures stay capture lessons, rather than becoming forks because of incidental attacks after taking material.
- Missed forks keep the fork tag instead of being overwritten as missed captures. Unclassified non-capturing material opportunities no longer receive a fabricated capture/hanging-piece tag. Existing learner-supplied labels remain untouched.
- Existing saved-analysis backfill picks up eligible items without a new Stockfish job. Existing item identities, attempts and schedule state are reused. An open attempt whose evidence changes follows the existing invalidation rules; completed history is retained. Saved replay snapshots still require their explicit feedback-refresh action to adopt changed evidence.

This does not add comprehensive pin/skewer/discovered-attack naming, a full tactical proof tree, or multi-move mate execution grading. Material evidence remains a finite saved Stockfish continuation, not an exhaustive proof against every defence. Existing presumed thinking-process labels are a separate unresolved provenance issue; this pass does not claim to diagnose why a mistake happened.

## UI review and decisions

| Surface | Change / retained information |
|---|---|
| Today and manual practice | Remove routine introductions and duplicated next-step text. Keep due counts, one primary daily start, optional focus practice, source-example link, warning/habit and saved-session status. Hide an unavailable follow-up comparison rather than instructing the learner about a feature they cannot yet use. |
| Games library and imports | Shorten source help and import instructions. Keep account/source labels, filters, separate explicit analysis, import delays, duplicate handling and non-affiliation information. |
| Game review and cross-game practice | Shorten board instructions and source-review explanations. Keep current/saved feedback distinction, refresh consequence, review-versus-recall meaning, source-game credit, mate unit and actionable empty states. |
| Move reports and progress | Shorten missing-report and evaluation captions. Retain counts, analysis settings/methods, source links, sample/rating context and uncertainty. Do not remove information needed to interpret a result honestly. |
| Five thinking exercises | Remove repeated mode introductions and descriptions of highlights already visible on the board. Use short phase-specific prompts. Keep colour/perspective, selected-term help, answer feedback, continuation evidence and checking habits. |
| Opening library/build/branches | Shorten build instructions, move-save behaviour, branch hints and notes prompts. Keep autosave/preview meaning, unsaved recovery, deletion consequences and editing locks. |
| Opening coverage/preparation/settings | Shorten repeated coverage qualifications and helper text. Keep personal observations separate from Lichess frequencies, denominators, uncertainty, stopping-point meaning and detailed methodology inside existing disclosures. |
| Opening lessons/review | Shorten play/recall prompts and summaries. Preserve first-attempt/helped distinctions, retry controls, pause/save feedback and independent chess-quality checks. |
| Model-game study | Shorten search/replay/guess instructions and repeated qualifications. Keep historical-move versus engine-quality distinction, player rating/source context, saved recovery and separate study history. |
| Profile | Shorten account-linking and player-switching copy. Keep per-player separation, username-only access, account status and error recovery. |
| Board accessibility and destructive controls | Retain keyboard/screen-reader guidance, promotion choices, labels, error recovery and deletion/backup warnings. These are functional information, not redundant prose. |

This is a wording review across the application, not a removal of the charter's required explanations or a claim that every physical-device layout has been certified. No new help drawer or extra navigation is introduced.

## Verification

Final full acceptance: **all three engineering stages PASS**, with current source evidence.

- Type checking and production build passed.
- 476 unit/integration tests passed.
- 240 Chromium/mobile-WebKit browser journeys passed, with no failures, skips, retries or flaky results.
- Real Stockfish 18 passed 19 tactical/mating/revalidation cases and 9 full-game cases. The small selection corpus has six sound-move cases and eight tactical cases, with no false tactical selections or missed expected selections in that corpus. It includes both-colour non-capturing forks and a standard-opening fork that reaches the actual focus queue.
- New saved-analysis tests check consistent fork labels, unprofitable double attacks, stable item identity, retained answered attempts, manual labels and unchanged review schedules across repeated revalidation.
- Desktop and mobile screenshots were inspected for Today, focused game review, the game table, opening routes and Profile. Existing browser journeys cover the remaining affected exercise/build/study controls. Physical Safari and unaided comprehension remain unmeasured.
- A next-line recovery test exposed a delayed automatic-continuation response beyond its five-second text expectation. It now foregrounds the page and waits for the actual successful continuation response before asserting the next step. It passed ten consecutive runs across both browsers without retries; the final full suite also passed. No application timing or retry policy was relaxed.
- Local documentation references and whitespace checks passed. No migration, dependency or deployment changes were introduced; no commit or push was requested for this increment.

The corpus is intentionally small; passing it is regression evidence, not general tactical precision/recall or evidence of learning gains.

Owner pilot: without developer guidance, choose a game, understand one missed tactic, start its practice, find its updated source review and return to Today. Check whether the shorter wording is sufficient on physical Safari. Track later recurrence separately; reduced text or completed exercises does not establish improved chess skill.
