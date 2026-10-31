# Game page: organisation and compactness review

Reviewed 31 October 2026 against the owner's Safari PDF and application source.
Application baseline: `be650d9`, v1.5.26. This is a review and proposal; no game-page
layout or workflow changes are implemented here.

## Main finding

The problem is task hierarchy, not simply large spacing. The page combines choosing
a game, requesting analysis, studying one game and managing opening patterns across
all games. Shrinking fonts or putting the entire page behind one accordion would
leave those competing purposes intact.

The supplied PDF shows eight game entries plus 39 remaining, followed by an
unanalyzed game's report, replay and an opening inbox with 18 unreviewed groups,
11 repeated patterns and 31 total groups. Those counts describe this export, not
all installations. The opening inbox is the largest source of repeated content.

The export is one exceptionally tall page (462 × 13,801 PDF points), not a
multi-page report. Its length is consistent with the stacked components in source.
The PDF also contains a bright green background artefact around the game list;
check Safari print/export separately before attributing that to the live layout.

## Purpose check

- **Need / requirements:** LR01–LR03, LR07, LR10 and LR13. The learner should reach a
  useful lesson from a chosen game without traversing unrelated games and patterns.
- **Existing capability / simplest option:** import disclosures, an eight-game list,
  collapsible detailed notes, a persisted replay, key-decision study and grouped
  opening follow-ups already exist. Reorganise them; do not build another board,
  review engine, scheduler or AI chat screen.
- **Benefit hypothesis:** clearer scope and fewer competing actions make it easier
  to review a real decision and return for practice. This has not been measured.
- **Acceptance:** focused game routes, reachable board, preserved replay and library
  state, contextual analysis status, bounded pattern lists, keyboard/mobile access
  and no accidental analysis or training credit. See the task measures below.
- **Costs / protections:** routing and component ownership work, regression coverage
  for deep links and active practice, and retained access to advanced controls. A
  first layout pass should need no schema or analysis changes.
- **Decision:** prioritise separating the tasks, then reduce card repetition. Keep
  the existing features and history. Do not treat a visual redesign as evidence of
  better chess learning.

## Findings verified in source

| Finding | Implementation evidence | Implication |
|---|---|---|
| Game selection sits above the report and replay | [GameReview](../../apps/web/src/components/GameReview.tsx), `GameLibrary`, `GameMoveReport`, `GameReplay` render consecutively | On mobile the selected game's board starts well below the game catalogue and explanation panels. |
| The library is already bounded | [GameLibrary](../../apps/web/src/components/GameLibrary.tsx), initial limit 8, Show more, whole-library search | Do not describe pagination as missing. Compact rows and a focused detail route address the larger problem. |
| Every unreviewed opening group renders in full | [OpeningGameInbox](../../apps/web/src/components/OpeningGameInbox.tsx), `visibleGroups.map` | The default page grows with unresolved groups even though reviewed groups are hidden. |
| Nested preparation controls repeat on each eligible group | [OpeningPreparationAdvice](../../apps/web/src/components/OpeningPreparationAdvice.tsx) inside each inbox item | Repeated explanation, frequency, decision and action panels consume most of the lower page. |
| A selected game and the cross-game inbox share one route/view | [GameReview](../../apps/web/src/components/GameReview.tsx), `opening-inbox` following detail | It is unclear when information stops describing the selected game. |
| Several routes reach the same decision through different controls | [GameMoveReport](../../apps/web/src/components/GameMoveReport.tsx), [GameReplay](../../apps/web/src/components/GameReplay.tsx), current review notes | Keep full report/replay/practice capabilities but give the learner one primary entry and consistent position selection. |
| Saved feedback and current notes are deliberately different | [GameReplay](../../apps/web/src/components/GameReplay.tsx), explicit refresh; current-notes disclosure in GameReview | Do not silently merge or overwrite snapshots merely to remove duplicate-looking text. |
| Game choice replaces the current URL | `loadReview` in [GameReview](../../apps/web/src/components/GameReview.tsx); navigation handlers in [App](../../apps/web/src/App.tsx) | Define explicit library/detail/return behaviour rather than relying on scrolling and history replacement. |

## Proposed structure

### 1. My games: choose a game or inspect patterns

Use two clear destinations within My games: **Games** and **Opening patterns**.
Keep the latter explicitly opening-only until verified tactical/other patterns are
implemented. Do not present existing opening groups as a complete weakness profile.

The Games view contains a compact search/list, an Add games action and an explicit
Select games action for batch analysis. Each row shows opponent, date, result,
colour, source and analysis status without turning every statistic into a button.
Keep the full player names in an accessible expanded label or detail heading.
Source/status filters need source-aware metadata; unknown must remain unknown.
Date, colour and analysis-status filtering can be introduced incrementally rather
than exposing every conceivable filter immediately.

Do not open the complete latest game underneath the list by default. Choosing a
game opens its focused detail. Preserve search, loaded row count, selection and
scroll when returning. On wide screens a bounded library sidebar may be useful;
on mobile, Back to games is clearer than a second permanent column or nested scroll.

### 2. Selected game: a compact header and one board

Show **Back to games**, opponent/date/result and clear analysis status. Keep the
board near the top with one relevant primary action:

- No engine report: **Analyse this game**. Opening feedback remains usable, but is
  labelled opening-only; do not imply all important tactical decisions were found.
- Report available: **Review key decisions**. Show concise supporting numbers and
  allow ordinary replay, rather than requiring a guided session.
- New analysis with an older saved replay: explain the mismatch once and offer
  the existing explicit refresh. Keep the previous feedback/attempts recoverable.

Use three detail modes around the **same replay board**:

| Mode | Contents | Keep out of the default view |
|---|---|---|
| **Review** | Selected key decision, recall/feedback, relevant teaching continuation and later-practice action | Full move-grade list and every cross-game pattern |
| **Report** | Accuracy, blunder/mistake summary, position graph and compact move rows that select a position on the shared board | Repeated replay board, long scoring methodology and rerun settings |
| **Opening** | This game's repertoire status, first departure or endpoint, expected move, explanation and relevant practice/preparation action | Opening inbox from unrelated games |

On mobile, show only the selected mode's content below the board; on desktop use
the existing board/details arrangement. Mode changes must not reset the saved
position, reveal a recall answer or abandon unsaved notes. Keep buttons comfortably
usable rather than squeezing all information into a tiny board sidebar.

Do not add an empty Coach tab. As coaching is implemented, it should improve the
Review mode's explanation of what was missed, warning signs and the next habit.
The UI work alone cannot create those explanations.

### 3. Opening patterns: compact overview, expand one pattern

Show the highest-priority three actionable groups initially, followed by **View all
18 to review** for the PDF's example. The actual count is data-driven. The full
view uses a bounded list/load-more with retained filters, not all tall cards.

Each collapsed row needs only the pattern/decision, repertoire, occurrence count
and review state, plus **Review pattern**. Opening a pattern reveals supporting
games, frequency evidence, relevant practice or preparation controls and optional
notes. Keep one expanded pattern at a time unless the learner explicitly requests
comparison. Reuse current grouping keys; identical SAN alone does not make two
positions or repertoires the same pattern.

Retain Reviewed and Deferred views. A deliberate Leave unprepared choice should
not continually compete with actionable work. Define resurfacing explicitly: new
encounters can add a badge and a reason to reconsider, without erasing the choice
or silently treating the pattern as newly required work. Reviewed, deferred and
mastered are different states; do not collapse them into a completion tick.

Inside game detail, show only a small link to relevant cross-game patterns, with
an explicit return path. Opening a supporting game from a pattern should retain
which pattern was being studied.

## Content reductions

1. Replace repeated generic descriptions with one short explanation per workflow.
2. Show analysis state once prominently. The PDF repeats that engine analysis was
   not available in both report and replay introductions.
3. Replace “Start with 1 key decision” with a scoped label such as **1 opening
   difference** while analysis is absent. A repertoire difference is not a blunder.
4. Move scoring methodology, snapshot/scheduling semantics and advanced rerun options
   into clearly labelled help/settings. Retain state-dependent warnings beside the
   relevant action; do not hide a real save failure or an outdated-report warning.
5. Keep notes and classification editing within the selected decision. Preserve
   optional learner reflection and unknown causes; no forced psychological diagnosis.
6. Distinguish next move, next marked decision and next lesson. In guided review,
   make the lesson action primary; in ordinary replay, next move is primary.

## Ranked delivery plan

1. **Separate library, focused game and opening patterns.** Preserve existing
   `#games?game=…&ply=…` links and old entry points to `opening-inbox`. Add explicit
   return state and Back/Forward behaviour; no database work expected.
2. **Compact the pattern overview.** Bound the default list and reveal heavy
   preparation controls on demand. Keep access to every pattern and supporting game.
3. **Unify the selected-game detail modes.** Reuse one board and saved replay;
   remove repeated introductions and show contextual primary actions.
4. **Add small, useful filters and coaching content separately.** A coach requires
   verified evidence and its own correctness/learning evaluation; do not bundle an
   untested AI dependency into a navigation improvement.

A collapse-the-library/limit-the-inbox patch is a possible first increment, but is
not a complete solution to mixing one-game and all-game work. Prefer the structural
split if implementation remains contained.

## Acceptance and measurement

Run the same representative tasks on the existing and proposed layouts using a
fixture matching the PDF (47 games, 31 groups, 18 unreviewed, analyzed and unanalyzed
games, reviewed/deferred groups). The fixture need not copy the owner's private PGNs.

- Choose a named game; reach its board; request analysis only when intended.
- Open a progress deep link at the exact decision, then return to the originating
  view without losing its position, search or selection.
- Review a key decision, ask for help, resume after reload and schedule later
  practice without awarding unaided recall or changing prior attempts.
- Inspect a recurrent opening difference and an opponent surprise; prepare, defer
  or mark reviewed deliberately, then find the group again.
- Batch-select games across search boundaries with clear selected counts; preserve
  existing reports unless explicit reanalysis is chosen.
- Handle remote failure, missing analysis, old replay feedback and unsaved notes
  without hidden warnings, duplicate requests or discarded work.

Measure task success, time, actions, scrolling, mistaken selections and whether the
learner can tell “this game” from “across my games”. Proposed release gates: no
library or global inbox above the board in focused detail; at most three default
overview patterns; no horizontal overflow at 320/390/768/1024px; all existing deep
links and persisted recall journeys pass. These are proposed gates, not measured
redesign results. Use keyboard/assistive checks, Chromium and mobile WebKit, plus
physical Safari usability and print/export review where available.

Keep learning outcomes separate: navigation success is not evidence of fewer
blunders. Later coaching/training changes still need delayed recall, unfamiliar
positions and recurrence in actual games under the charter's comparison rules.

## Scope and rollback

No application UI changes, new dependencies, schema changes or AI integration are
part of this review. Implement in reversible increments, preserving current
snapshot, practice and preparation services. If a new route or mode is withdrawn,
existing game/position links must still resolve to the saved review. Do not delete
features or data to make the page appear shorter.
