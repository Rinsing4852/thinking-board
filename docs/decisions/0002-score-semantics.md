# ADR 0002: Engine score semantics

## Status

Accepted.

## Decision

Persist every engine score from White's point of view. A score has exactly one
of `centipawns` or `mateIn` populated. Mate scores are never stored as fake,
large centipawn values.

Centipawn loss is calculated from the mover's point of view and is `NULL` when
either score is a mate score. Mate positions retain their signed mate values.
A capped internal comparison score may be persisted for thresholding and sort
order, but it is never labelled as centipawns or shown to users.

The played move is evaluated from the same root position as the best move. Its
stored MultiPV line is used when available; otherwise the engine is called with
`searchmoves` for that move. Independently searched before/after positions are
not compared for centipawn loss because normal search variation can create
false mistake thresholds.
