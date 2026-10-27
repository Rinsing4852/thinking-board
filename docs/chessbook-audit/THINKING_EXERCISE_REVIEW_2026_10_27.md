# Whole-thinking exercise review — 27 October 2026

## Finding in the supplied game

After **28.g5**, the pawn leaves the d7–e6–f5–g4–h3 diagonal. Both queens can
capture each other. Black has **…Qxh3**; after an unrelated Black move, White
has **Qxd7**. This is both a missed winning opportunity and an exposed own queen.
An attack on a piece or absence of a defender alone is insufficient to call
something a blunder: the saved Stockfish evaluation and continuation must
support a significant error and a concrete material win or forced mate.

A history-aware Stockfish 18 probe at depth 18 (up to two million nodes per
search) found these approximate evaluations, always from White's perspective:

| Black move | Best move | Evaluation with best move | Evaluation after played move |
|---|---|---:|---:|
| 28…exd4 | Qxh3 | −6.98 | +4.25 |
| 29…d3 | Qxh3 | −7.15 | +5.34 |
| 30…Bxb2 | Qxh3 | −6.84 | +5.50 |
| 31…Qxh3 | Qxh3 | −8.27 | −8.27 |

Depth, engine version and search settings affect the exact numbers. These
results confirm the missed queens without claiming to reproduce another
service's −5.21 or +4.20 exactly. The regression fixture keeps the complete move
history but removes player names and ratings.

## Changes delivered

| Exercise | Gap found | Implemented behaviour | Remaining quality work |
|---|---|---|---|
| 1. What changed | Only newly attacked pieces were recognised; alternative true observations could be rejected. | Recognises a saved engine-supported capture and loss of a stationary piece's last defender. Accepts category/square pairs for available captures, attacks and an opened sliding-piece line. After 28.g5, capture/h3, attack/d7 and opened-line/d7 are accepted. | Add curated king-safety, closed-line and genuinely uneventful examples; compare salience rather than treating every true observation as equally important. |
| 2. Candidates | One excellent candidate incurred an arbitrary breadth penalty; a stronger separately checked candidate could still be marked inferior. | Uses game history for search, adopts stronger verified alternatives before grading the set, and gives one excellent candidate full credit. Unsupported threat/improvement labels remain unverified. | Add a practical stopping rule and diversity feedback tied to the position, rather than requiring a fixed number of moves. |
| 3. Blunder check | Primarily trained the opponent's reply after an error; missed captures and own-piece safety were conflated. | Searches before the learner's move for a missed winning capture or mate, and independently after it for an opponent punishment. Missed opportunities show the learner's original position and side. Saved error size plus tactical evidence gate selection. A regression covers moving a protecting rook away and losing a queen. | Group repeated versions of the same missed tactic within a session; add more sacrifice and delayed-recapture cases to measure false positives. |
| 4. Punish | A copied Blunder card could inherit the wrong side's answer; ordinary opening moves could be treated as punishable. | Generates the opponent's actual after-move tactic independently. Black's missed Qxh3 and White's Qxd7 are separate exercises. Fair exchanges and unsupported positional suggestions are excluded; feedback shows the saved continuation. | Add real opponent mistakes as a distinct source, with clear original-side context. Current cards predominantly let learners understand their own mistakes from the opponent's side. |
| 5. Quiet plan | Assumed one weakest piece, rejected alternatives from other pieces, and could call an unsearched move wrong. | Accepts supported quiet improvements from multiple pieces, excludes saved tactical positions and near-best forcing alternatives, and labels an unlisted legal move **unverified**. | Add bounded, on-request Stockfish checks for unlisted alternatives. A saved alternative list cannot establish that a move is objectively wrong. |

## Data and attempt handling

No automatic whole-game analysis is introduced. Import and user-requested
analysis remain separate. Startup revalidation uses saved engine results,
retains exercise IDs, completed attempts and review history, and removes
unsupported tactical cards from future practice. An open unanswered attempt
is abandoned if its tactical evidence changes, so an old board cannot be
answered under a newly changed perspective.

The tactical detector is deliberately conservative. Material must be retained
through at least two defensive replies in the saved legal principal variation;
forced-mate scores must favour the answering side. This is finite engine
continuation evidence, not an exhaustive proof tree. It can miss a longer or
quieter tactic. Undefended-piece observations are factual board observations,
not independent claims that the move is losing.

## Verification and measurement

The repeatable whole-game smoke test analyses all moves with real Stockfish
18 at depth 12 / three principal variations. It checks all three missed Qxh3
positions, separate Qxd7 punishment answers, the three accepted observations,
one-candidate credit, exclusion of the successful 31…Qxh3 from error practice,
and saved-result backfill without new analysis jobs or broken references.
Unit regressions also cover moving away a defender and preserving past answers.
The browser journey plays Black's Qxh3 on the original board in Chromium and
WebKit. Its exercise is mocked to isolate interaction; independent database
and real-engine tests establish actual selection and grading.

Final run counts and engine output are recorded in
[evidence](evidence/thinking-exercises-2026-10-27/verified-run.json). These tests
measure selected acceptance cases, not Chessbook parity or improved human
playing strength. The feature tracker adds CB59.11–CB59.14 for this work.

## Recommended next order

1. **Session diversity:** avoid asking the same queen capture on three consecutive turns while retaining each game's review history.
2. **Quiet alternative verification:** let Stockfish assess a submitted legal alternative on request, with full game history and explicit search limits.
3. **Broader curated decision corpus:** include sacrifices, pinned defenders, delayed recaptures, mates, quiet defence and ordinary opening development. Track false tactical cards and missed opportunities separately, per motif.
4. **Teaching quality:** show the critical defensive reply and ask a delayed recall question. Measure unaided recall over time separately from answer correctness.

For release acceptance, demand no false punishment on the sound-opening
regression set, correct answers and side-to-move for the supplied queen game,
acceptance of documented alternatives, and clean attempt/history handling.
Larger labelled sets are needed before giving precision/recall percentages;
a small passing fixture set must not be presented as general tactical accuracy.
