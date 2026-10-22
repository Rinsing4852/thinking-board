# Next four improvements — delivery record

Opening puzzles are explicitly deferred as CB58 in the REA inventory. No puzzle
screen, importer or corpus download is included.

## Reliability

Build/import controls now appear once above the saved library, independent of
late recommendation/statistics content. Optional progress and coverage summaries
follow the recommended practice buttons instead of pushing them down when data
arrives. A populated library's deletion diagnostic uses a viewport screenshot,
retaining the actual deletion and overflow assertions without WebKit's full-page
image-size limit. Mobile practice reserves space for the help note below the
board so showing help does not insert a new scrolling anchor.

The tracker explicitly labels its evidence as local and keeps release readiness
and container publication separate. A successful push or local test run does not
establish a published update. The preceding two GitHub release runs failed Linux
WebKit checks; this increment must pass the corresponding Linux checks and the
complete suite before it can be described as verified.

## Master-game evidence and game sources

In Edit lines, expand **Compare master-game evidence** to load a separate sample
for the exact board position. It shows master counts, W/D/B results, sample
popularity and retrieval date beside the available rating-band sample. Empty or
missing data says unknown. This optional request cannot block saved navigation,
practice or board guidance. Arrows continue to use practical reply frequencies;
master popularity is not silently substituted for games at the learner's level.

In model-game study, **Game source** selects stronger Lichess players,
over-the-board masters or both. Only selected pools are queried. Online examples
still require a higher learner-side Lichess rating; master ratings are not
compared numerically with Lichess ratings. All games must legally reach the
selected position and continue beyond it. Combined search alternates available online and master examples without ranking
one rating scale against the other. Changing source leaves saved replay
and guessing progress intact. At most eight online references and four master
references are examined, up to three examples offered; this is not an exhaustive
search. Source failures and empty samples remain explicit.

The adapter uses the official [master statistics](https://raw.githubusercontent.com/lichess-org/api/master/doc/specs/tags/openingexplorer/masters.yaml)
and [master PGN](https://raw.githubusercontent.com/lichess-org/api/master/doc/specs/tags/openingexplorer/masters-pgn-gameId.yaml)
endpoints. The master cache is separate from rating/speed-specific practical
samples. No paid Chessbook internals or datasets were accessed.

## One missing response, preview and undo

In Edit lines, **Preview suggested response** asks local Stockfish for one
missing learner response. At an opponent turn, first select the specific reply
on the board; the preview includes that reply and the learner's response. At a
learner turn with no saved response, preview a single move. Any existing saved
learner choice at the resulting position blocks generation, including across
transpositions. The minimum accepted engine depth is ten.

Preview creates only a draft record. **Add this response** applies it atomically,
retaining authored choices, notes and original branches. Each generated batch
retains source position, engine, depth, node budget, score and generated moves.
Repeated apply does not add a second branch. Preview expires after 30 minutes;
changed preparation or a changed player invalidates it.

**Generated responses · undo** lists recent applied batches, including after
reload. Undo is idempotent and removes only the batch's new branch or appended
moves. It conservatively refuses automatic removal after any later change to
the repertoire snapshot, protecting subsequent user edits and shared notes.
The guard includes every player profile’s learning comments and recall records,
not just the current player’s visible notes.
Cancellation/discard never applies the preview. No whole-repertoire autofill,
style scoring, learnability model or whole-tree refinement is claimed. Those
remain outside this bounded implementation.

## Clearer study feedback and learning measures

After submitting a model-game guess, **Check my move with Stockfish** assesses
that persisted legal choice. It is unavailable before answering, never reveals
answers during guessing, and validates the same saved quiz version again after
analysis. Playable, weaker and uncertain results are distinct from matching the
historical move. It writes no study score, review event or repertoire recall
credit. Imported annotations keep their source label; no strategic explanations
are fabricated from an engine score alone.

Expand **What am I remembering over time?** on the repertoire home to view the
existing, separately tested delayed-recall measures: scheduled encounters 7–13
days and 14+ days after their previous recorded encounter. Missing data remains
unknown; assisted attempts do not count as unaided success. Matched-game
preparation departures are shown separately and are not labelled chess blunders.
These observations do not prove learning improvement. First-use task timings,
comprehension and causal learning benefit still require human measurement.

## Verification

The actual updated container built successfully. Its [real Stockfish 18 smoke](./evidence/next-four-stockfish-2026-10-22.json)
passed all 12 checks, including missing-response preview, atomic apply and undo.
The new real-engine smoke is also a CI release gate. Earlier local green results
are not reused to mark new behaviours complete. Final unchanged-source local and
Linux browser results are recorded below after completion.

Provider integration is exercised with deterministic Lichess responses and legal
PGN fixtures. No live Lichess credentials or server settings were changed in
this increment. Actual remote availability still depends on the provider and
the installation's existing authorised connection. Desktop and phone comparison
layouts were visually inspected; the compact table keeps results optional.

Final unchanged-source local verification passed **343 unit/integration tests,
180 browser tests, six tracker checks, typechecking and the production build**,
with no failures, skips or flaky retries. Source fingerprint: `8ca7872c8f2ac939aa7c921a5f292a3ec0883b480dd0ae4ed30f15696c176f85`.
The tracker has **109 verified, 40 unknown, 30 unmet and three excluded**
requirements; these counts are not a Chessbook quality/parity percentage.

The saved-game keyboard journey now explicitly waits for the board to become
interactive after an asynchronous save before entering a move. It retains the
original keyboard actions and recall assertions, without retries or longer
timeouts. This fixes a test readiness race caught during the complete run.

The separate [Linux release-browser run](./evidence/next-four-linux-2026-10-22.json)
also passed **180 journeys**, with **zero failures, skips or flaky retries** and
CI mode enabled. The actual container build and all 12 real Stockfish checks
passed. Desktop and phone screenshots were reviewed. These results establish
the tested release candidate; GitHub verification and container publication are
separate steps and must not be inferred from this local report.
