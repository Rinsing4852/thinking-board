# Whole-app review repairs — 26 October 2026

Version 1.5.21 implements the seven findings from the
[whole-app review](WHOLE_APP_REVIEW_2026_10_25.md), plus installed-build visibility.
The original review and its before-change evidence remain historical records.
The later [thinking-practice repair](THINKING_PRACTICE_REPAIR_2026_10_26.md)
records the subsequent counter/date-filter changes and their latest verification.
No new navigation category or automatic whole-game analysis was added.

## Game identity and incremental sync

Move-content fingerprints remain available, but no longer define own-game
identity. Recognised Lichess/Chess.com game URLs supply stable source identities;
other PGNs use canonical content, players, date/time, time control and round.
Identities are scoped to the learner. Annotation changes do not create a new
record; different opponents, dates and time controls can distinguish repeated
move sequences. Identical undated exports without a source ID or distinguishing
metadata remain inherently ambiguous.

Migration 044 retains all game IDs, original PGNs, analysis links, cards and
attempts. ImportService upgrades legacy identities from retained metadata.
Historical source-ID collisions keep their existing rows under separate legacy
keys instead of deleting data or failing startup. Existing known Lichess account
aliases stay attached to their learner; pasted/synced games can share that profile.
No game content is silently replaced merely because a new export has the same
source game ID.

Initial sync still selects the most recent requested number of games.
Incremental sync uses the documented Lichess `dateAsc` order, a one-second
boundary overlap and bounded lookahead including known boundary records. It
consumes the oldest unseen games first, advances only over verified/consumed
records, and persists whether another batch is available. **Continue syncing
games** appears when appropriate. Known games pasted earlier do not block the
cursor. Equal timestamps remain inside the overlapping boundary on the next run.
Provider parsing/identity/date failures do not advance the cursor. Concurrent sync
requests for one profile are rejected; a slow connection remains bound to its
requesting profile.

A response request is capped at 1,000 games to bound unusually large timestamp
collisions. An unadvanceable boundary stops with an explicit PGN-import recovery
message instead of skipping records. This is not an exhaustive account-history
backfill or automatic recovery of games skipped by older versions. Previously
missing games can be reimported from a source PGN after installing this fix;
retained original import batches are not automatically replayed when the learner
association cannot safely be inferred.

Official source: [Lichess export parameters](https://github.com/lichess-org/api/blob/master/doc/specs/tags/games/api-games-user-username.yaml).

## History-aware analysis and coherent candidates

Whole-game analysis supplies the initial FEN and all preceding moves to every
baseline, restricted played-move and extra verification search. The engine
validates that the history reaches the requested board. Terminal checks use the
same history, including repetition, rather than reconstructing an isolated FEN.
A claimable draw is terminal at a recorded drawn ending; repetition in a continuing
game is sent to Stockfish instead of forcibly ending the position. Position-only opening guidance remains a separate valid operation.

New reports use `chances-v3`, analysis version 5. The accuracy aggregation and
error thresholds are unchanged from v2; the input context and candidate integrity
are corrected. v1/v2 reports remain readable and separate from v3 comparisons.
An explicit request can upgrade them; startup/import still do not request analysis.

The UCI reader commits an immutable complete candidate set only after receiving
ordered, same-depth ranks with distinct legal root moves. Partial updates at the
same or a different depth cannot overwrite it. The browser merge also preserves
a leading candidate over a lower-ranked duplicate. Opening cache keys advance to
`opening-v5` so older inconsistent evaluations are not reused.

Real Stockfish regression cases cover mirrored repetition examples, twelve
bounded candidate searches across the starting position, Ruy Lopez and Modern,
and latest-analysis replay preservation. These are diagnostic regression cases,
not a measured overall engine-strength or competitor-parity score.

## Analysis to replay, Today and player progress

An unused pre-analysis replay (version zero, no local attempts) picks up completed
analysis on its next load, retaining its old snapshot. Used reviews stay intact.
**Review latest analysis** and per-move inspection explicitly open a current
snapshot at the selected decision in one action, retaining earlier feedback and
attempts. Manual **Refresh saved feedback** remains available for older review
work. No replay action creates unrequested engine work or grants scheduled
recall credit.

Today now distinguishes saved games awaiting analysis from analysed games with
no suitable thinking exercises. It provides **Choose games to analyse** or
**Review saved games**. Empty exercise panels also route existing games to the
library, instead of repeatedly requiring another import.

Expanded learning results clear and reload on profile refresh, aborting old
requests. Game-quality cohort/time-control filters reset when the player changes,
preventing the previous player's selection from producing an invalid comparison.
The browser regression holds an old player's response until after switching to
verify that it cannot overwrite the new player's results.

## Installed release identification

The health response includes deployment build metadata. GitHub container builds
supply their commit SHA, and the footer shows its short identifier alongside
v1.5.21. Local builds without metadata remain explicitly unknown. This identifies
a deployed build; it does not pull, restart or update an existing installation.
The old local v1.2.1 installation observed during review was not modified.

## Verification

Acceptance checks in the existing REA-style tracker now cover identity retention,
backlog completion, history propagation, candidate coherence, one-action replay,
Today routing, player refresh and build visibility. The current tests preserve
the safeguards for requested analysis, private profiles, assisted recall and
existing database upgrades. CI also runs the new real-Stockfish reliability
script and retains its evidence alongside the existing smoke checks.

The before-change review evidence is in
`evidence/whole-app-review-2026-10-25/`. This repair pass records new evidence
separately; old captures are not presented as current results.

Final verification passed with unchanged source throughout the run:

- 374 unit/integration tests, 192 Chromium/WebKit browser checks and six tracker tests; no failures, retries or skipped browser checks.
- Type checking and production build passed. The build retains its existing large-bundle advisory.
- Real Stockfish 18 passed 15 new reliability checks and all 13 existing smoke checks. Results are saved in `evidence/app-reliability-stockfish-2026-10-26.json` and `evidence/app-reliability-opening-stockfish-2026-10-26.json`.
- The v1.5.21 container built successfully and passed the fresh-installation/API smoke test with real Stockfish and isolated temporary data. That disposable installation was removed.
- The refreshed tracker records 128 verified, zero failed, 41 unknown and 30 unmet requirements. This remains acceptance evidence, not a numerical Chessbook quality comparison.

Changes are local and uncommitted. No push, publication or live installation update was performed in this repair request. Older analysis requires an explicit new analysis request to obtain history-aware v3 scores; games omitted by older imports/sync may require PGN reimport.
