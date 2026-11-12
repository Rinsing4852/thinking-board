# Tactical value check — 7 November 2026

## Purpose check and decision

LR04/05/07/11: the learner needs worthwhile tactics, not attacks that win a piece while giving away a stronger position. Existing detection checks net material against the position before the mistake, requires gain retained after defensive replies, rejects terminal draws/losses and constrains answers to the engine's candidate tolerance. Keep those checks and add the existing move-quality measure to reject a candidate that itself loses an inaccuracy's worth of estimated chances against the best stored choice. Do not create another engine, mode, score or explanatory panel.

Expected benefit: fewer inferior alternatives credited as tactical solutions. Acceptance: both-colour evaluation boundaries, loss of forced mate, missing evaluations, a queen-for-rook trap, delayed recaptures, sound sacrifices and existing missed forks/captures/mates; preserve completed attempts and schedules. Costs: small local comparisons using saved scores; no extra analysis or migration. Decision: proceed with a conservative additional eligibility check, retaining unknowns and existing history. Correctness evidence is not evidence of learning benefit.

## Findings and implementation

- Material evidence is **net material**, including sacrifices and recaptures, not merely the piece captured first. It is retained through the last two available defensive replies in the saved legal continuation. That continuation is finite and does not establish every possible defence or later recapture.
- Existing tactical answers must stay within the configured centipawn tolerance of the best stored candidate. A fixed pawn tolerance can still include a move classified as an inaccuracy by the application's own chance-loss scale.
- Add a shared evaluation check: a candidate must lose less than five estimated chance percentage points against the best stored choice. Reject missing/non-finite scores and giving up a stored forced win by mate. Keep the existing centipawn tolerance too. These are app-calculated estimates, not the learner's personal win probabilities.
- Apply the check to generated tactical answers, current focus evidence and newly built game-review answer sets. The review policy revision is versioned so existing saved feedback offers the new review explicitly, while retaining its historical snapshot until refreshed. Completed attempts, schedules and grades are not rewritten.
- Do not require the resulting evaluation to be positive: taking the best available tactic in a losing position can still be worthwhile. A material gain is not a claim of a winning position or game. This pass does not add sacrifice-only lessons without the existing material/mating evidence.

## Verification

All three engineering quality stages PASS with current source evidence. Type checking and the production build pass; 480 unit/integration tests and 240 Chromium/mobile-WebKit journeys pass, with no browser failures, skips or retries. Stockfish 18 passes 21 tactical/value/mating/revalidation checks and nine full-game checks.

The added real-engine traps cover both colours. Stockfish finds a drawing alternative but evaluates the rook capture at roughly five pawns against the capturing side; both net-material and position-value checks reject it. Tests also cover retaining a better position, refusing to give up forced mate, best resistance from a bad position, invalid scores, retiring inferior saved solutions without deleting attempts, and explicitly upgrading an old review while retaining its snapshot. Existing sound-sacrifice, pinned-defender, delayed-recapture and missed-fork cases still pass.

No extra explanatory UI was added. Games, repertoires, completed attempts and schedules are preserved. No dependencies, schema or deployment changes, commit or push. Assess this as a regression safeguard, not comprehensive tactical precision/recall or a guarantee beyond finite Stockfish search.
