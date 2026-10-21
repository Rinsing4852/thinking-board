# Learning routes, move quality and model-game guessing

## Scope and evidence approach

This increment implements the three recommendations from the
[readiness review](./NEXT_FEATURE_READINESS.md). The user's repeated difficulty
finding stronger-player games supplies the discoverability problem. The delivery
uses explicit behaviour specifications, reproducible fixtures, recovery checks
and separate unknowns, following the adapted REA approach. REA itself was not
installed or run. No new paid-account comparison, competitor timing or human
learning study was performed in this increment.

## Finding the right activity

The opening home now starts with **Choose how to learn**. It distinguishes
repertoire recall, review of a played game, and study of a stronger player's game.
The latter lets the user select a repertoire and opens matching-game study at
the end of its first active saved line. Back to saved position permits selection
of another point using the existing board navigation. The choices are available
when ordinary opening practice is paused as well as before a session starts.

The shortcut to played-game review opens My games. The model-game shortcut opens
the separate study library/search, rather than importing an example as a game
the learner played. No extra token or API setting is required for guessing;
automatic game discovery retains its existing server Lichess-token requirement.

## Chess quality and memory recall

After a legal move differs from the requested response, the recall screen offers
**Check this move's chess quality**. The server requires a recorded guess for
that active profile, session and queue entry. Assessment does not record another
answer or amend memory history. A reload retains the last different move so the
optional check remains available. An assessment finishing after the practice
position changes is rejected.

The local engine compares the unrestricted leading move with the played move,
using a restricted root search if it was outside the leading candidates. Both
scores use the original mover's perspective. Per-line depths must be at least
10; finite scores, mating outcomes, failed searches, missing lines and terminal
positions are handled explicitly. Score bounds are not treated as exact values.
A failed engine search closes its process before another can begin, preventing
late output from answering a subsequent request.

The verdict is playable within the configured tolerance, weaker relative to the
leading move, or unverified. It is an engine estimate, not proof of soundness or
a generated strategic explanation. Cache identity includes the exact full FEN,
requested moves, engine identity, search budget and engine settings; the cache
format changes to retain individual search depths. Neither an unavailable engine
nor shallow evidence invents a blunder label. Sound unsaved moves still do not
earn repertoire-recall credit, and later corrections keep the initial help/miss.

## Guessing the stronger player's continuation

In a saved example replay, **Guess the player's moves** switches to one board.
Questions occur on the repertoire colour's turns; the recorded opponent moves
are followed between questions. The active guessing response omits the full
replay and future annotations. A piece hint names the moving piece and origin;
showing the move or making a legal guess reveals the actual historical move and
its supplied annotation, if present.

A different legal guess is explicitly ungraded. Matching the historical move
does not claim it was the strongest move. There is no live engine grading or
invented plan text in model-game study.

The first attempt per question is retained separately from local retries. Hints
and reveals are marked as help. Retrying hides the answer; repeating a completed
study preserves its first results. Migration 040 stores quiz progress and
per-game/context history independently of scheduled opening recall. Exiting,
switching examples and returning can resume the saved quiz for that exact
context. These records cascade when the study game is removed.

Quiz writes use a version check. Old tabs, duplicate answers and illegal guesses
cannot advance saved state. If a save acknowledgement is lost, the screen locks
writes until **Reload study** recovers the committed state. Active guessing hides
the search/import panels, and returning to replay restores them.

## Validation and remaining measurements

Focused browser journeys passed on desktop Chromium and phone WebKit for home
entry, both repertoire colours, hidden notes, guesses, hints, first-attempt
preservation, repeats, reload and lost acknowledgements. Service checks cover
profile isolation, illegal/stale/duplicate actions, deletion, no changes to
scheduled practice, both score perspectives, shallow/missing/failed analysis,
mate evidence and engine process recovery. Screenshots of the route chooser,
question and quality feedback were inspected. The complete verification outcome
is recorded below after the final frozen-source run.

Browser tests use deterministic engine/provider fixtures, while service tests
exercise score perspectives and failure cases explicitly. Stockfish is not
installed on this host's command path, so this increment does not claim a live
engine accuracy or latency benchmark. Existing server engine configuration is
used in production. An off-screen skip link appeared in stitched phone captures;
a separate browser measurement confirmed it was unfocused and entirely above
the viewport, rather than an actual board overlay.

Two earlier complete runs exposed test setup problems. New imported examples
displaced older ranking fixtures between browser projects; the new journeys now
remove their own examples after each test. A separate teaching-persistence setup
hit the previously recorded Safari disclosure click/reflow issue. It now uses
native keyboard disclosure and checks the open state, with an independent new
fixture per repetition; five consecutive phone repetitions passed. Other pointer
journeys remain. This setup correction does not establish that the broader
Safari optional-content reflow issue is fixed.

Human first-use comprehension, delayed retention and comparison timings remain
unknown. Model games still lack alternative-guess engine grading, generated plan
explanations, a full history browser and master-source switching. These are
separate gaps; the automated tracker is not a percentage of Chessbook parity.

## Final verification

The final run passed on unchanged product/test/catalogue source: **333 unit and
integration tests, 162 browser tests, six tracker checks, typechecking and the
production build**. There were no failures, skipped checks or flaky retries.
The refreshed tracker records **97 verified requirements, 42 unknown, 36 unmet
and three excluded**, with current evidence. Its fingerprint is
`438b427583a6e623f4670a15f18c0ddd657b7eed83950975bc730e4cd3613a23`.
These results describe the source fingerprint above, verified before publication.
