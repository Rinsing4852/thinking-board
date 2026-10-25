# Requested game analysis and progress — 25 October 2026

## User workflow

Importing or syncing games saves them and makes opening comparisons available.
It does **not** request full-game Stockfish analysis. Opening-position guidance
while deliberately building/studying remains a separate position-level tool.
Startup no longer queues unanalysed/outdated games. The migration stops unfinished
legacy work without deleting games or completed results; users choose what to
analyse next.

In **My games**, choose a game and **Analyse this game**, or open **Select games
to analyse**, select individual games or **Select all**, then **Analyse selected
games**. Selection includes off-screen games and survives search. Existing
compatible reports are kept unless **Include games with an existing report** is
selected. Pending games are deduplicated across batches. Scope is the active
player; other players' game IDs and jobs cannot be requested or inspected through
these endpoints. Whole-game reports also work without any opening repertoire.

The persistent queue shows completed/total games. Stop finishes the current game
and retains completed reports. A failed batch can be retried from its first
unfinished game; app restart resumes explicitly requested work. Reports from a
previous successful run remain available during reanalysis or after failure.
One game is processed at a time to bound engine load. Report publication and
generated practice updates commit together; a publication failure retains the
previous report and the existing exercises.

## Move assessment

Every legal played move on both sides is compared with the leading engine move
from the **same pre-move position**. If the played move is outside MultiPV, it is
searched explicitly with `searchmoves`. We retain engine identity, configured
depth, MultiPV, threads and hash size. Reporting requires a completed run with a
quality record for every move; partial or failed runs cannot become reports.

Method `chances-v1` maps White centipawns to an estimated balance using
`100 / (1 + exp(-0.00368208 * cp))`, changes perspective for the mover, and clamps
negative estimated losses to zero. A forced mate maps to the relevant endpoint;
a slower forced mate for the same side does not become an error simply because
its distance changed. Unknown evaluations fail analysis rather than becoming a
zero score. These are model estimates, not personal win forecasts.

Grades use loss in percentage points: inaccuracy >=5, mistake >=10, blunder >=20.
The leading engine move is Best when its loss is below 0.5; other moves below the
inaccuracy threshold are Good. New training assessments use these same error
labels; pawn losses remain stored for candidate/tactical comparisons.

Per-move accuracy uses the documented Lichess transform
`clamp(103.1668 * exp(-0.04354 * loss) - 3.1669, 0, 100)`, with zero loss assigned
100. Game/window accuracy is our simple move-weighted mean, including forced
moves. It is **not** Lichess's game aggregation or Chessigma's score. Complexity,
forced moves, opposition and game length can affect it. The formulas are
independently documented in [Lichess's accuracy explanation](https://lichess.org/page/accuracy).

The report shows learner-side accuracy, move counts, first serious error, first
blunder, a White-perspective balance graph, move grades and engine alternatives.
The existing saved replay board is used for inspecting positions; the report does
not add another board. Repertoire departures are labelled against the **current**
repertoire and remain distinct from chess errors. Saved replay feedback is still
refreshed explicitly, preserving previous feedback and local attempts.

## Progress

**Progress → Are your game decisions improving?** compares the latest 20 eligible
games with the preceding 20, by date played. It reports accuracy, proportion of
Best/Good moves, mistakes and blunders per game, serious errors per 100 learner
moves, and blunder-free games. Only the learner's moves contribute to personal
metrics. Reanalysis replaces a game's contribution rather than adding another
observation.

Engine identity/settings/method form separate comparison groups. Time controls
are separate groups (base seconds + 40 increments: bullet <180, blitz <480,
rapid <1500, otherwise classical). Correspondence and unknown speeds remain
separate; unknown-speed comparisons carry an explicit limitation.
Undated, unfinished, nonstandard-start and zero-learner-move games retain their
reports but are excluded from chronological trends. Small samples are disclosed.
A missing earlier window is unknown, not a zero baseline.

Move 10/20/30 checkpoints include games observed through that move or already
blundered before it. Earlier endings without a blunder are disclosed as
unobserved, not silently counted as successes. Median first-error moves are
conditional on games with that error; blunder-free games do not receive a fake
move number. The separate blunder-free count and checkpoint denominators prevent
that conditional median from being presented as an overall progress score.

No training recall credit is awarded from these statistics. No causal claim of
improved chess strength is made, and no new top-level navigation tab is added.
This delivery does not include opening-specific performance aggregates,
repertoire-wide soundness grading, generated strategic explanations or puzzles.

## Verification

Evidence includes unit/integration tests for scoring perspective, settled-position
loss, mate outcomes, empty/partial data, selection and profile isolation, pending
work deduplication, stopping/resuming, time-control/settings separation and date
eligibility. Browser journeys request single and selected/all analyses, preserve
existing reports, inspect the existing board and open comparable progress on
desktop Chromium and mobile WebKit. Container checks use real Stockfish and a
fresh disposable database; no live user data is involved.

The real-engine checks use Stockfish 18 and verify the White-side Fool's Mate
blunder on move 2 and the Black-side Scholar's Mate blunder on move 3. Fresh
container and persistent restart checks passed; the saved Black-side report
retained its analysis timestamp and restarting created no automatic job.
The separate synthetic 1,000-game server benchmark uses one warm-up followed by
five warm-cache progress calculations: median 53 ms, worst 54 ms on this host.
It measures the server calculation against in-memory SQLite, not browser task
latency or another product's performance. The disposable QA container/volume
were removed after checking; the live app and user database were untouched.

Final frozen-source verification passed type checking, production build, 354
unit/integration tests, six tracker assessment tests and 186 Chromium/mobile
WebKit browser journeys, with zero failed, flaky or skipped tests. Source fingerprint:
`7a49be108b598500404190f9b4d3275d53e1b9dd1b3292a8ba4c93e424debcb2`. Real Stockfish checks and the bounded
server benchmark are saved in `evidence/game-quality-*-2026-10-25.json`. Local
evidence does not by itself establish Linux CI success or container publication.
