# Container publication reliability — 5 November 2026

## Purpose check — LR10/11

The learner could not obtain the latest update. GitHub had accepted commit
59fb716, but Publish container run 42119736815 failed verification before the
publish job, leaving the previous image as latest. Preserve the existing
verification and no-flaky-tests policy; fix the timing defect in the comparison
journey rather than bypassing checks or changing deployment settings. Proceed.

## Evidence and change

All 473 unit tests passed on GitHub. Of the 240 browser journeys, the WebKit
master/practical comparison missed its disclosure click on the first attempt and
passed on retry. CI deliberately treats such a retry as a failure. The downloaded
trace shows the engine suggestion list above the disclosure expanding between
pointer scrolling/positioning and the click; there was no master-data request,
loading state or API error because the disclosure never opened.

The test now waits for the actual three-row suggestion list and the disappearance
of its updating indicator before clicking the native disclosure with the pointer.
It also asserts the open state before checking master sample size, frequency,
rating-band availability and the comparison table. A full local run also exposed the practice-completion journey clicking its manual
options disclosure while the daily plan/focus above it was arriving. That setup
now uses the native keyboard disclosure and asserts it is open before selecting
the game filter, including after reload. Repetitions use distinct learner
profiles to prevent a saved active session in one run from disabling the next
run's filter. Session-count, resume, filter and
non-repetition checks remain unchanged.

No arbitrary sleep, extra retry, weaker data check, application change or
deployment change is introduced.

This is a publication-test reliability fix, not a claim that all possible UI
layout shifts have been eliminated. Existing user games, notes, schedules and
analysis records are unaffected. Rollback restores the earlier test only.

## Verification

Focused repetition: ten master-comparison runs in Chromium and ten in mobile
WebKit, plus five isolated practice-completion runs in each browser, without
retries. Complete current local gate: all three stages PASS, including 473 unit tests,
240 browser journeys with no failures/skips/retries, type checks, the production
build and 25 real Stockfish cases. GitHub must pass verification and publish the
container after this fix is pushed; a successful source push alone does not make
an Unraid update available. Confirm the successful publishing run and registry tag
before telling the learner the update is available.
