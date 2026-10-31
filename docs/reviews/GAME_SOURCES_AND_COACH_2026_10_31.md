# Learning from every game — Chess.com import and coaching direction

## Purpose check

**Need (LR01, LR02, LR10–LR13):** the learner now plays on Chess.com as well as
Lichess. All games should inform one learning plan. A coach should help them learn
what to notice rather than simply list poor moves.

**Existing capability / simplest option:** PGN parsing already understands
Chess.com game IDs. Profile aliases, imports, requested Stockfish analysis,
game-quality reports, opening comparisons, replay and practice already exist.
Reuse those systems. Add one optional monthly import disclosure to Add a game;
do not create another library, board or training system.

**Expected benefit:** less copying to bring games into the existing learning
workflow. This is a usability hypothesis, not a measured reduction in blunders.

**Acceptance:** import both colours into the requesting profile, preserve ratings,
time control and source identity, deduplicate repeat/pasted exports, skip explicit
variants/unfinished games, reject malformed standard games atomically, retain state
on remote errors, and require a separate explicit analysis request. Verify desktop
Chromium and mobile WebKit journeys and upgrades from earlier schemas.

**Cost / protections:** one additive connection table, no extra dependency or
runtime, fixed public API host, serial requests, bounded response bytes, no password,
token or automatic background import. Existing data and history remain intact.
Restore a database backup with the matching application version for full rollback;
an older image alone does not reverse a migration.

**Decision:** implement a bounded monthly Chess.com import. Specify the coach's
evidence contract before adding optional AI. No AI service or data transfer is enabled.

## Chess.com delivery

My games → Add a game → Import finished Chess.com games. Connect a username, choose
a month and import. Reimport the month to collect newly published games; earlier
months are available by changing the month. This is explicit import, not continuous
or full-history synchronisation. Public archives may be cached/delayed; PGN paste
remains available. Very large archives use PGN export instead of an unbounded fetch.

Source: [Chess.com Published-Data API](https://www.chess.com/news/view/published-data-api)
documents monthly JSON archives, public profile lookup, serial requests and caching.
The [provider's usage guidance](https://support.chess.com/en/articles/9650547-what-is-the-pubapi-and-how-do-i-use-it)
requires clear non-affiliation; this is stated beside the import controls.

New routes: GET `/api/v1/chesscom/connection`, POST `/api/v1/chesscom/connect`
with username, POST `/api/v1/chesscom/import` with YYYY-MM month. Account links belong
to the active learner when the operation starts. Provider requests cannot select an
arbitrary host. Failed imports do not advance saved import information.

## Coach: intended behaviour, not shipped AI

The coaching unit is a **decision in a real game**, linked to a recurring focus
when enough evidence exists. Reuse saved replay and teaching lines. Cover:

| Area | Coaching question | Evidence boundary |
|---|---|---|
| Attack | What could I have won or forced? | Engine-verified opportunity; do not assume an apparent fork wins material. |
| Defence | What did my move allow, or what threat did I overlook? | Legal verified continuation and the board before the decision. |
| Accuracy | Which decisions materially changed my chances? | App-calculated grades and settings; prioritise instructive decisions rather than explain every score. |
| Openings | Where did I leave my trained line, and was it actually a problem? | Repertoire comparison separate from engine quality and memory recall. |
| Missed tactics | What pattern and targets made the opportunity possible? | Verified motif and continuation, including alternative defences. |
| Missed mates | Which mating pattern was available within my selected limit? | Charter LR06; no mate-in-17 training claim or guaranteed psychological diagnosis. |

For each selected lesson, answer:

1. **What happened?** The played move and demonstrated consequence/opportunity.
2. **What did I miss?** The verified alternative and the opponent's relevant defence.
3. **What could I have noticed?** Observable cues present before choosing the move,
   such as aligned king/queen, a loose target or a newly opened line. Clearly
   distinguish later consequences from information available at the decision.
4. **What should I check next time?** One specific SEE → CANDIDATES → CHECK habit.
5. **What should I practise?** A small relevant selection, delayed revisit and later
   unfamiliar examples. Show why this is the current focus.

Optional learner reflection can clarify which candidate they considered or threat
they noticed. Engine scores cannot establish that they were careless, failed to
calculate or did not understand a concept. Unknown remains valid.

## Incremental coaching roadmap

1. Audit existing detector and concept coverage against the six areas above. In
   particular, check forks and practical mate boundaries before claiming coverage.
2. Establish an evidence packet: game/source, decision FEN and history, learner
   colour, played move, verified alternatives/consequences, analysis settings,
   verified motifs, repertoire status and actual attempt history. Retain unknowns.
3. Build a concise explanation using verified evidence in the existing review.
   Compare simple structured explanations against optional AI on the same cases.
4. Add cross-game focus selection using unique opportunities, recurrence, severity,
   recency, uncertainty and unaided performance; reuse scheduling and preserve history.
5. Pilot AI only if it improves explanation/interaction over the simpler baseline.
   Validate proposed moves with chess rules and engine evidence. Generated prose can
   still be wrong despite correct engine input; review its claims as well as moves.
   An AI response must not silently change grades, scheduling, history or the mate limit.

No provider/key, paid account, model download or mandatory cloud service is selected.
Any hosted option needs explicit configuration, a data-sharing choice, bounded spend,
timeouts and a useful local fallback. No open-ended chat screen is required initially.

## Outcome measures

For import: successful connect/import/review rate, duplicates prevented, time and
actions to reach a saved game, actionable failures and recovery; no silent analysis.
For coaching: chess factual correctness, whether the learner can explain the lesson,
delayed unaided recall, first success on unseen positions (including no-tactic
controls), and recurrence per 100 own moves in later games. Follow the charter's
rating/platform, time-control, sample-size and engine-cohort controls. Do not claim
that a successful import or passing tests demonstrates improved chess performance.

## Verification of this increment

- Type checking and production builds passed.
- Full unit/integration run: 428 passed. After final provider-validation hardening,
  the focused import and historical-migration suite passed all 17 checks.
- Final selected browser run: 54 passed, zero failures or retries, across desktop
  Chromium and iPhone-sized WebKit. Covers Chess.com import, game analysis, replay
  and interface regressions, including switching learner through PGN import.
- Desktop and mobile import-control screenshots were inspected. This is browser
  emulation, not physical-iPhone usability testing.
- Provider responses are deterministic fixtures. No live learner account was
  connected, and no hosted AI was called. Existing Stockfish grading/detection was
  not changed; this increment does not claim improved tactical or mate detection.
- Local document links and whitespace checks passed. Changes are local; no release,
  commit or push is performed by this increment.
