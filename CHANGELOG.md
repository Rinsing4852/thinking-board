# Changelog

All notable changes to Thinking Board are recorded here.

## 1.2.1 — 2026-09-22

### Faster repertoire and board navigation

- Replaces tall repertoire tiles with a compact title list. Each repertoire
  expands in place only when its description, statistics or actions are needed.
- Collapses the practice-mode explanation by default and reduces active-lesson
  chrome so the board appears substantially higher on desktop and mobile.
- Moves the played line beneath the board, matching the visual hierarchy used
  by leading chess interfaces while keeping the current decision above it.
- Marks both squares of a legal but incorrect repertoire move in red while the
  progressive hint highlights the piece that should move.
- Moves rank coordinates to the right edge and file coordinates to the left
  edge, matching the familiar Lichess layout.

## 1.2.0 — 2026-09-22

### Board experience

- Moves now glide between squares instead of teleporting, with reduced-motion
  support for learners who disable animation at operating-system level.
- Makes illegal destinations reject visibly, highlights a checked king, enlarges
  the piece artwork and strengthens the board edge and shadow without reducing
  the playable area.
- Adds Lichess-style desktop annotations to analysis and repertoire line boards:
  right-drag for an arrow, right-click for a circle, and use Shift, Alt or
  Control/Command for alternate colours.
- Adds a one-click board flip to the independent Stockfish analysis workspace
  while keeping training boards automatically oriented toward the learner.

### Opening repertoire control and focus

- Adds a compact opening cockpit for the recommended review, repertoire misses
  from real games, practical Lichess reply coverage and the current weakest
  line, without expanding the bundled 1.e4 or Modern courses.
- Adds reversible archive and restore controls for whole repertoires and
  individual lines. Archived built-in material is preserved but excluded from
  lessons, reviews, coverage and game matching.
- Adds personal repertoire and line renaming, line ordering, clean PGN export
  and one-click undo for the most recently saved move or branch.
- Measures line-level mastery, recall accuracy, response time, lapses and
  recurring real-game misses, while aggregating the dashboard queries so larger
  imported repertoires remain responsive.
- Checks a connected Lichess account for finished games when My games is opened
  and the previous sync is at least six hours old; imported games continue
  through the existing duplicate-safe local analysis queue.
- Loads practical coverage in parallel batches and carries the result into the
  repertoire explorer, reducing repeated waits without increasing the stored
  opening content.

### Faster opening learning

- Replaces the button-gated new-move sequence with continuous board-first
  practice: play immediately, watch opponent replies automatically and move to
  the next position without pressing Continue.
- Gives progressive help after mistakes—first the piece, then the exact source
  and destination—while keeping Show answer available as an optional escape
  hatch rather than a required step.
- Checks opening moves as soon as they are played. A correct move continues the
  lesson automatically, while a wrong move resets immediately for another try.
- Records the exact wrong move before the eventual answer, highlights the piece
  that should move on the first hint, and treats a corrected answer as assisted
  rather than an independent recall.
- Automatically plays prepared opponent replies and optionally advances after
  concise correct-answer feedback, with controls to pause either action when
  the learner wants more time.
- Adds private, editable learning comments to repertoire moves. Personal notes
  appear in line exploration, lessons, reviews and imported-game feedback
  without altering the underlying built-in or imported explanation.
- Upgrades every shared chessboard with click-or-drag movement, clearer legal
  move and capture markers, stronger selection and coordinate contrast,
  keyboard announcements, touch-friendly interaction and an explicit promotion
  chooser instead of silently assuming a queen.
- Makes repertoire feedback from imported games visual: the decision position,
  played move and prepared move can be compared on the same board before
  launching focused practice for the missed position.
- Separates opening comparison from engine progress so a newly imported game
  can teach repertoire recall immediately without implying that pending
  Stockfish analysis found no mistakes.
- Puts existing game feedback before the import form; new installations still
  lead with import, while returning players land on the work they came to do.
- Adds an opening inbox that automatically groups matching repertoire misses,
  opponent surprises and repertoire endings across the latest imported games.
- Counts repeated real-game patterns, keeps unreviewed work first and lets the
  learner practise the exact missed position or explicitly clear a group while
  retaining its history.
- Turns an opponent surprise into repertoire preparation directly from the
  opening inbox: choose a reply on the board or from local Stockfish candidates,
  add optional learning notes and save the new branch in one flow.
- Preserves built-in courses by creating an editable personal copy only when a
  learner first saves a branch from built-in material.

## 1.1.1 — 2026-09-19

- Keeps browser release checks in sync with the shared application version.
- Uses the current Node 24 GitHub Actions runtimes and avoids duplicate CI runs
  for release tags; container tags continue to publish independently.

## 1.1.0 — 2026-09-19

### Opening practice foundation

- Adds a two-pane desktop opening studio: the saved repertoire stays on the
  left while a separate right-hand board explores local Stockfish candidates
  and opt-in Lichess move frequencies. Analysis moves remain unsaved until the
  learner deliberately adds them to the repertoire.
- Adds bounded, serialised opening analysis on a dedicated low-resource engine,
  an in-memory result cache, abortable browser requests, and a seven-day SQLite
  cache with stale fallback for Lichess Explorer data.
- Adds editable branches and explanations for private repertoires, practical
  coverage gaps based on common rated replies, and username-based Lichess game
  sync through the official API with incremental, duplicate-safe imports.
- Adds a complete chapter and line explorer with SAN sequences, move-by-move
  board navigation, explanations, and focused practice for the selected line.
- Adds a board-based personal repertoire creator so a learner can play both
  sides, attach explanations, and save a trainable line without writing PGN.
- Adds direct public Lichess Study and chapter import through the official PGN
  endpoint, including strict URL validation, time/size limits, chapter
  selection, variation preservation, text-only chapter handling and the same
  private ownership confirmation as manual PGN imports.

- Expands the built-in material to a 29-position White 1.e4 repertoire covering
  the Italian, Alapin Sicilian, French, Caro-Kann, Scandinavian, Modern/Pirc,
  Alekhine and Owen defences, plus a 12-position Black Modern repertoire covering
  classical, Austrian Attack and quiet c3 structures.
- Introduces unseen positions with an explicit learn → understand → recall flow.
  Assisted answers are recorded separately and reappear later in the session;
  only independent recalls count as remembered.
- Separates due review from new learning, adds a reload-safe “I don’t know”
  reveal path, and brings slow correct recalls back sooner to build fluency.
- Adds move-sequence context, pause/resume for guided lines, clearer practice-mode
  descriptions, and feedback that recognises valid secondary opening ideas.
- Puts the current question before the board on narrow screens and collapses the
  line library after a mobile line selection to reduce scrolling and clutter.
- Orders new material by chapter, line priority and ply, while retaining
  position-level deduplication and review history across content upgrades.
- Adds pause/resume support and separates the interface into Today, Openings,
  My games and Progress workspaces with beginner-facing next actions.
- Connects imported games to built-in and private repertoires by position,
  including transpositions and accepted alternatives. Game review distinguishes
  player deviations, opponent deviations, completed repertoire material and
  games outside the repertoire without treating every difference as a mistake.
- Adds one-click focused practice for the exact position where the player left
  their repertoire, reusing the same explanation, review card and FSRS history.
- Adds position-level spaced repetition with persistent review cards, immutable
  event history, due/new/early selection, a five-position new-item limit and
  same-session lapse repeats.
- Wraps the MIT-licensed FSRS scheduler behind an opening-specific boundary so
  scheduler versions and review history remain explicit and upgradeable.
- Separates quick scheduled review from the existing guided full-line lesson,
  with clear first-answer grading, reload-safe feedback and repertoire-level
  due/learning/new counts.

- Adds a separate, versioned opening-curriculum schema without coupling opening
  material to game-derived mistake exercises.
- Validates legal moves, structured novice explanations, opponent intentions,
  concepts, frequencies, duplicate identifiers, and transpositions at startup.
- Seeds an independently authored preview Italian chapter and exposes the
  read-only opening catalogue API.
- Adds the first guided lesson UI: play each repertoire move on the board,
  identify its main purpose, read concise plan feedback, and resume after a
  reload without creating attempts merely by viewing the catalogue.
- Keeps move explanations active until Continue is pressed, so reloading cannot
  skip feedback, and rejects stale lessons after a curriculum version change.
- Adds content checksums, provenance validation, submission locks, and
  configurable Compose UID/GID ownership for safer upgrades and self-hosting.
- Preserves opening progress when a learner later imports their first PGN by
  claiming the same provisional local profile.
- Adds private opening-PGN preview and import for White, Black, or both sides,
  including recursive variations, comments, source metadata, permission
  confirmation, duplicate protection, and retained original PGN.
- Cycles imported repertoires through the least-practised line so every branch
  is reachable, and clearly flags moves whose strategic explanation is still
  missing instead of inventing one.

## 1.0.0 — 2026-08-15

First stable self-hosted release.

### Training

- Turns manually pasted PGNs into five linked thinking-process modes: What
  Changed, Candidate Generation, Blunder Check, Punish the Blunder, and Quiet
  Position.
- Accepts multiple engine-supported candidate moves and gives graded feedback
  rather than requiring one best move.
- Provides weakness-weighted sessions, player-specific metrics, spaced
  repetition, early review, mastered practice, and random fallback practice.
- Uses beginner-facing instructions and preserves the SEE → CANDIDATES → CHECK
  sequence throughout training and review.

### Self-hosting

- Publishes versioned, multi-architecture images to
  `ghcr.io/rinsing4852/thinking-board`, with pull-based Compose upgrades and a
  separate source-build override.
- Stores SQLite data under `/app/data` and bundles local Stockfish 18.
- Restores in-progress analysis after a browser refresh and offers failed-job
  retry from the import screen.
- Includes checked backup and restore commands with an automatic pre-restore
  rollback copy.

### Verification

- Adds clean-install and upgrade tests for every released schema version.
- Adds backup/restore integrity coverage.
- Adds real-browser coverage for PGN import, all five modes, recovery UI,
  desktop/mobile board geometry, and release version display.
