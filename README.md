# Thinking Board

A self-hosted chess trainer for practising the thinking process that prevents
mistakes:

**SEE → CANDIDATES → CHECK**

The V1 loop turns a player's own PGN into thinking-process drills:

1. Paste one or more PGN games.
2. Select which player is you.
3. Analyse every position with local Stockfish MultiPV.
4. Diagnose meaningful mistakes and generate exercises around the failed stage.
5. Practise What Changed, Candidate Generation, Blunder Check, reverse-side
   punishment, and quiet weakest-piece decisions.
6. Store mastery, result, response time, recurring concepts, and next due date.

## Run with Docker Compose

```sh
docker compose up --build -d
```

Open <http://localhost:8000>. All persistent state is stored in `./data`, which
is mounted at `/app/data` in the container. The container runs as UID/GID 1000
for straightforward Unraid and Dockge bind-mount ownership.

V1 has no authentication. Docker Compose publishes the port on the host, so the
app may be reachable by other devices on your LAN. Keep it behind a trusted
network, firewall, or authenticated reverse proxy; “local” means analysis and
data stay on your hardware, not that the HTTP service is automatically private.

If port 8000 is occupied, choose a different host port with
`APP_PORT=8184 docker compose up -d`.

Create a transactionally consistent SQLite backup with:

```sh
npm run backup
```

Backups are written under `./backups` by default. To run it inside the
container, use `docker exec thinking-board npm run backup -- /app/data/backup.sqlite3`
and then copy that file somewhere outside the live data directory.

Restore only while the application is stopped. The restore command validates
the backup and automatically keeps the replaced database as a timestamped
`before-restore` rollback copy:

```sh
docker compose down
docker compose run --rm thinking-board npm run restore -- \
  /app/data/backup.sqlite3 /app/data/trainer.sqlite3 --force
docker compose up -d
```

## Upgrade and rollback

Before upgrading, create a backup inside the persistent data directory:

```sh
docker exec thinking-board npm run backup -- /app/data/pre-upgrade.sqlite3
git fetch --tags
git checkout v1.0.0
docker compose up --build -d
curl --fail http://127.0.0.1:8000/api/v1/health
```

Database migrations run automatically and are tested from every released schema
version. To roll back, stop the app, check out the previous application tag,
restore `pre-upgrade.sqlite3` with the restore command above, and start Compose
again. Never run two application versions against the same live database.

## Local development

Requirements: Node.js 24 or later. A local Stockfish binary is optional when
using the bundled fake engine for tests.

```sh
npm install
npm run dev:server
npm run dev:web
```

The API listens on port 8000 and Vite on port 5173. Vite proxies `/api` to the
server.

For module boundaries, invariants, and the checklist for adding another training
mode, see [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md).

## Verification

```sh
npm run typecheck
npm test
npm run build
npm audit --omit=dev
npm run test:e2e
```

The integration tests execute the complete core loop against a small fake UCI
engine: PGN import → persistent job → analysis → generated modes → recorded
answers → player model and weighted session. Docker verification uses the real
Stockfish 18 build.

The browser suite repeats the clean first-run journey through all five modes and
checks the chessboard at desktop and mobile widths. See [CHANGELOG.md](CHANGELOG.md)
for release notes.

## Configuration

| Variable | Default | Meaning |
|---|---:|---|
| `STOCKFISH_DEPTH` | `14` | Fixed analysis depth |
| `STOCKFISH_MULTIPV` | `3` | Candidate lines retained per position |
| `STOCKFISH_THREADS` | `1` | Threads used by the single engine worker |
| `STOCKFISH_HASH_MB` | `128` | Stockfish hash allocation |
| `ACCEPTABLE_TOLERANCE_CP` | `40` | Reply distance from the best line |
| `MEANINGFUL_LOSS_CP` | `150` | Minimum centipawn loss for consideration |

## V1 features

- Manual single- or multi-game PGN paste, player-colour detection, original PGN
  retention, metadata storage, and canonical duplicate detection.
- Persistent local Stockfish MultiPV analysis with FENs, played and best moves,
  top candidates, centipawn/mate scores, principal variations, and move loss.
- Meaningful-mistake filtering plus high-confidence checks, captures, threats,
  material-loss and mate labels. Tactical and thinking-process diagnoses can be
  corrected manually in the game review.
- Five shared-position training modes: What Changed, Candidate Generation,
  Blunder Check, Punish the Blunder, and Quiet Position / Weakest Piece.
- Evaluation-tolerance candidate grading with Excellent, Good, Playable,
  Dubious, and Blunder feedback instead of one forced engine answer.
- Per-concept attempts, success rate, solve time, recent trend, real-game
  occurrence count, mastery, lapses, and due dates.
- A resumable weakness-weighted 15-exercise runner with exact progress.
  Nothing-due states offer early review, mastered positions, and random
  practice instead of dead-ending.
- Concise game review with evaluation loss, better candidates, diagnosis,
  explanation, and a direct Blunder Check link where a reliable exercise exists.

Explicitly post-V1: platform syncing, authentication, generated position
variants, child mode, native/mobile clients, social features, and advanced
longitudinal statistics.

## Licence boundary

Thinking Board's original application code is licensed under the MIT License.
The project is an independent implementation. The AGPL-3.0 reference project
informed product requirements and generic architectural choices only; its
source, schema, tests, styles, copy, and assets were not copied. See
`docs/decisions/0001-independent-implementation.md` and
`THIRD_PARTY_LICENSES.md` for the maintained boundary and distributed runtime
licences.
