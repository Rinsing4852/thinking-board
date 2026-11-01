# Game review and completed analysis — 1 November 2026

## Report and scope

The learner reported a win returning nothing to review and supplied the PGN of
Ivanakos23–olleyr, Chess.com, 27 October 2026. It contains 46 played half-moves,
including 23 learner moves as Black. Game length and result alone do not prove a
mistake, so the supplied game was imported into a disposable in-memory database
and processed through the actual analysis and replay services using Stockfish 18.
The learner's deployed database and original saved review were not accessed;
the original snapshot's exact state remains unverified.

## Supplied game: verified result

At the application's default depth 14, with its existing deeper verification of
potential errors, all 23 Black moves were assessed. The application grades were
**3 blunders, 2 mistakes and 3 inaccuracies**, with estimated Black accuracy 38.0.
These are this application's grades at these settings, not a claim of identical
Chess.com grades or a measured playing-strength rating.

| Black move | Verified grade | Stored stronger suggestion |
|---|---|---|
| 3…h6 | Inaccuracy | Bxb2 |
| 8…c6 | Inaccuracy | Be3 |
| 14…c5 | Inaccuracy | e5 |
| 15…Bd7 | Blunder | Kf7 |
| 17…Ba5+ | Mistake | e5 |
| 18…Ba4+ | Mistake | e5 |
| 19…Qc7+ | Blunder | Rc8+ |
| 20…Rb8+ | Blunder | Qc2+ |

Winning the game did not eliminate these review opportunities. The analysis
pipeline generated training material; an empty review is not explained by an
absence of detected errors in this reproduction.

## Purpose check — LR04/07/10/11/13

The learner needs an honest review of their analysed game, including inaccuracies,
and clarity about saved versus current feedback. Existing move assessments already
record inaccuracies, and existing review snapshots preserve history. Reuse those
records and the deliberate latest-review action; do not lower blunder thresholds,
invent errors or start analysis automatically.

## Findings and changes

1. The replay and review-note queries filtered on `meaningful`, which includes
   mistakes/blunders but excludes inaccuracies. Include recorded inaccuracies in
   board review and optional local practice. Ordinary inaccuracies do not become
   scheduled tactical drills; severe errors retain priority in recommendations.
2. An open replay loaded only when its game changed. Analysis completion refreshed
   its parent/report but could leave the board silently using pre-analysis state.
   Refresh the saved replay on completed-analysis signals, deferring reads during
   an in-flight answer save. Preserve used snapshots/attempts and offer a clear
   one-click action to review the latest results.
3. Show assessment coverage and counts for the latest completed run. Distinguish
   incomplete assessments, genuinely threshold-clean analysis, older board feedback
   and a practice filter with no eligible answers. A limited engine result is not
   a claim that every move was perfect.
4. Select the latest completed run consistently by completion time and insertion
   order. Timestamp ties must not select an older random UUID or duplicate notes
   from multiple runs. The move report starts with an inaccuracy when no more
   serious error exists, rather than defaulting to the first move.
5. The supplied game also exposed a false missed-mate point at 23…Bc2#:
   Stockfish preferred the alternative Qc2#. Exclude good moves that actually
   deliver checkmate, or match a verified stored short mating answer, from
   missed-mate review. Preserve genuine errors and missed practical mates.

## Protections and costs

No schema, scoring thresholds, imported games, stored attempt history or deployment
configuration changes. Older saved feedback is retained when replaced. Summary
reads are bounded to the selected game's own moves. No mandatory external service.
Learning benefit is unmeasured; acceptance here concerns correctness and clarity.

## Verification

Final checks passed after the supplied-game correction. Regressions cover inaccuracies without serious mistakes,
truly clean complete analysis, incomplete coverage, tied runs, retained previous
feedback, alternative successful checkmates and analysis finishing while a used
replay is open, including completion during an in-flight answer save.

The final complete run passed type checks, production build, **454 unit tests**,
all **232 browser tests** (Chromium and mobile WebKit) without skips, flaky results
or failures, and both real Stockfish suites (16 tactical cases and 9 full-game
cases). All three learning engineering gates pass with current source evidence.
The supplied PGN was separately analysed twice with real Stockfish: both runs
returned identical learner error grades; the corrected replay contains exactly
the eight error points above and does not flag the successful final checkmate.
Physical-device Safari usability and learning benefit remain unmeasured.
