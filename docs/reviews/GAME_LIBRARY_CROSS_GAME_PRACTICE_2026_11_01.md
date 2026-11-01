# Games library and practice across games — 1 November 2026

## Purpose check — LR01/02/04/06/07/10/11/12

The learner wants a scannable games library, identifiable game sources and practice
by error type across games that updates each source game's review. Existing games
retain platform identities/PGN headers; saved replay checkpoints already contain
verified tactical evidence and local attempts. Reuse these rather than introducing
another engine, scheduler or completion database. Proceed within the requested scope.

## Design and behaviour

- Opponent-only table with Colour, learner-relative Result, Date, Source and Review
  columns. Rows open the game; opponent buttons provide keyboard access. A bounded
  scrolling region keeps headers visible and the opponent column visible while
  scrolling sideways on phones. Search continues to cover the complete library.
- Small words identify Lichess, Chess.com or PGN; no ambiguous icon-only legend.
  Source filtering combines with existing search/review-status filters. Platform
  identity and original Site/Link headers identify sources for existing imports
  without rewriting records. A pasted platform export retains its platform source;
  PGN means no platform was identified, not proof of a particular upload method.
- Explicit **Practise across games** selection uses current saved analysis and
  the existing review board. Types include blunders, mistakes, inaccuracies,
  verified missed attacks/defences, forks, captures, practical mates and opening
  recall. Mate limits remain 1–4 learner moves. Unknown tactical patterns are not
  invented. Opening departures remain distinct from engine errors.
- Selection covers the active player's games and selected source, independent of
  the library's text/review filters; the panel explains this scope. The first 30
  matching positions form a manageable round; total matches and remaining content
  remain visible. Reviewed positions are excluded by default; they can be included
  deliberately. Games without completed analysis are counted, not called clean.
- Finding positions explicitly updates stale review feedback while retaining older
  snapshots/attempts. Analysis never starts from browsing or practice selection.
- Correct answers, reveals and manual review marks use the exact source checkpoint
  and existing event log. Incorrect tries/skips do not mark a decision reviewed.
  Showing an answer counts as reviewed, not unaided recall. A whole game becomes
  complete only when its full checklist is complete (or deliberately marked so).
  Separate opening/engine decisions at one board position remain separate.
- Ordinary local practice does not manufacture scheduled FSRS results, practice
  totals or evidence of improved play. Existing explicit later-practice actions
  retain their meaning. Leaving a round keeps saved per-decision progress; finding
  positions again excludes completed decisions by default.

## Acceptance and protections

Check provenance including unidentified/misleading headers, source filters, both
colours/results, keyboard/row activation, bounded rendering, mobile table scrolling,
whole-library search, exact checkpoint selection, profile isolation, incomplete vs
complete game review, help vs recall, skips and no automatic analysis. Preserve all
game IDs, training history, replay versions and existing opening/game workflows.
No schema, dependency, engine, grading or deployment changes are required.

Costs: snapshot generation and filtering run locally on explicit selection, with no
network/engine work; large libraries may need measured pagination/caching later.
The round's position in the list is temporary UI state; per-decision progress is
stored in SQLite. Rollback removes the new UI/routes without migrating stored data;
existing snapshots and attempts remain valid. Learning benefit remains a hypothesis;
engineering checks do not establish fewer blunders in subsequent games.

## Verification

Final source-matched quality gate: **PASS** for all three engineering stages.
Type checks, production build, **459 unit tests**, **234 browser tests** (desktop
Chromium and mobile WebKit), and real Stockfish suites (16 tactical cases and
9 full-game cases) passed. The final browser run had no skips, failures or flaky
results. Six focused table/navigation/completion checks also passed before the
full run. Screenshots were inspected for the phone layout; the source filter's
44-pixel touch height is asserted in both browser projects.

The browser journey checks all three sources, opponent-only rows, White/Black and
learner-relative results, source-filter retention on Back, non-button row clicks,
cross-game opening practice, skips, two completed source-game checklists, helped
answers remaining unrecalled, removal of reviewed decisions from the next selection
and no automatic engine jobs. Service tests additionally cover severity selection,
profile isolation, retained historical snapshots, exact engine/opening checkpoint
selection at a shared position and repeated answers after help.

An earlier full run had one queued-job timeout during a several-minute pause; the
stored job subsequently completed normally. The same check passed separately in
both browsers. The final complete run passed with idle sleep prevented and without
changing timeouts or application behaviour. Physical-device Safari usability and
learning benefit remain unmeasured. Purpose acceptance concerns useful access to
existing verified decisions and correct records, not a new claim of learning gain.
