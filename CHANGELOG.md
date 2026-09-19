# Changelog

All notable changes to Thinking Board are recorded here.

## Unreleased

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
