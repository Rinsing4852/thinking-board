# Contextual model-game study: first milestone

This records the original imported-PGN milestone. Automatic Lichess discovery
has since been added; see [the current increment and limits](./AUTOMATIC_MODEL_GAMES.md).

From a saved line in browse mode, select a position and choose **Study a game from
here**. Paste complete PGNs into the separate study library, with a source label.
The screen offers up to three matching games and explains each match. Selecting
a game opens its matching position on one board; Previous, Next and Jump to match
save replay progress. Reload restores the study screen and move. Back returns to
the same repertoire line and position, with board focus restored.

This is an independent implementation of the first milestone in the
[proposal](./CONTEXTUAL_MODEL_GAMES.md), using the earlier REA evidence ledger as
guidance. No additional competitor runtime, private ranking algorithm or measured
learning benefit is claimed. REA's MCP/CLI was not installed or run.

## Matching and source evidence

- Match canonical board, side to move, castling and legal en-passant rights.
  Move counters do not distinguish positions. Preserve the game's actual route
  and identify a different move order or supplied starting position explicitly.
- Require legal mainline moves, a supplied finished result and continuation after
  the matched position. A match at the final game position is not a useful replay.
  A declared result is source metadata, not independent proof of how a game ended.
- At the normal initial board, all normal-start games match. Say this is only a
  starting-position match and suggest selecting a later saved move. A custom
  game root explicitly reports that earlier game moves are unavailable.
- Rank identical move order first, then supplied annotations in the next 20
  half-moves, then available continuation (capped at 20 half-moves for ranking).
  Stable game IDs break ties. This rule is transparent, not a validated teaching
  model or an engine quality ranking; winning games receive no automatic bonus.
- Show source label, players, result, supplied date/event/ratings and match reason.
  Missing metadata remains unknown. Show only supplied PGN comments at their
  actual full-FEN occurrence; a later repeated position's note is not attached to
  an earlier visit. Notes are attributed as imported annotations.

## Persistence and boundaries

Migration 037 adds dedicated study-game, position-index and replay-progress
tables. Library and progress belong to the active profile. Repertoires and lines
remain shared under the existing application model; study progress does not.
Import is atomic: malformed or unfinished games reject the batch. Duplicate
legal mainlines retain the first imported game and its source/notes unchanged.

The library holds up to 1,000 games per profile, with at most 100 games and 2 MB
per import and 1,000 half-moves per game. Users can remove any study game from the
library selector, including games not matching the current position. Removing
one also removes its replay progress. Repertoire deletion cascades study progress
for that repertoire, while independently imported study games remain available.

Progress is the most recently selected game/move at each saved repertoire
position. The saved position identity is checked again before restoring it.
Archived repertoires/lines cannot be studied. Invalid cursors, another profile's
games and games outside the offered matching selection are rejected.

Study does not import into played-game tables, add repertoire moves, answer
review items, alter memory cards/due dates, add daily practice credit or improve
preparation coverage. Replay is saved before the displayed move advances. A
failed request retains the last displayed position and offers Reload study;
an ambiguous save locks further replay writes until Reload study reads the persisted
state. Saves also include the position the browser expects: a changed repertoire
position is rejected even if the same example game also matches its replacement.

## Verification and limits

Server tests cover both colours, exact and transposed matches, misleading opening
names, custom roots, castling rights, no continuation, invalid cursors, atomic
imports, deduplication, profile isolation, archive rules, stale progress, repeated
annotation positions and unchanged existing review/played-game data. The
no-inflation fixture starts from an answered scheduled item, so cards/events and
due dates are checked with existing data, not only empty tables.

Desktop and phone journeys use actual import, matching and progress endpoints.
They verify a single board, metadata, annotations, game selection, reload,
return/focus at the original position, unchanged activity/coverage/played games,
malformed-import recovery and deletion of replay progress. A controlled 503 tests
local study-service recovery; it does not establish external-provider behaviour.
External-provider recovery remains unknown in CB40.3.

There is no remote master-game adapter, guess-the-move, generated strategic plan,
full study history, delayed understanding test or rating-calibrated selection.
The board displays played moves, without claiming they are engine-best answers.
Saved study requires the local server. Large-library latency and instructional
usefulness remain unmeasured. CB40 is therefore partial and CB41 remains absent.

The previous milestone passed 299 unit/integration tests and 148 browser
journeys on unchanged source. The pre-release review adds two service tests
and a custom-start browser journey in both projects. Its six focused journeys
passed on macOS Chromium/WebKit and Linux Chromium/WebKit. The final full verification passed on unchanged source: **301 unit/integration
tests, 150 browser journeys, six tracker checks, typechecking and production
build**, with no failures, skips or flaky retries. The refreshed tracker records
86 verified requirements, 43 unknown and 39 unmet. These are evidence counts,
not a percentage of Chessbook instructional quality.

## Pre-release review

The first milestone needed targeted correctness and recovery improvements plus
polish, rather than a broader redesign. Custom-start games now retain the actual
move number and moving side, including games imported before this review. Match
reasons use chess notation; replay steps explain one move by either player.
Import and removal return keyboard focus to matching games.

The review adds checks for a stale browser saving against a changed repertoire,
Black-to-move custom starts, and a save that succeeds on the server but loses its
acknowledgement. In the last case the board waits, further writes are disabled,
and reload recovers the server's saved move. This establishes local recovery; it
does not establish external-provider behaviour or instructional effectiveness.
