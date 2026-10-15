# Opening UI review — 15 October 2026

The builder repeated opponent guidance in the arrow legend and the move panel.
Engine evaluations were hidden, changed perspective with the turn, and covered
only the engine's three preferred moves rather than the practical replies.
Opening analysis displayed a second board beside the repertoire board.

## Changes

- One move panel combines the arrow control, move choices, frequency and visible
  evaluations. The repeated below-board move legend is removed.
- A position score uses the unrestricted leading Stockfish candidate. Each
  displayed move has its own evaluation, including separately evaluated popular
  or saved moves outside the engine's top three. Missing values stay unavailable.
- Scores consistently use White's perspective: positive favours White, negative
  favours Black. Search depth is shown. Game results remain optional and clearly
  separate from engine evaluations.
- Own-turn engine choices lead the list; opponent choices use frequency when
  available. No-frequency positions use labelled engine choices rather than
  implying that engine preference measures likelihood.
- “Try moves without saving” replaces the second board with an optional mode on
  the same board. “Return to saved line” exits it. Adding an explored sequence
  remains explicit; saved moves are unchanged until then.
- Recall boards receive no new scores or suggestion spoilers. Coverage and game
  review keep their own context-specific functions.

## Validation

Unit checks verify White/Black signs, mate direction, unknown values, legal move
validation, bounded explicit move searches, caching and preservation of the
unrestricted position score. Desktop Chromium and mobile WebKit checks verify a
single board, unchanged saved lines during exploration, one reply list, default
visible scores, frequency order and arrow controls. The feature tracker records
full regression results.

The live Safari session could not be inspected because the Mac was locked.
Visual inspection uses disposable local browser fixtures; their sample scores
and frequencies are test data, not live chess assessments.
