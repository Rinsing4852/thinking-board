# ADR 0001: Independent implementation

## Status

Accepted.

## Decision

The application will be implemented independently from the AGPL-3.0
`MrLokans/chess-blunder-trainer` source. Its observable product behaviour and
generic architectural patterns may inform this project, but source code,
database migrations, tests, styles, copy, and assets will not be copied.

The application uses permissively licensed application dependencies. Stockfish
runs as a separate UCI process and is distributed with its own GPL-3.0 licence
and corresponding-source information.

## Consequences

- Chess rules and PGN replay use BSD-2-Clause `chess.js`.
- The initial board is implemented in this repository using Unicode pieces.
- Stockfish integration uses the public UCI protocol rather than GPL library
  bindings.
- Third-party licences and pinned component versions must be documented before
  the first distributable image is published.
