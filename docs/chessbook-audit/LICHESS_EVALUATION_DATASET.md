# How the Lichess evaluation dataset could help this trainer

Reviewed 22 October 2026. This is a proposed integration, not a new data provider
already enabled in the application. No bulk dataset download was performed.

## What it contains

The [official Hugging Face dataset card](https://huggingface.co/datasets/Lichess/chess-position-evaluations)
reports 416,442,401 positions flattened into 1,003,347,246 rows, released under
CC0. Rows have a position, engine continuation, depth, searched kilo-nodes and a
centipawn or mate score. Repeated positions can represent different searches
and candidate continuations. These are engine observations, not human reply
frequency or game results.

The [original Lichess export](https://database.lichess.org/#evals) preserves groups
of candidate lines for each evaluation. Its position identity has four FEN
fields, omitting move counters; continuations use UCI_Chess960 castling notation.

## Recommended first use: optional evaluation evidence cache

I recommend a small, separate store for positions already present in the user's
repertoires and game reviews. It should sit alongside the existing local engine
cache and retain external provenance, rather than masquerading as a result from
our configured engine. It would support these outcomes:

1. Show an existing assessment and candidate continuation quickly when reliable
   evidence is available.
2. Flag saved moves worth checking and supply candidates for future preparation
   previews. Treat a flagged move as a question for verification, not permission
   to overwrite the user's preparation.
3. Seed interesting practice positions, followed by fresh local verification and
   a deliberate teaching objective. An engine line alone does not explain an idea.

A position/move absent from the selected evidence must remain unknown and fall
back to local Stockfish. Normal repertoire-recall scoring must remain separate.
The dataset does not supply full player games, player-rating comparisons or
rating-band frequencies. Existing game discovery and practical coverage sources
therefore still have their own roles.

## Evidence rules before numerical grading

- Keep original source revision, retrieval date, position key, depth, search work,
  candidate line and score convention. Do not claim a specific engine version
  where the exported row does not identify it.
- Validate the board and each continuation as legal standard chess. Translate
  supported castling encodings; reject unsupported variants and malformed lines.
- Preserve mate separately and explicitly establish/normalise score perspective.
  Verify Black-to-move examples against the local engine before enabling grading.
- Compare moves from a coherent evaluation group. The flattened table does not
  expose a distinct evaluation-group identifier or candidate rank. Matching
  depth and work values alone must not be assumed to prove common provenance.
  Prefer the original grouped export for best-versus-played comparisons.
- Do not combine a high-depth best move from one search with an older, unrelated
  played-move score. Missing alternative coverage is uncertainty, not a blunder.
- Account for the export's missing move counters and history. Matching its board
  key does not establish the live game's fifty-move or repetition context. Use
  live history-aware adjudication where required.
- Keep external evidence out of our local-engine cache keys. Conflicts, shallow
  or incomplete evidence should trigger fresh analysis, with clear attribution.

## Obtain a bounded slice, then measure

Hugging Face offers [filtered row queries](https://huggingface.co/docs/dataset-viewer/en/filter).
Its documentation warns that filtering can cover only the first 5 GB of a large
dataset and marks such results as partial. An empty/partial response cannot prove
that a position is absent from this corpus. A filtered lookup could bootstrap a
prototype; a versioned offline selection from Parquet or the grouped export is
more appropriate for reliable coverage. A live filtered lookup was not verified
in this review; the web fetch could not access that endpoint.

The first evaluation should collect a fixed, modest set of repertoire positions
for both colours. Record lookup hit rate, source completeness, useful candidate
coverage, latency/storage, malformed records and disagreement with fresh
Stockfish. Include transpositions, castling, en passant, mate and draw-context
fixtures. Decide whether the measured benefit warrants an importer before any
large download or training pipeline. No new ML model is needed for this first use.

## Proposed opening-specific puzzle practice

Status: proposal only; this reliability pass does not add a puzzle importer or
external puzzle practice screen.

Select by the learner's saved repertoire positions and colour, using opening
names as a broad discovery filter. For example, the Ruy Lopez begins
`1.e4 e5 2.Nf3 Nc6 3.Bb5`. Modern positions can arise through different move
orders, including against `1.e4` and `1.d4`, so a strict move-prefix filter would
miss useful transpositions. An isolated evaluation FEN cannot establish which
opening a later middlegame came from; retain the source game's history for that.

Start with the [Lichess puzzle database](https://database.lichess.org/#puzzles),
which supplies opening tags, themes, puzzle difficulty and a source game link.
Opening tags are supplied only for puzzles starting before move 20; later
positions need source-game history to establish relevance. Apply the CSV's first
move to the supplied FEN before asking the learner for a solution. Keep puzzle
difficulty separate from player rating, and puzzle popularity separate from
opening-response frequency. Accept valid alternative mates where applicable.

Prioritize examples using the existing explorer's rating-band and time-control
game frequencies, with sample counts and missing evidence shown explicitly.
Link a puzzle to a repertoire branch through source-game ancestry or an exact
position match; sharing an opening tag alone does not prove a matching line.
Use common, sound replies for recall or plan drills; create tactical puzzles only
when a tactical opportunity has been verified. Do not label a later puzzle's
frequency using an earlier opening move's frequency as though they were equal.

The Hugging Face evaluations can screen candidate positions, but do not supply
human reply frequencies or ready-made puzzle solutions. Fresh Stockfish analysis
must validate newly generated puzzles, including legal solutions and meaningful
alternatives. Preserve provenance, deduplicate transpositions and keep tactical
practice progress separate from successful recall of saved repertoire moves.

Measure this first on a bounded Ruy Lopez/Modern sample: exact repertoire
relevance, colour correctness, source coverage, solution validity and alternative
acceptance, difficulty suitability, load time and useful explanations. Only then
expand to generating new puzzles from full Lichess games.
