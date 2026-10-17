# Whole-repertoire encounter coverage

Implementation increment: 17 October 2026. This follows the observation,
inference and fixture-based validation approach in [the reconstruction](./RECONSTRUCTION.md).
It is an independent implementation of the documented encounter-goal behaviour,
not a claim to reproduce Chessbook's private algorithms or prove equal usability.

## Using it

Open a saved repertoire, choose **Find repertoire gaps**, then select
**Whole repertoire** and **Check whole repertoire**. The existing **One line**
view remains available for scoped estimates and gaps observed in your games.
The whole-repertoire result uses Lichess rating-band and time-control samples;
personal game observations are not mixed into that population estimate.

The result lists missing answers with **Inspect position**. Inspection opens the
existing board workflow without changing saved content. Save an answer through
the normal editor, then recheck. Goal success describes saved preparation within
chosen stopping points; it does not measure recall or guarantee a game result.

## Reconstructed behaviour and implementation choices

- Each saved line supplies its learner choices. Elsewhere, the first saved
  primary learner response is the fallback. Identical policies are checked once.
  Black responses to 1.e4 and 1.d4 can belong to one policy; White alternative
  first moves are separate policies. Their probabilities are never pooled.
- These are saved-line policies, not an exhaustive Cartesian combination of
  every alternative at every position. Repeated positions with contradictory
  learner choices in one line cannot earn completion.
- Opponent probabilities come from conditional samples at each reached saved
  position. Paths that transpose combine before the encounter threshold is
  applied. Supported unanswered positions below 1/N are rare; changing the goal
  to a larger N includes rarer positions.
- Samples must match the position, rating and time controls, be fresh and have
  at least 200 games. A reply needs at least five observations. Missing,
  unrepresented, invalid and unsupported evidence stays uncertain, even if its
  estimated path is rare. Saving an answer may still leave a later frontier
  uncertain rather than make the goal complete.
- Terminal positions and explicitly chosen preparation stopping points can end
  traversal. A skipped recommendation is not preparation. Idea-only and
  deliberately unprepared replies remain separate incomplete outcomes.
- Cycles, checking limits and exhausted work budgets cannot earn completion.
  Custom-position roots cannot establish reach from the initial board; this is
  a defensive model rule, not new support for custom-FEN PGN imports.

## Limits and recovery

One explicit request fetches at most two remote samples. **Continue repertoire
scan** resumes the remaining sample work. With common-move data off, the check
uses cached samples only. Failed or stale samples remain uncertain and can be
retried; saved moves and review records are unaffected.

The default safety limit is 30 full moves from each plan's root, adjustable
between 1 and 60. Traversal checks at most 64 policies, 5,000 graph nodes per
policy and 20,000 node insertions across the request. Extra policies are reported
as unchecked and block success. There is no continuation for the local policy
budget yet; remote sample continuation does not remove that limit. Merged paths
use the longest reached depth, conservatively leaving some frontiers incomplete.

## Evidence and remaining comparison work

The new server fixtures cover mixed first moves, alternative policies,
transpositions of different lengths, threshold changes, uncertain/stale samples,
profile-specific stopping points, omitted responses, archived versus paused
content, sample continuation, refresh failure, cycles and policy-budget overflow.

Desktop Chromium and phone-sized WebKit journeys cover the real unknown-data
response, a failed request and retry, incomplete safety limits, missing-answer
inspection without saved-content changes, and rejection of obsolete success
after settings change. Deterministic browser response fixtures exercise known
results; they are not live Lichess accuracy measurements. Screenshots were
visually reviewed at both sizes. Full-suite results are recorded in the tracker.

Final verification on unchanged product/test/catalogue source passed 278
unit/integration tests, 134 browser journeys, six tracker tests, typechecking
and the production build. Browser results had zero skips, failures or flaky
retries. The refreshed tracker has 84 passed requirements, 42 unknown and 42
unmet, with no failed requirements; these counts do not measure competitor
parity. Changes are local and uncommitted; hosted publication has not run.

Still unmeasured: matched Chessbook task times, human comprehension, live sample
representativeness and later unaided learning. The first-exposure learning loop,
model-game study and reviewed gap-fill recommendations remain separate work.
