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

The result lists missing answers with **Prepare this answer**. Inspection opens the
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

One explicit sample request fetches at most two remote samples. **Load more
frequency samples** continues that work. With common-move data off, the check
uses cached samples only. Failed or stale samples remain uncertain and can be
retried; saved moves and review records are unaffected.

The default safety limit is 30 full moves from each plan's root, adjustable
between 1 and 60. Each request checks at most 64 policies, 5,000 graph nodes per
policy and 20,000 node insertions. **Check next saved plans** now checks the
next bounded batch without fetching remote samples. The display combines only
contiguous batches from the same content/settings/sample snapshot. It cannot
show whole-repertoire completion until all distinct saved plans are checked.
Changing the evidence requires a fresh check. Shared missing positions combine
by canonical destination across batches rather than being counted twice.

This progress lasts while the view is open; leaving or reloading starts a fresh
check. The single-policy node limit, cycles and depth limit still leave that
plan explicitly incomplete; continuation across policies does not resolve those
frontiers. Merged paths conservatively use the longest reached depth.

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
parity. At that checkpoint, changes were local and uncommitted; hosted
publication had not run. It subsequently succeeded for
`e1da6af`. See the [follow-up review](./RECENT_FEATURE_REVIEW.md) for clearer
missing-answer labels and access to personal-game evidence when common data is off.

Still unmeasured: matched Chessbook task times, human comprehension, live sample
representativeness and later unaided learning. The first-exposure learning loop,
model-game study and reviewed gap-fill recommendations remain separate work.
