# Opening quality checks

## Implemented acceptance paths

- Import a multi-chapter study with nested variations and conflicting chapter
  reasons for a shared move. Browse and practise each chapter independently.
  Update the source, then export/reimport in a fresh database. Paths, source notes,
  arrows, personal comments and edited explanations must survive. Memory cards
  remain shared; existing attempts are not reset by the migration.
- Build a line, write a note, refresh, return to the builder and recover it.
  Restore an unfinished branch without silently saving it. Explicitly discarding
  a draft must not alter saved repertoires.
- Start a White or Black repertoire. The first learner move creates it; build
  moves then save without a confirmation. Failed saves keep a retryable move and
  use the same request ID. Saved continuations navigate rather than duplicating
  branches. Preview-before-save and Undo remain available.
- Explore on the separate analysis board without changing saved content. Add a
  sequence in one transaction; a later illegal move must roll back the whole save.
- Ask for an authored idea hint without showing the answer square. Reload and
  retain that assistance. Edit the hint separately from the full explanation.
- Practise enabled alternatives at one position in any order. A selected-line
  drill remains branch-specific. Completion counts first tries separately from
  hints, mistakes and later retries, while keeping the final board visible.
- Use relaxed pacing and optional pauses. Wrong-move retries must remain
  available without Continue; pausing happens after finding the saved move.
- Browse a saved position, practise that line and return without losing the
  browser position. Correct moves continue automatically; wrong moves allow a
  retry and do not reveal the answer. Explanations/context pause only on request.
- View a remembered game miss's context and open the specific source game.
  Pasted games and synced games must both use the normal repertoire matcher.
- Simulate failure loading the next line. Preserve results, show Retry and
  distinguish a network failure from reaching the final enabled line.

Automated desktop Chromium and iPhone-size WebKit journeys check these paths.
Chromium touch-input tests also cover drag/tap and text-selection prevention.
These are not a substitute for a physical iPhone or human learning study.

## Human usability gate (not yet measured)

Ask a beginner, without explaining the controls, to import their study, find a
variation, practise it, correct one wrong move and review a pasted game's opening.
Record time to first practice, unnecessary confirmations, lost positions, requests
for help and whether the learner can explain why their move was chosen. Test on a
physical iPhone: tap, drag, promotion, scrolling outside the board, cancelled
gestures and reading notes without accidentally moving a piece.

For learning effectiveness, compare unassisted recall after seven days and
repertoire adherence in subsequent imported games. Keep assisted answers separate
from remembered answers and compare equivalent positions, not raw session counts.
No retention or Chessbook-parity claim should be based solely on passing tests.

## Operational gate

Run `npm run check`, `npm run test:e2e` and the container smoke script against a
disposable container/volume only. Check a fresh database and restart persistence.
Never run reset/deletion smoke tests against the live installation. Database
backup/restore is needed for history; PGN exports preserve opening content only.
The upgrade regression preserves historical cards, events, games, personal notes
and rating preferences, with normal/continuous defaults for the new settings.
Idea hints and practice settings are included in database backups, not PGN exports.
