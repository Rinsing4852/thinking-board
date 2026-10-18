# Saved review, replay and recall inside each played game

## Delivered flow

In **My games**, select a game under **Inspect a complete game**. Its primary
review is one board with Previous, Next, a move selector, Next decision and a
list of marked decisions. The full recorded game is replayed, including custom
starting positions and actual move numbers. Saved reviews are labelled in the
game library and resume their current position after reload.

Repertoire differences, opponent surprises, preparation ending and analysed
player mistakes remain distinct. Later learner departures are marked when a
game re-enters a known position of the matched repertoire. Unknown later
positions do not receive invented repertoire answers. A deviation is never
labelled a bad chess move solely for differing from preparation.

At a recall point, answers and highlights stay hidden. Play a legal move, reveal
an answer, or continue without trying. Saved alternatives at the exact repertoire
position are accepted. Revealing or recalling previews the response on the board;
**Continue game as played** returns to the actual game continuation. Another try
hides the answers again. Notes follow the chosen saved response, so an accepted
alternative does not receive another move's explanation.

Engine questions use the latest completed analysis when the review is saved.
Only legal stored candidates within the configured centipawn tolerance of the
best stored score for the player's side are accepted; mate scores retain their
separate utility. Unlisted legal moves remain unverified, not automatically
blunders. No live engine analysis is run for a guess. Opponent departures and
content gaps without a taught answer are information points rather than quizzes.

## Persistence, recovery and practice boundaries

Migration 039 creates per-game feedback snapshots, replay state and local attempt
records. The active profile must own the source game. Feedback snapshots contain
moves, accepted answers, explanations and decision provenance; question responses
omit answer fields and notes. Games retain older snapshots/attempts when a review
is explicitly refreshed, although a version-history selector is not provided.
Deleting the game cascades its snapshots, progress and local attempts.

A completed analysis or changed repertoire/annotations makes older feedback
refreshable on the next load. It is not silently substituted. Refresh restarts
the displayed review using current material. Current detailed notes remain
separate and collapsed; the previous duplicate comparison board is removed.
Optimistic snapshot/version checks reject old browser writes. After an uncertain
save, the client disables further writes and offers Reload saved review.

Opening/review cards, recall events, scheduled attempts, practice totals and
coverage are unchanged by replay, local guesses and reveals. Local helped and
unassisted results are retained separately. **Practise later** is explicit: it
makes the corresponding existing repertoire position or active candidate exercise
due without resetting memory history, recording an answer, or creating duplicate
exercises. It rejects outdated feedback. Where analysis did not produce a
suitable candidate exercise (for example some checks/forced positions), the user
can retry within the game but is not offered an inappropriate punishment quiz.

## Evidence and limits

Service checks cover hidden answers, ordinary and custom-start replay, saved
alternatives and their own notes, re-entry departures, opponent/gap separation,
player-side engine tolerance, mate scores, unverified guesses, helped reveals,
profile isolation, illegal input rollback, stale tabs, refreshed feedback and
retained prior snapshots, duplicate-free later practice, and unchanged normal
recall data. Browser journeys use actual import/replay endpoints, exercise
moves on the board, resume after reload, check a single board and normal activity,
and recover a committed save whose acknowledgement was lost. The existing
full-game-to-opening-practice journey also uses the new single board.

This does not measure instructional benefit or claim Chessbook parity. It does
not infer strategic explanations for engine lines, analyse unlisted guesses or
provide a history UI for old snapshots. The generated quality tracker records
the final verification result after its complete run.

Final verification passed on unchanged source: **316 unit/integration tests,
156 browser journeys, six tracker checks, typechecking and production build**,
with no failures, skipped checks or flaky retries. The six replay/preparation
journeys also passed together in isolated Linux Chromium and WebKit. An earlier
full run exposed shared-player/competing-repertoire test fixtures and an overly
broad status locator; these were isolated before repeating the final suite.
The refreshed tracker records 92 verified requirements, 44 unknown and 36 unmet.
