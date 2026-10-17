# Continued coverage and learning from home

Follow-up to the priorities in [the recent feature review](./RECENT_FEATURE_REVIEW.md).
This uses the same REA-inspired distinction between known state transitions,
fixture evidence and unmeasured human outcomes. No additional Chessbook runtime
behaviour or private implementation is claimed by this increment.

## Checking a large repertoire

The whole-repertoire view now offers **Check next saved plans** when a
request reaches its policy/work limit. Each request still checks at most 64
policies and 20,000 node insertions, with a 5,000-node cap per policy. A server
fixture with more than 64 distinct policies verifies that continuation reaches
every policy without overlap or omission.

The server supplies a content fingerprint covering model version, player,
repertoire colour, graph, stopping points, preparation decisions, goal, checking
limit and sample evidence. A continuation uses cached data only. Changed inputs
require a fresh check rather than combining results from different states.
Cache-delivery flags and fetch timestamps are excluded from content identity;
sample content and freshness are included. Model-semantic changes require a new
model version in that fingerprint.

The client validates the fingerprint, contiguous offsets, unchanged settings,
total count and unique plan IDs before merging. Whole-repertoire completion
requires every saved plan to have been checked and to meet its goal. Individual
pages beyond the first cannot assert global completion. Missing positions merge
by canonical destination, using the highest per-plan reach rather than summing
different learner choices. Sample-refresh progress is retained across policy
continuation; fetching new samples starts a fresh policy check.

**Limits:** progress is kept only while this view is open; it is not a persistent
background job or a reload checkpoint. The per-policy node cap, cycles, depth
frontiers and uncertain samples still prevent completion. Pagination removes
the fixed total-policy ceiling, not those evidence limits or the cost of reading
the saved graph. Large-scale latency and human comprehension are unmeasured.

## Learning from the recommended action

When the recommended repertoire has unseen saved responses and no due review or
game miss takes priority, home offers **Learn new moves first** alongside normal
practice. This uses the existing secondary-action space rather than adding a
third competing practice button. The explanation states that answers will be
shown before hidden recall. The repertoire card retains its direct teaching
option, and the normal recommended action keeps its existing behaviour.

The recommended teaching endpoint rechecks urgency on the server, restricts the
batch to the remaining daily goal and the configured new-response limit, and
uses the existing persisted teaching sequence. If due reviews or game misses
have appeared since the display loaded, the request asks for refreshed
recommendations rather than silently bypassing them. A completed daily goal
keeps optional extra practice on the repertoire card.

This is still an explicit option. It does not make teaching the default, alter
the scheduler, guarantee retention, or replace a matched usability study.

When several taught answers share a board position, teaching labels their order
and recall asks for answer 1, 2, etc. The number persists for extra retries. This
removes ambiguity without exposing the move itself during recall.

## Previous release failure and mobile stability

The preceding review commit `71f1247` did not publish successfully:
[hosted failure](https://github.com/Rinsing4852/thinking-board/actions/runs/39023557003).
Its WebKit rejected-move tests found the board moving down 8.515625 CSS pixels
when the status wrapped to a second line, in both animated and reduced-motion
cases. The retained hosted screenshot and log support a layout-shift diagnosis;
this is more specific evidence than the preceding local pass.

Mobile practice now reserves space for two short status lines above the board.
Full help/correction text remains visible below the board, so variable-length
explanations do not push the board under the player's finger. Existing geometry,
input-locking and return-animation assertions remain in place, with a further
check after the piece has returned. Text is not clipped or replaced with an
unsupported chess evaluation. Hosted verification of this fix is still required
after a push; local verification alone does not prove the release recovered.

## Verification scenarios

- Server continuation checks all distinct policies across multiple requests and
  rejects changed goals/evidence; cache reuse alone does not invalidate a batch.
- Client tests require contiguous batches, reject duplicate/truncated/mixed
  evidence, deduplicate transposed gaps, preserve sample-refresh progress and
  refuse completion when a checked plan remains uncertain.
- Recommended teaching respects the remaining daily goal, persists the existing
  stage, and refuses to bypass newly due reviews. Normal practice still works.
- Desktop and phone journeys exercise 64 → 128 → 130 checked plans, an error
  after evidence changes, and the home teaching offer with an urgent-review
  counterexample. The coverage UI uses controlled responses from a real response
  template; the server fixture proves actual graph pagination. Home uses fixed
  recommendation/catalogue responses and the existing real teaching endpoint;
  the server test proves recommended-endpoint urgency and goal sizing.
- Taught-answer ordering remains explicit on repeated positions without revealing
  SAN during recall. The existing animated/reduced-motion journeys check stable
  board geometry both during rejection and after return.

Screenshots are visually reviewed. The final full-suite run and tracker record
remain separate from subjective comparison with Chessbook.

Final local verification passed on unchanged product/test/catalogue source:
**294 unit/integration tests, 142 browser journeys, six tracker checks,
typechecking and the production build**. Browser results had no failures, skips
or flaky retries. This includes the original mobile geometry tests and the added
post-return check. The tracker still records 84 passed requirements, 42 unknown
and 42 unmet; those counts are not a Chessbook quality percentage. A fresh hosted
publication is required to validate the Linux WebKit release path.

Hosted follow-up: `bc9ebbd` passed the mobile rejection geometry journeys but
publication was blocked by the WebKit frequency-filter journey (run
`39025106789`). Its trace shows late optional home insights reflowing the
catalogue during the setup pointer click; the target card stayed closed, before
any frequency assertion ran. The shared study helper now uses the native Enter
control and asserts the card's open state. Dedicated pointer-expansion journeys
remain unchanged, as do all frequency and practice-selection assertions. Three
consecutive local WebKit runs passed. This addresses test setup timing; it does
not establish that late home summaries never cause a visible layout shift.

Next: matched clarity/retention measurements, persistent checking checkpoints if
needed, then contextual model-game study and optional sound-alternative evidence.
