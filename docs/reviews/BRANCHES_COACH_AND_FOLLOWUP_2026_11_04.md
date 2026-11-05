# Repertoire branches, connected coaching and later-game follow-up — 4 November 2026

## Purpose checks and decision

**Navigation — LR10/11.** The learner cannot easily see how lines relate or where
an opponent's reply splits their preparation. Existing shared-prefix and board
navigation already preserve source lines and transpositions, but the library is
flat. Proceed with a move-order tree derived from existing saved sequences,
without a new parent-line schema. Expected benefit is easier access to preparation;
learning gains remain unmeasured. Accept when nested and first-move branches are
searchable, the selected route is exposed, mobile layouts fit, and browsing changes
no repertoire data. Keep chapter boundaries, custom titles, archives, notes and
training history. Preferred/main continuation editing is not added by this pass.

**Coaching — LR01/02/03/13.** Existing recommendations already group verified
patterns and teach a checking habit, but the practice button and source games are
inside a disclosure. Proceed by making the warning sign, habit, representative
board decision and existing practice action visible together. Move supporting
methodology into the existing details section. Reuse the same queue, engine
feedback and scheduling. Accept with a complete source-board-practice journey and
no extra board, session or analysis. These explanations describe observed chess
patterns; they do not diagnose the learner's thought process. No hosted AI or new
mode is introduced.

**Follow-up — LR07/09/11.** General move-quality trends exist, but they are not tied
to study of the currently recommended weakness. Proceed with an explicitly
bounded, descriptive comparison inside the existing focus panel. Anchor to the
first completed current-content blunder-check exercise for that focus with recorded
analysis provenance. A reveal or incorrect answer counts as study, not mastery.
Existing historical attempts without provenance are not guessed. Compare up to
20 earlier and 20 later games within the current evidence window (up to 100 games),
using stored verified move grades, rather than another analysis system. Expected
benefit is a concrete way to inspect recurrence, not proof of training efficacy.

## Implementation

- `opening-branch-tree.ts` builds a compressed move-prefix trie, independent of
  import order or inferred parent labels. Different first moves, first replies,
  nested variations, ended lines, duplicate routes and distinct starting boards
  remain navigable. Transpositions remain separate move orders and retain the
  existing same-position navigation. The library expands the selected path and
  search ancestors, supports native keyboard disclosures, bounds indentation,
  removes duplicated move previews and keeps the existing line selection logic.
- `LearningFocus.tsx` exposes the source-decision link and existing practice action,
  alongside the verified warning and checking habit. When nothing is due, the next
  scheduled date and supporting decision remain available. The daily plan remains
  the primary session start; optional focused practice is secondary.
- `focus-transfer.ts` reuses completed attempts, migration-049 provenance and the
  current verified focus grouping. It requires matching exercise content and run,
  then separates engine/grading cohort, time control, colour and platform. Unknown
  PGN provenance remains labelled unknown. Only games with complete own-move
  assessment and consistent move grading enter denominators. Future-dated games
  and ambiguous study-day date-only exports cannot fabricate a later-game result.
- `FocusTransfer.tsx` reports flagged games, sample dates/counts, own moves,
  mistakes+blunders per 100 own moves, blunders, and known learner/opponent rating
  ranges. It links the underlying games and states exclusions and uncertainty.
  No score, completion credit, scheduler change or causal-improvement claim is
  produced. Missing detection is not labelled absence of the weakness.

## Boundaries, cost and rollback

Follow-up is for the current focus and current evidence window, not a durable
curriculum or a historical record of every previously selected weakness. Changing
filters, reanalysis, revised evidence or a different recommended pattern may make
an older practice anchor unavailable. Match requirements deliberately prefer no
comparison over one built on uncertain provenance. Ratings are shown as context;
the comparison is not statistically adjusted for rating or opponent strength.
Timing uses retained UTC timestamps; ambiguous study-day exports are excluded.

All work is local. No new dependency, migration, deployment setting, cloud request,
engine run or data rewrite is required. Tree construction is linear in saved move
count. Follow-up uses the existing bounded game/focus candidates and completed
attempts for matching items, with up to 40 games in displayed windows. If real
libraries show latency, profile these reads before expanding the window. Rollback
can restore the prior application code without changing stored learner history.

## Acceptance and measurement

Engineering gates now include G1_BRANCH_TREE / G1_BRANCH_TREE_UI,
G3_COACH_UI and G3_TRANSFER / G3_TRANSFER_UI. Service tests verify stable branches,
ended/duplicate/custom-start routes, current attempt provenance, unknown timestamps,
future games, changed content, platform separation and incomplete grading. Existing
cohort/profile tests remain required. Browser journeys navigate nested and first
reply branches, search hidden continuations, follow coaching into the source board
and existing practice, then record practice and import/analyse a genuinely later
game to inspect the comparison on desktop Chromium and mobile WebKit.

Final full-suite verification completed 5 November: all three engineering stages
PASS with current source evidence. Type checks, the production build, 473 unit
tests, 240 desktop/mobile browser tests (no failures, skips or flaky results), and
real Stockfish regressions (16 tactical cases and 9 full-game cases) pass. The
daily-start check now verifies one stable primary action and one visible secondary
focus action, matching the intended coaching change. Physical-device Safari, unaided user
comprehension and learning benefit remain unmeasured. Pilot questions: can the
learner find a specific reply and return to its fork unaided; explain why a focus
was chosen; and distinguish recorded study from evidence of improvement? Track
later serious errors and supported motif recurrence with sample counts and rating
context. Do not treat exercise completion or these regression tests as evidence of
better chess performance.
