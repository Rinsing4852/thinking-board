# Daily practice and game teaching — v1.5.24

This batch implements the first three priorities from the whole-app follow-up:
a release-blocking Safari journey, a clear daily practice plan, and a stronger
review-to-practice teaching path. Opening puzzles remain deferred.

## Release reliability

The preceding `2b7e58f` run failed on Linux WebKit in the preparation-task test:
it conditionally selected a library card while restoration of the saved
workspace was still in progress. On retry, the same repertoire could retain
more than one postponed/skipped task and an unscoped Restore selector failed.

The test now creates a unique repertoire per retry/repetition, waits for its
saved workspace URL and heading, and follows the identity of the selected task
through postpone, restore, skip and reload. It retains real pointer interactions
for those task actions. The UI deduplicates history by task identity and includes
line context so repeated move names are distinguishable. Retry and flaky-test
rejection remain enabled. No test is skipped and the timeout is not increased.
Five consecutive local WebKit repetitions passed before full verification.
Full verification also exposed a faulty assumption in the player-switch regression: daily-plan discovery legitimately matched the second player's game to shared preparation. A loose “0 matched games” assertion could match “per 100 matched games”. The test now prepares distinct one-game and two-game match totals, checks the exact summary, isolates repeated player fixtures, and waits until the old response is intercepted before switching. The production cancellation guard already rejected the late response; no change to that component is needed.
Linux publication remains a separate GitHub Actions gate, not a claim established
by local tests.

## One short practice plan

Today offers one primary daily-plan action. A new plan contains up to five
opening responses followed by up to five due game exercises; an already active
session is resumed first, with its queue and original game-date filter intact.
A guided opening lesson and its pending answer are resumed rather than abandoned
to create a recall session.
Existing opening recommendation and thinking-session algorithms select the work.
Local game matching runs before a new opening recommendation so fresh repertoire
misses can take priority without opening another page first.

Migration 047 persists the plan per player/local day, its session links and
counts. An unfinished plan survives midnight and explicitly identifies its
original date. Completed plans do not silently start another round the same day.
Deleted or unavailable blocks are not recreated with invented content. A plan
completion describes a short routine, not mastery, the whole due library, or
completion of the separate opening daily goal.

Opening recall and game-practice scores, provenance, schedules and history remain
separate. Creating, resuming or viewing a plan neither analyses a game nor records
an answer. The client ignores stale requests after profile/filter changes; the
server rejects a start for a player who is no longer active. Opening practice has
a visible return-to-plan action. Standalone practice remains available, with its
board initially hidden until a mode or session is chosen.

## Learn from a few important decisions

A saved game review selects at most three decisions. It prioritises the largest
saved engine concessions, groups the same suggested move persisting across
consecutive learner turns, and includes repertoire differences if there is room.
This is a transparent heuristic, not a claim to identify the three most teachable
moments with a calibrated model. All marked decisions and the complete replay
remain available. Repertoire differences retain their neutral labels.

Answers and continuations are hidden until a response is recalled or revealed.
For engine decisions, the existing board can step through a short legal stored
continuation for a better move, or the move actually played followed by the
opponent's engine reply. Missing or malformed continuation tails are not invented.
Examples are labelled as possible engine play, separately from the game as played.
On mobile, selecting or stepping through an example brings the complete board below the sticky navigation. Ordinary replay controls are hidden during the example, with an explicit return to the decision. The original replay state and local attempts persist. A short review is complete
only after all selected decisions have been visited in that round; jumping to the
last one cannot mark earlier decisions reviewed. Revealing and immediate retries
remain helped/local practice.

## Next-day recall without duplicate credit

An engine decision with a legal saved answer can be scheduled explicitly even
when automatic Candidate generation omitted it because it had one line or the
learner was in check. The existing candidate exercise is reused when present;
otherwise the existing generator creates one from the latest saved analysis.
No new engine search or copied answer from another position is used.

The first request sets its review due time 24 hours later and writes a unique
follow-up record for that player's source move. Repeated clicks do not create
another exercise, push the date forward, or award recall. Later requests display
the current review date rather than resetting a successful card. Reanalysis must
be reflected in the saved game feedback before scheduling. Opening decisions
continue to use their existing repertoire follow-up behaviour.

A user can still deliberately review a future card early. Scheduling alone is
not evidence of delayed recall or better play. No new retention statistic is
claimed in this batch.

## Verification

Final verification and real-engine output are recorded in
[evidence](evidence/daily-practice-and-teaching-2026-10-27/verified-run.json).
Unit tests cover profile isolation, restart/midnight/filter persistence, local
game-miss prioritisation, key-review completion and idempotent next-day follow-ups.
Browser journeys cover the linked plan and single-board defensive continuation
in Chromium and WebKit. The daily-plan journey completes the existing opening
queue through its public API; separate opening journeys cover its gestures and
grading. The new thinking and game teaching interactions use the real local API.

The anonymised full-game Stockfish regression also checks the supplied Qxh3/Qxd7
example, next-day scheduling, repeated-opportunity grouping and a complete opening
block linked to game practice. These are selected acceptance cases, not general
tactical precision, competitor parity, or a demonstrated human learning benefit.

## Next priorities

Broaden the labelled decision corpus (sound sacrifices, pins, delayed recaptures,
quiet defence) and make progress conclusions link directly to their source games
and relevant practice. Measure later unaided recall separately from engine-answer
agreement. Add broader semantic motif grouping only with labelled evidence.
