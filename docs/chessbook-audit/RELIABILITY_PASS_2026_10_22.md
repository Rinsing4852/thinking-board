# Safari layout and real-engine reliability pass — 22 October 2026

Later implementation and verification are recorded in the
[next four delivery](./NEXT_FOUR_DELIVERY.md). The results and publication
follow-up below retain the history of the preceding increment.

Publication follow-up: the [subsequent app review](./APP_REVIEW_2026_10_22.md)
records three failed and one flaky Linux WebKit release checks. The local results
below do not establish release readiness; publication is blocked pending that work.

## Reproduce before changing behaviour

A controlled phone WebKit test held recommendation/statistics responses until
after pointer-down on a saved repertoire disclosure. Releasing the responses
moved the target by 611.25 px on success and 658.03 px on a statistics failure.
The test failed its strict one-pixel position limit before any board-navigation
assertion. This establishes a real late-content layout problem for that flow,
rather than merely a slow teaching action.

## Fix

Optional practice summaries, progress, coverage and their error/retry panel now
follow the saved repertoire controls. Arriving optional data cannot push those
controls around. The error/retry action precedes the changing summary content.
The top learning routes provide an immediate **Practise my repertoire** action,
which resumes an existing paused session rather than starting another one.
Library loading and practice restoration remain independent of optional data.

The regression keeps the pointer down while summaries/coverage arrive, checks
both document and viewport positions within one pixel, then releases it and
opens the intended board. It covers successful and failed statistics, touch
and keyboard navigation, and the phone's existing compact coverage display.
Both phone cases passed ten consecutive repetitions (20 checks). A test
initially expected a coverage board on the phone; that existing mobile layout
hides the preview board, so the assertion now checks the rendered coverage
advice and loaded state. The strict repertoire-position assertions remain.

The teaching-persistence journey again uses touch/click disclosure, and the
statistics retry again uses a pointer click. Neither relies on the earlier
keyboard setup workaround. This establishes the tested behaviour on the
configured Chromium and WebKit engines, not every physical Safari version.

The first complete regression run found one more missed action on Progress.
A separate controlled test reproduced the game-import button moving 55.59375 px
when player choices loaded. The dashboard now renders its current player in a
stable, bounded selector slot immediately; arriving options do not move the
action. The selector stays disabled until multiple choices are available. The
new geometry test and original navigation-history journey passed five times on
each browser (20 additional checks), using real pointer actions.

## Real Stockfish check

An existing local trainer image contains **Stockfish 18, Linux arm64**. The
current compiled application and smoke script were mounted read-only into a
disposable container. Networking was disabled, and all databases/state were
temporary. No running user installation or saved user database was used.

The repeatable `npm run smoke:stockfish` script passed 11 checks: White and
Black opening choices, a developing move, material-losing moves for both sides,
mates for both sides, a finished position, persisted cache compatibility,
failure followed by real-engine recovery, and the real quality HTTP route.
The HTTP check retained the original helped recall result and practice credit.

The run used the normal 200,000-node budget and 40-centipawn tolerance. Depths
for the scored sample positions were 14–17. Timings are single smoke-test
observations, include warm-cache work, and are not general performance claims.
The [retained result](./evidence/stockfish-smoke-2026-10-22.json) records each
position, move, verdict and environment. This checks the engine shipped in a
deployment image; it does not establish the state of a particular live server.

## Evidence and next step

The complete final verification result is recorded below after the unchanged
source run. Human ease of discovery and delayed learning benefit remain unknown.
The observed library reflow and lack of a real-engine smoke check have now been
addressed, so the next source/evidence feature can proceed once release checks
pass. The [dataset proposal](./LICHESS_EVALUATION_DATASET.md) is a separate
research result; it does not silently enable external evaluations in the app.

## Final verification

The final unchanged-source run passed **333 unit/integration tests, 170 browser
tests, six tracker checks, typechecking and production build**, with no failures,
skips or flaky retries. The tracker records current evidence: **100 verified
requirements, 40 unknown, 36 unmet and three excluded**. These are requirement
counts, not an overall quality or parity percentage. Source fingerprint:
`dd338fa2fc69c9c9728f21e5a12455baef4473b559366fafb82e510cfdc7a76d`.

The real-engine smoke also passed all 11 checks twice in the isolated deployment
image. Screenshots of the phone learning routes and Progress layout were reviewed.
These results were recorded before committing and publishing this increment.
