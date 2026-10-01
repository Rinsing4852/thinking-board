# Opening section quality review — 2026-10-01

## Scope and outcome

Review the existing opening section, improve ownership and deletion, and identify
the next usability/code priorities without expanding opening content. No live
repertoires or imported games were deleted during development.

The opening graph, separate source/personal comments, local engine, explicit
branch recall, position recall, spaced review and game-repertoire matching provide
a useful foundation. The next gains should come from making these capabilities
easier to understand and navigate, not from adding more modes or built-in lines.

## Fixed in this pass

- Production startup no longer seeds starter courses. Upgrades keep existing
  material; explicitly deleted starters remain deleted across restarts.
- Built-in lines/repertoires are deletable. Deleting the final line removes the
  repertoire instead of blocking the user.
- A collapsed library manager exposes individual repertoire deletion and an
  explicit whole-library reset, including archived material.
- Confirmation lists targets, offers PGN exports and explains permanent removal
  of opening notes/review results for every player profile. Games, game analysis
  and settings are retained. PGN export is not a review-history backup.
- Bulk deletion compares the submitted list with the current database and runs
  atomically: a newly added repertoire cannot be deleted accidentally and a
  mid-operation failure cannot leave half a library removed.
- Deletion clears stale Resume/progress/coverage state. Empty-library onboarding
  explains how to build/import; optional settings start collapsed.
- Exported flattened paths now have unique ChapterName headers, fixing rejection
  when reimporting the app's own multi-line PGN exports.
- Legacy courses are now explicit test fixtures, independent of product startup.
- Fastify is updated to 5.12.5, addressing
  [GHSA-4mh8-r7rc-xpvc](https://github.com/fastify/fastify/security/advisories/GHSA-4mh8-r7rc-xpvc).
  The advisory requires HTTP/2 and response trailers; neither is configured in
  this app. The compatible patch removes the flagged dependency nonetheless.

## Recommended next work, in order

### Follow-up: useful preparation, connected to practice

The next pass removes the assumption that every unfamiliar reply needs a saved
line. A shared preparation service/pure policy now combines position-specific
frequency, recent personal encounters, immediate-response engine mistakes and
available reply difficulty. The inbox, game review, builder, line editor and
coverage reuse this evidence instead of inventing separate priority rules.

The learner may save/edit an idea or leave a reply unprepared. Both choices
persist without creating lines/cards or recording an attempt. New encounters
retain that choice while exposing changed evidence. Explicitly preparing a
response carries the idea into post-answer practice feedback. Due/exact-line
recall is unchanged; varied rehearsal can use the same fresh cache, offline.

Code changes use focused preparation route/service/policy/store modules and one
shared UI component. Coverage now reuses Explorer caching rather than owning a
second network/cache path. Remote requests are explicit and opt-in; unknown,
small and stale samples never establish rarity. Personal evidence covers the
last 100 imported games of the chosen colour, including pasted and synced games.

This remains a heuristic, not a proof that an opening response is safe. Top-three
engine score gaps suggest precision but do not measure human difficulty, and
only the immediate response is graded. A weak opponent move can still be worth
understanding. The learner's explicit choice is never silently overwritten.

Follow-up verification: typecheck, 138 unit/integration tests and production
build pass; all 26 desktop/mobile browser checks pass. The Docker smoke test
now includes real game analysis feeding preparation, saved ideas without new
lines, restart persistence and library clearing with games retained. No live
installation data is modified. Version 1.5.7 is local until committed/published.

### Remaining practice/usability priorities

The hidden-answer retry/hint flow, automatic correct-move progression, exact
branch recall, offline recovery and mobile board behaviour remain covered by
browser regression tests. Do not add another Check/Continue step to memory
practice. The highest remaining gains are better branching navigation, clearer
practice-choice labels, fewer duplicated inspector panels and first-time-learner
validation of purpose/plan explanations. Keep author reasons and personal ideas
distinct from engine evaluation; do not automatically generate plausible prose.

1. **Simplify practice choices.** Keep one recommended memory session as the
   primary action. Present guided line study as “Learn this line and its ideas”
   and move varied rehearsal/management into secondary controls. Explain once
   that exact-line practice expects the selected branch, whereas position recall
   accepts another active saved reply. Validate this with a first-time learner.

2. **Make variations navigable.** Replace generic imported “Variation” labels
   with the branching move and a short move sequence. Show the common prefix,
   current branch and alternative saved replies together. Keep the board and
   next decision ahead of the line list on mobile. Existing transposition links
   are useful but are not a full study-tree browser.

3. **Improve learning reasons rather than inventing them.** Keep source prose,
   personal notes and missing explanations visibly distinct. Make writing a
   short purpose/plan/warning easy while studying. PGN arrow/square directives
   are currently stripped from prose, not rendered on the board; consider
   displaying these author annotations after an answer.

4. **Strengthen import/update portability.** Export currently flattens paths into
   separate PGN chapters rather than recreating the original nested study tree.
   Preserve original chapter/variation grouping on export next. Document stable
   Lichess chapter IDs versus title-based identity for pasted PGN: title changes
   may look like new chapters. Extend tests for book-like studies, transpositions,
   renamed chapters and round-trip comments before broadening import features.

5. **Reduce orchestration complexity.** OpeningPractice is roughly 1,200 lines
   and OpeningLineExplorer roughly 740. Extract library/import loading and
   practice transitions into focused hooks/reducers without changing behaviour.
   Add request cancellation or revision guards to prevent older asynchronous
   coverage results replacing newer state. Keep shared API contracts and thin
   routes; avoid a general framework rewrite.

6. **Polish accessibility and recovery.** Use consistent inline confirmation,
   Escape dismissal and focus restoration across destructive actions. Explain
   errors with a safe retry/reload action. Keep mobile tap/drag, square geometry,
   hidden answers, automatic continuation and network failure recovery in browser
   regression tests.

## Release and data safety

This change does not run a deletion migration. Only explicit user actions delete
existing opening material. Review statistics cannot be recovered from PGN alone:
take a database/application-data backup before clearing a library. No Chess.com
integration, extra starter content, model games or cloud dependencies were added.

The new whole-library API requires both an explicit confirmation and the exact
current repertoire IDs. As with existing unauthenticated V1 endpoints, keep the
installation on a trusted network; these checks are safeguards, not authentication.

## Verification

- Typecheck, 116 unit/integration tests and production build passed.
- All 24 Chromium/WebKit browser checks passed, including mobile drag/tap,
  hidden answers, automatic progression, source updates and library deletion.
- Rechecked the deletion journey in both browsers after the mobile layout polish.
- Built a Docker image and exercised real local Stockfish, source updates,
  restart persistence, library clearing and a second restart with games retained.
- The production dependency audit reports zero known vulnerabilities.
- Temporary test containers/data were cleaned up; the live installation was not
  modified. Published builds are additionally checked by the release workflow.
