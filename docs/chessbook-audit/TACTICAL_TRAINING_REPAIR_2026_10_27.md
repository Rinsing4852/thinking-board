# Tactical exercise selection — 27 October 2026

The reported example was 3.Bb5 followed by ...a6 in the Ruy Lopez. In a fresh
Stockfish 18 regression, 3.Bb5 received the best-move grade with zero evaluation
loss. ...a6 did not produce a tactical exercise. No special exemption for that
opening or move was added.

## Cause and correction

The previous selector required a saved meaningful-error assessment, but accepted
any newly attacked major/minor piece as high-confidence tactical evidence. It
could not distinguish ...a6 chasing a bishop from a threat that actually wins
material. Capturing a piece was also accepted without verifying the outcome of
the exchange. Startup copied existing blunder cards into punishment practice
without reconstructing the tactical evidence.

The new tactical-punishment-v3 detector requires both:

1. A saved mistake/blunder classification supported by significant loss under
   the existing evaluation transform. A stale label alone is insufficient.
2. A legal engine continuation supporting forced mate or a net material gain
   retained through at least two defensive replies. Material is measured from
   before the alleged mistake, so an ordinary equal recapture does not qualify.
   A check, capture or piece attack alone is insufficient.

This changes exercise selection, not the accuracy formula or chances-v3 report
method. Significant positional errors can remain in game review without being
presented as immediate tactics. The punishment heading now says **Punish a
tactical mistake**, since an eligible mistake need not have the stricter
blunder grade. Feedback states the evidence and an example continuation.

## Existing data and recovery

Startup rebuilds eligibility from the latest completed saved analysis, with no
engine jobs or external requests. Existing IDs, attempts, review states and
practice history remain. Unsupported cards are deactivated; pending sessions
skip them through the existing inactive-item handling. Genuine mating cards
retain their IDs and memory state on repeated revalidation. Retired cards cannot
accept a previously opened answer. Game review links only active blunder cards.

Older reports themselves are not silently rewritten. Request analysis again to
refresh their engine scores. Very short, missing or malformed continuations can
leave a legitimate tactic unverified until new analysis is requested. This is a
conservative saved-line filter, not a full tactical proof-tree search; some quiet
or long sacrificial tactics will be omitted. There is no hard-coded opening
blacklist and no claim of improved engine strength or competitor parity.

## Evidence and limits

The reported personal card was not found in the local database inspected read
only. That installation reported v1.2.1. The defect is supported by the source
rules, a deterministic legacy-card regression and fresh Stockfish tests; no
claim is made about the version or data at another installation.

Unit checks cover the Ruy Lopez bishop retreat, a fair exchange, material gains
for both colours, incomplete/illegal continuations, mate direction and stale
assessment labels. Storage checks preserve attempts and resumed sessions while
retiring an old Bb5/a6 card, and retain genuine mating cards across repeated
startup checks. Desktop/mobile browser journeys keep the sound Ruy line out of
tactical practice and show the actual mate explanation.

The real-engine regression covers the Ruy Lopez, Modern, equal exchange, mating
mistakes for both colours and a queen genuinely left en prise, plus idempotent
saved-data revalidation. Changes are local; no live data update,
commit, push or publication is included in this check request.

## Final verification

- 385 unit/integration tests, 198 Chromium/mobile-WebKit browser checks and six
  tracker tests passed, with no failed, skipped or retried browser checks.
- Type checking and the production build passed. The existing large-bundle
  advisory remains. The v1.5.22 container package also built successfully.
- Real Stockfish 18 passed seven new tactical-selection checks, all 13 existing
  opening smoke checks and all 15 existing analysis-reliability checks: 35 total.
- The feature tracker records 133 verified, zero failed, 41 unknown and 30 unmet
  requirements. The source remained unchanged throughout final verification.

Evidence: `evidence/tactical-training-2026-10-27/` contains the source fingerprint,
test summary and real-engine results. These diagnostic cases establish the
regressions above, not all-position engine quality or measured learning gains.

## Subsequent whole-thinking review

The [whole-thinking review](THINKING_EXERCISE_REVIEW_2026_10_27.md) extends this
initial correction with the v4 detector, separate missed-opportunity and
opponent-punishment exercises, and changes across all five thinking modes.
The verification figures above describe the earlier correction; consult that
review and its evidence for the final combined verification.
