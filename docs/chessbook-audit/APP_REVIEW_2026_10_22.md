# App review and next priorities — 22 October 2026

Follow-up: the user deferred opening puzzles (CB58) and requested the other four
areas. See [next four delivery](./NEXT_FOUR_DELIVERY.md) for that implementation
and its verification. The ranking below records the earlier review decision.

## Release decision: blocked pending Linux WebKit investigation

The reliability increment is committed and present on GitHub as
`439ebb98564cd0ea77b665a5d5ccefa8db40e467`. The working folder was clean at the
start of this review. However, its [publish workflow](https://github.com/Rinsing4852/thinking-board/actions/runs/39763652035)
failed verification: 166 browser tests passed, three failed and one was flaky.
The container publication did not complete. A successful push does not mean an
updated container is available.

This supersedes the preceding local-only release-confidence assessment. The
previous unchanged-source local run passed 333 unit/integration tests and 170
browser tests; the real Stockfish smoke passed 11 checks twice. Those results
remain historical evidence, but do not override the failed release checks.

The failing GitHub Linux WebKit journeys were:

- Library deletion: its full-page screenshot exceeded WebKit's 32,767-pixel
  dimension limit on a populated library. This is a diagnostic-capture failure;
  it does not establish that the deletion action failed. Capture a bounded
  viewport or relevant section while preserving deletion and overflow assertions.
- Daily practice: after a piece hint and pointer selections on e2/e4, the
  expected completion was absent. The retained trace shows the hint request
  but no answer submission. Input delivery/geometry is a hypothesis to test,
  not a verified engine or scheduling defect.
- Repertoire import: after clicking Import repertoire lines, the form was absent.
  Reproduce with late optional data and the populated library before assigning
  the cause to scrolling, layout or the importer itself.
- Learn-first: the first attempt did not start learning; its retry passed. The
  initial trace contained no start request. CI correctly rejects flaky retries.

All four affected checks passed in a targeted local macOS WebKit run during this
review (four tests, no retries). That does not reproduce the Linux release
environment or justify declaring these failures fixed. No application changes
or test workarounds were introduced in this review.

## Assessment of the current product

The existing functionality is substantial: saved multi-root repertoires,
position-based navigation, rating-band coverage, turn-aware arrows, independent
move-quality feedback, learn-first and recall, own-game replay/repair, and
matching stronger-player games with replay/guessing. Further expansion of the
guessing controls is a lower priority than reliable access and relevant content.

The source review confirms important remaining limitations:

- Model-game discovery queries only Lichess rapid/classical samples, examines
  at most eight references and offers up to three matching examples. It verifies
  the rating of the player using the learner's side. It has no master-source
  adapter or source switching. An empty sample is not proof no relevant game exists.
- Move statistics come from the rating-band Lichess explorer, not a separate
  master database. These sources need distinct counts, labels and caches.
- Opening-specific external puzzles remain a documented proposal, not a shipped
  screen, importer or populated content library.
- Assisted gap filling and generated-batch undo are absent in the feature tracker.
- The feature report regenerates from local evidence. Its 100 verified,
  40 unknown and 36 unmet requirements are neither a parity percentage nor a
  release verdict. The report currently does not incorporate GitHub failures.

No fresh paid Chessbook runtime audit, first-use user study, or delayed learning
measurement was performed. This review used source inspection, release traces,
targeted local browser tests and official product descriptions, adapting the
[REA observation/evidence approach](https://github.com/morluto/rea/blob/main/docs/browser-observation.md).
REA itself was not installed or run.

## Ranked work and completion measures

| Order | Improvement | Why now | Completion evidence |
| --- | --- | --- | --- |
| 0 | Release reliability and honest readiness reporting | A pushed update cannot currently publish. Local green results conceal release failures. | Reproduce/fix the failed input journeys under Linux WebKit, preserve pointer/touch checks, bound diagnostic captures, and pass the complete release workflow with no failed or flaky tests. Present local checks, release checks and publication status separately. |
| 1 | Opening-specific puzzle pilot | Directly serves the requested Ruy Lopez/Modern practice and supplies relevant content without another large study redesign. | Use a bounded sample of existing Lichess puzzles; identify each by opening family plus exact saved-position match or source-game ancestry, learner colour, difficulty and theme. Handle transpositions and alternatives; show a useful empty state. Every offered item has verifiable provenance and relevance. No repertoire recall credit from tactical practice. Measure usable matches, solution validity, loading and delayed repeat success. |
| 2 | Master-game evidence and source selection (CB22/CB41) | Improves both preparation decisions and the availability of contextual examples. | Compare master and rating-band data at the same saved position with separate sample counts, dates and cache keys. Source switching changes candidates but preserves study. Empty pools stay explicit. Measure relevant matches and successful study starts across both opening families and colours. |
| 3 | Assisted preparation for one gap, with undo (CB27/CB29) | Converts current gap advice into a practical action and closes a major documented Chessbook feature gap. | Preview one bounded continuation, explain the source, apply atomically, preserve authored moves/notes and undo only the generated batch. Exercise cancellation, provider failure, repeated apply and subsequent user edits. Expand beyond one gap only after these pass. |
| 4 | Better explanations and learning measurement | More controls alone do not establish understanding or retention. | Separate historical moves, personal preparation and verified alternatives. Test whether users can find practice, own-game review and model-game study unaided; measure delayed recall separately from assisted completion. |

Chessbook documents [small recommended practice batches](https://wiki.chessbook.com/recommended-moves)
and [gap filling that preserves authored choices and can be removed](https://wiki.chessbook.com/autofill).
These support the comparison goals; they do not reveal its private models or prove
we have matched its learning quality. The external-puzzle pilot is a user-requested
extension, not a claimed Chessbook parity feature.

For the puzzle pilot, the [dataset proposal](./LICHESS_EVALUATION_DATASET.md)
defines the sources and safeguards. Start with existing rated puzzles. Use the
Hugging Face evaluations later for candidate screening/cache experiments, rather
than downloading the entire corpus or treating engine principal variations as
ready-made human puzzles. Current-game frequencies prioritize likely situations;
they must not be presented as the observed frequency of an unrelated later tactic.
