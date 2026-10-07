# ADR 0002: Adopt Chessground for board interaction

## Status

Accepted, 2026-10-07. The owner accepted GPL obligations and primarily uses this
installation privately. Initial verification was local; the owner subsequently
requested publication to the existing GitHub repository and container workflow.

## Decision

Use the unmodified `@lichess-org/chessground` 10.4.2 package for rendering,
animation, trusted mouse/touch dragging, selection and arrows. Keep chess.js
responsible for legal moves and keep the parent responsible for the position.
Do not copy code from the AGPL reference trainer or the separate Lichess website.

Retain a small React accessibility layer inside the native board. It labels
squares, supports keyboard selection and exposes legal-choice status; it does
not implement a competing pointer/drag engine. Promotion remains an explicit
accessible choice, including underpromotion and cancellation. Rejected answers
and candidate collection restore the parent's position.

## Consequences

- The combined frontend is distributed as GPL-3.0-or-later. Original MIT notices
  remain; the independent backend retains MIT. See `apps/web/LICENSING.md`.
- Every production web build packages matching source, Chessground TypeScript,
  build instructions, notices and version-specific dependency source pointers.
- Private data and credentials are excluded by a code/build-path allowlist.
- Upstream board event bindings and global listeners must be destroyed on
  unmount. Cached bounds are refreshed at input time to avoid scroll races.
- Regressions cover legal moves, special moves, both orientations, responsive
  geometry, keyboard access, controlled-position resets and continuous practice.
- This adopts the board library, not the complete Lichess UX. Physical mobile
  testing remains useful even after automated touch/WebKit checks pass.
