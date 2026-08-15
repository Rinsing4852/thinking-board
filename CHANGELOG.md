# Changelog

All notable changes to Thinking Board are recorded here.

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

- Ships as the versioned `thinking-board:1.0.0` Docker image built by Compose.
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
