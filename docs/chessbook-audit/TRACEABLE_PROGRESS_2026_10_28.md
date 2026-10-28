# Traceable progress and tactical regression — v1.5.25

This batch continues the next priorities from the daily-practice release: broaden
labelled tactical evidence and connect progress figures to source games.

## Behaviour

The progress response includes exactly the recent twenty and earlier twenty
eligible games used in the selected comparison. Ordering, player ownership,
time-control and engine/analysis-method grouping use the existing selection;
excluded and older games cannot appear as contributors. Each source shows the
player's accuracy, mistake and blunder counts, and first blunder (falling back
to first mistake). Blunder-free games retain an empty first-error field.

A collapsed section reveals these sources without adding a navigation page.
Review opens the position before that move on the existing replay board. The
game and position are in the URL, so reload preserves the destination. Saved
feedback can be refreshed from existing analysis; no new engine job is requested.

Where an active, scheduled Blunder Check item exists for that player's game,
a separate action opens it through the existing trainer. It can concern another
decision in that game; the UI says so. It neither creates an exercise nor changes
its due date or score. Games with no suitable item offer review only.

## Labelled tactical checks

The engine selection corpus adds a sound queen offer in the Legal pattern, a
pinned knight unable to recapture a queen, moving a queen's protecting rook away,
a sound exchange with a delayed game recapture, and quiet g3 defence against
Qh4 mate. Existing ordinary development, equal exchanges, queen loss and mates
remain. Each fixture has a motif and an expected tactical/non-tactical label.
The output separates false tactical cases on negative labels from missed cases
on positive labels. Conservative legal-PV unit checks cover the pinned defender
and a delayed recapture that cancels the apparent material gain.

No tactical thresholds have been changed to fit these examples. The corpus is
small and deliberately selected; it does not estimate general precision, recall,
playing strength or human learning benefit. Custom-FEN engine fixtures are not
added to the user's games or mixed into normal-start progress trends.

## Verification

See [saved evidence](evidence/traceable-progress-2026-10-28/verified-run.json).
Database tests verify window membership/order, metadata, inactive practice-card
exclusion and existing profile/cohort eligibility. The browser journey checks
collapsed source content, the exact replay destination, reload, saved practice
and no analysis request in Chromium and WebKit. Real Stockfish checks run in a
disposable container without network access; no user data is used.

The feature tracker adds CB60.8 and CB59.17. Its feature badges now use the actual number of requirements rather than a hard-coded denominator of three. Acceptance coverage is distinct from
competitor parity or a causal improvement claim.

## Remaining work

Expand the labelled set with independent positions and both colours per motif;
include negative examples where a defender only appears pinned. Collect later
unaided recall outcomes before claiming better retention. Progress still does
not adjust for opponent strength, position difficulty or selection of games
for analysis.
