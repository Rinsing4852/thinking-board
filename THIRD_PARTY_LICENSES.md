# Third-party licences

This project is an independent implementation. Application dependencies are
installed from the locked npm dependency graph; their package metadata and
licence files remain in `node_modules` in the distributed image.

Important runtime components:

| Component | Licence | Source |
|---|---|---|
| Stockfish 18 (`cb3d4ee9b47d0c5aae855b12379378ea1439675c`) | GPL-3.0 | https://github.com/official-stockfish/Stockfish/tree/cb3d4ee9b47d0c5aae855b12379378ea1439675c |
| chess.js | BSD-2-Clause | https://github.com/jhlywa/chess.js |
| Fastify | MIT | https://github.com/fastify/fastify |
| React | MIT | https://github.com/facebook/react |
| better-sqlite3 | MIT | https://github.com/WiseLibs/better-sqlite3 |
| ts-fsrs | MIT | https://github.com/open-spaced-repetition/ts-fsrs |
| Lichess chess opening names | CC0-1.0 | https://github.com/lichess-org/chess-openings |

The Docker image includes Stockfish's `Copying.txt` at
`/app/licenses/stockfish/COPYING.txt`. The exact Stockfish source used to build
the image is the unmodified commit linked above, verified after cloning the
`sf_18` tag. If the build argument is changed, this document and the
corresponding-source pointer must be updated.
