# Thinking Board: whole-app review — 25 October 2026

Follow-up: the [26 October repair delivery](APP_RELIABILITY_DELIVERY_2026_10_26.md) implements the findings below. This document and its captures retain the original review evidence.

Reviewed source: `f59802a`. This is an expert product/code review with isolated
runtime reproductions, not a claim that every feature has been independently
validated by users or matched against Chessbook.

**Decision: prioritise correctness and workflow integration before adding more
features.** Opening construction and recall are substantial and useful. The
largest risks now concern which games enter the library, whether analysis has
all the game context, and whether users reach the latest feedback.

## Important deployment distinction

The running local container `thinking-board`, exposed at `127.0.0.1:8185`, reports
**v1.2.1**. Current source reports **v1.5.20**. GitHub's publication workflow for
`f59802a` completed successfully:
[release run](https://github.com/Rinsing4852/thinking-board/actions/runs/40238723776).
That does not establish that any particular installation pulled and restarted
with it. If this local address is the user's installation, it needs updating;
this observation does not identify the version running at another address.

Current-code journeys therefore used a separate temporary instance at port 8194,
with synthetic games, synthetic Ruy Lopez and multi-root Modern repertoires,
and real Stockfish 18. No live user database was copied or edited. Review-instance
interactions, including imported games and local practice, are disposable.

## Prioritised findings

P1 means fix before relying on complete game-history analytics. P2 means a
concrete reliability/usability problem that should follow in the same repair
cycle. The list separates defects from deliberate behaviour that needs a better
user flow.

### 1. P1 — Different games can be silently skipped as duplicates

**Observed:** import two games with identical moves but different opponents,
dates and time controls. The second returns `imported: 0, duplicates: 1`.

**Cause:** the fingerprint contains only the starting FEN and move sequence;
import deduplication treats that fingerprint as global game identity. Distinct
miniatures or repeated lines can therefore disappear from the saved history.
The problem also crosses player profiles. No existing record is deleted, but the
second genuine game is never saved. Trends, opening frequency and game counts
can consequently undercount real play.

**Change:** separate game identity from position/move-content identity. Prefer a
stable source game ID; use an explicit metadata-based fallback for pasted PGNs,
scoped to the intended learner. Preserve idempotent reimports of the same game.
Do not invent metadata for older records. Already skipped games may require a
reimport after the fix; check retained import batches before claiming recovery.

**Completion:** two distinct games with the same moves are retained; repeated
exports of the same identified game are not duplicated; the same encounter can
be associated with either legitimate learner profile without silently vanishing.

Sources: [fingerprint](../../apps/server/src/chess/pgn.ts#L121),
[import deduplication](../../apps/server/src/imports/import-service.ts).
Evidence: `runtime.json`, “Different real-world game with identical moves”.

### 2. P1 — A limited Lichess sync can permanently miss the middle of a backlog

**Observed with an injected provider and an in-memory database:** sync one game;
make three newer games available; sync with a limit of two. The newest two are
saved. A subsequent sync with a limit of 100 saves zero more, leaving three of
four games in the library.

**Cause:** requests sort newest first, then advance the next `since` boundary to
the newest returned game. Unfetched games between the previous boundary and the
new batch are no longer requested. This is an incremental-sync defect, separate
from the intentional initial “latest N games” choice.

**Change:** retain a bounded backlog cursor or process the unfinished interval
before advancing its completed high-water mark. Show that older pending games
remain. Parsing failures must not silently advance past unresolved games.

**Completion:** a backlog larger than the selected batch size is eventually
imported in full across repeated requests and restarts, without duplicate games
or automatic engine analysis. Test equal timestamps and partial provider errors.

Source: [sync cursor](../../apps/server/src/imports/lichess-sync-service.ts#L84).
Evidence: `data-and-analysis-probes.json`, `sync`.

### 3. P1 — Whole-game analysis loses repetition history

**Observed with real Stockfish:** a legal queen-versus-king sequence ends in a
threefold repetition. Replaying the full PGN identifies the repetition; creating
a board from its final FEN does not. The app reports White accuracy **100%**, no
errors, and a final White balance of **100**, overlooking the repetition-based
drawing opportunity. This nonstandard-start diagnostic is correctly excluded
from chronological trends, but whole-game reports support such imports.

**Cause:** both the initial engine pass and restricted played-move searches send
isolated FENs. FEN records the board, rights and move counters, but not previous
occurrences. A deeper search cannot recover missing game history.

**Change:** supply the initial position plus preceding moves for uploaded-game
searches and verification, and preserve history-sensitive draw context. Keep
position-only browsing as a separate valid use case. Version the changed analysis
method so older scores remain identifiable.

**Completion:** test drawing repetition opportunities from winning and losing
positions, both colours, ordinary and supplied-FEN starts, alongside mate,
stalemate and move-count draws. A drawing move must not receive a losing
alternative simply because the engine forgot earlier occurrences.

Sources: [whole-game calls](../../apps/server/src/analysis/analysis-service.ts#L125),
[engine position command](../../apps/server/src/analysis/uci-engine.ts#L168).
Evidence: `data-and-analysis-probes.json`, `repetition`.

### 4. P2 — Interrupted engine updates can duplicate candidates and hide the position score

**Observed with real Stockfish, 200,000 nodes, Ruy Lopez after 2...Nc6:** the API
returns rank 1 **Bb5**, rank 2 **Bb5**, rank 3 **d4**, all at depth 13. There are
only two distinct moves. The frontend merges by move identity, overwrites rank 1
with rank 2, and displays **Position: —** despite available scores.

**Cause:** the recent parser improvement groups information by depth and rank,
but still overwrites a previously complete set with partial same-depth updates.
Having all rank numbers does not prove that they belong to one completed set.
This is a gap in the last engine fix; the existing interrupted-search test only
covers an update at a different depth.

**Change:** retain an immutable last complete candidate set and publish a new
set only after a coherent update with distinct legal root moves. Preserve the
leading candidate when frontend results are merged. Invalidate incompatible
cached evaluations after changing the parser.

**Completion:** replay a protocol fixture where candidate order changes within
the same depth and the node limit interrupts the update. Also run real bounded
searches. Each result must have distinct candidates and a usable leading score,
or explicitly remain unverified.

Sources: [parser accumulation](../../apps/server/src/analysis/uci-engine.ts#L151),
[frontend merge](../../apps/web/src/use-opening-move-evidence.ts#L51).
Evidence: `engine-candidate-duplicates.json`, `learning-journeys.json`,
`opening-editing.png`.

### 5. P2 — New analysis and saved replay require an unnecessary second decision

**Observed:** opening a game creates its saved replay before engine analysis.
After analysis completes, the move report identifies a blunder, but the replay
still has only the original opening checkpoint and `analysisPending: true`.
It correctly offers **Refresh saved feedback**, with a confirmation.

Preserving an already-used review and its attempts is deliberate, useful
behaviour—not data loss. The normal first-review journey nevertheless feels
unfinished: **Review on the board** can open a replay without the newly found
engine decisions.

**Change:** provide a single clear **Review latest analysis** action that creates
a current version while retaining previous feedback and attempts. An unused
pre-analysis snapshot could be refreshed automatically; an actively used one
needs an explicit, understandable transition. Do not erase historical attempts.

**Completion:** save → request analysis → review on the board reaches the new
mistake and recall opportunity without requiring users to understand snapshots.
Old review history remains recoverable.

Source: [saved replay notice](../../apps/web/src/components/GameReplay.tsx#L46).
Evidence: `runtime.json`, “Analysis finishes after a replay was already saved”.

### 6. P2 — Today sends users back to importing when their saved game needs analysis

**Observed:** after saving an unanalysed game, Today still shows no generated
Blunder Check exercises and **Paste a game to find training positions**. It has
zero analysis action buttons. The compact dashboard disappears when there are
no training items. Adding another game is not the necessary next step.

**Change:** show a small state-aware next action: **You have saved games waiting
for analysis → Choose games to analyse**. Keep analysis explicitly requested.
Distinguish no games, awaiting analysis, analysis failed, no suitable exercises
found, and practice due.

**Completion:** a new user can save one game, request its analysis and start an
appropriate exercise without being told to import it again.

Sources: [hidden compact dashboard](../../apps/web/src/components/Dashboard.tsx#L77),
[empty-state route](../../apps/web/src/components/TrainingEmptyState.tsx#L24).
Evidence: `runtime.json`, “Today after saving an unanalysed game”.

### 7. P2 — Expanded learning results remain on the previous player after switching

**Observed:** open learning results for player A with one matched game and one
repertoire departure. Switch the Player selector to B. The training-profile
heading changes to B, but learning results still show A's one game and 100
departures per 100 games. B's metrics endpoint correctly returns zero games.

**Cause:** `OpeningLearningMeasures` reloads only when its disclosure opens;
it does not receive the profile-change refresh used by adjacent components.

**Change:** key learning results to the active profile and refresh signal, cancel
old requests, clear old values during the switch and show a loading state.

**Completion:** switching players with the section open cannot show the other
player's values. Test a slow previous-player response arriving after the switch.

Sources: [effect dependencies](../../apps/web/src/components/OpeningLearningMeasures.tsx#L6),
[parent refresh](../../apps/web/src/App.tsx#L225).
Evidence: `followup.json`, “Open learning metrics after switching player”.

## Assessment across the app

| Area | What is working | What should improve |
| --- | --- | --- |
| Navigation and Today | Four clear main destinations; focused opening practice hides competing navigation. | Replace empty-state import loops with the next action for the user's actual state. |
| Repertoire library and building | Multiple first moves, both colours, shared positions, branching, notes, source updates and undo have substantial implementation and existing acceptance coverage. The review Modern retained separate e4/d4 paths. | Preserve this foundation. Address candidate integrity and make connection/setup status easier to locate. |
| Board guidance | A single primary board and suggestion panel; engine strength and opponent frequency remain different concepts. Optional sandbox has a distinct “try moves without saving” purpose. | Fix missing position scores. Keep frequency/sample uncertainty visible; do not substitute engine choices for observed opponent frequency. |
| Opening recall | Focused line practice, assistance disclosure, persisted state and separate learning/recall are strong parts of the product. | Demonstrate delayed retention with users; completed sessions alone cannot establish better chess. |
| Coverage and preparation advice | Personal-game evidence and rating-band samples are separated; missing/stale evidence is not full coverage. | Game completeness defects undermine personal denominators. Token-enabled live frequency behaviour was not newly exercised in this review. |
| Imported games and sync | Explicit game/batch analysis and persistent job controls are useful. | Fix identity and backlog handling first. Improve visible analysed/unanalysed status and recovery from incorrect imports. |
| Analysis | Real Stockfish 18, bounded extra verification, saved provenance and improved accuracy aggregation are useful foundations. | History and candidate coherence need fixes. The earlier ten-position diagnostic does not validate all-game strength or numerical equivalence with Lichess. |
| Replay and recall | Feedback stays with each game; historical attempts survive; opening departures are not automatically called chess blunders. | Connect the newly completed report to current replay checkpoints through one action. |
| Model-game study | Exact-position matching, source distinctions, historical-move labels and separate study credit are appropriate. A model reveal survived reload and did not change opening activity. | Search is a bounded sample, not an exhaustive archive; useful games can lack explanatory notes. No fresh authenticated online/master-provider comparison was performed. |
| Progress | Game quality, practice results and delayed recall are separated; small samples and incompatible cohorts are disclosed. | Fix underlying missing games/history and player refresh before interpreting improvements. Prefer a few plain conclusions over expanding the metric stack. |
| Phone layout | Settled 390px mobile WebKit views of all four main screens had no horizontal overflow. | Game and Progress pages still span several screen heights. Keep optional details collapsed and prioritise the next action/board. No independent human usability study was performed. |
| Operations and maintenance | Publication succeeded; migrations, backup/restore tooling and persistent jobs have existing tests. | Show the installed build/commit and connection/backup status in one discoverable settings area. Large orchestration components make cross-workflow state bugs easier to miss; refactor around shared state after the fixes. |

No wholesale UI rewrite is justified by these observations. Keep the four main
routes, one primary board per task, and existing separation of recall from chess
quality. Inferred thinking-step labels remain hypotheses from game evidence,
not verified accounts of the player's mental process.

## Recommended delivery order and gates

1. **Complete game records:** fix game identity and sync pagination together.
   Gate: repeat-game, duplicate-export, profile, backlog, restart and partial-error
   scenarios all preserve the intended history; record counts and recovered gaps.
2. **Trustworthy engine input/output:** add full game history and atomic distinct
   candidate sets. Gate: the repetition and same-depth interruption reproductions
   above pass, followed by the real-engine suite and a broader documented corpus
   containing endgames, draws, promotions and both colours. Report disagreements;
   do not convert agreement on a small sample into a quality percentage.
3. **One continuous user journey:** connect saved games to requested analysis,
   current replay and later practice; refresh all player-specific metrics and
   identify the installed build. Gate: a user can do these tasks unaided on phone
   and desktop, with attempts/history preserved and no automatic analysis.

After those gates, the next substantial feature should be **performance by
opening**: compare Ruy Lopez and Modern results, where preparation ends, and
serious errors after leaving it, grouped by playing speed and analysis method.
Repertoire soundness assessment can follow. Opening-specific external puzzles
remain deferred as requested. Additional themes, new top-level navigation or
more model-game controls have lower value than this repair pass.

## Evidence and limits

The existing frozen-source verification for this code passed **363 unit/integration
tests, 186 desktop/mobile browser checks and six tracker tests**. The real-engine
smoke suite passed 13 checks. GitHub publication also succeeded. Those results
are real but did not cover the newly reproduced cases above; they are not a
whole-app correctness certificate. The tracker currently records 119 verified,
41 unknown and 30 unmet requirements, not a Chessbook parity percentage.

This review adds 11 initial desktop states, settled mobile WebKit captures of
all four routes, opening edit/practice and model-game journeys, isolated import
and sync probes, and real-engine history/candidate checks. Native Safari was
unavailable while the Mac was locked; automated WebKit was used instead of
claiming an on-device Safari inspection. External-provider sync pagination was
simulated deterministically; no personal Lichess account was used.

Evidence directory: [whole-app review captures and results](evidence/whole-app-review-2026-10-25/).
Authoritative settled captures and profile comparison are in `followup.json`;
`learning-journeys.json` records study/practice checks; `runtime.json` records
initial states and import/replay reproductions; `data-and-analysis-probes.json`
records sync/history results; `engine-candidate-duplicates.json` records the
actual duplicate engine response. Initial harness captures were superseded by
settled captures where necessary; they are not counted as application failures.

Application code was not changed in this review. The findings are still open.
