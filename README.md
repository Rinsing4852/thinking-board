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

Opening practice uses a versioned curriculum format compiled into a
transposition-aware position graph. The web interface includes an independently
authored practical White 1.e4 repertoire and a Black Modern Defence repertoire,
plus private PGN repertoire imports. New positions use a learn → understand →
unassisted recall sequence before entering the local FSRS schedule. Seeing the
answer never masquerades as remembering it: an assisted move returns later in
the same session. Correct independent recalls move further into the future;
missed moves enter a short relearning step.

Practice is designed to stay quick: moves are checked directly on the board,
wrong attempts reset immediately, and a first hint highlights which piece to
move before the full answer is revealed. Prepared opponent replies play
automatically, and correct answers can advance after a short explanation. Every
repertoire move can also carry a private, editable learning comment in the
learner's own words. These comments remain separate from the source material
and appear wherever that move is studied or reviewed.

Every repertoire also has a line explorer. It keeps transpositions as shared
positions internally while presenting complete named lines to the learner, with
move-by-move board navigation, explanations, and practice for the selected
branch. The desktop opening studio places the saved repertoire board beside an
independent analysis board. Local Stockfish suggests candidate ideas and, only
when requested, Lichess Explorer shows common rated-game replies when a server
token is configured. Exploration is
never saved automatically: deliberately add the tested sequence to the left
board, write the reason in your own words, then save it to the same graph and
review schedule. On smaller screens the two workspaces stack vertically.

The built-in White course contains 29 decision positions across the Italian,
Alapin Sicilian, French Advance, Caro-Kann Advance, Scandinavian, Modern/Pirc,
Alekhine and Owen defences. The Black course contains 12 decision positions in
three Modern Defence structures: a classical centre, the Austrian Attack and a
quiet c3 setup. Each move teaches its purpose, what changed, the resulting plan
and a practical warning where relevant.

Paste a PGN or choose a `.pgn` file, select White, Black, or both, and preview
its chapters and variations before importing. PGN comments are shown as
personal notes; unexplained moves are labelled honestly instead of receiving
invented strategic claims.

Public Lichess Studies can be imported directly from a study or chapter URL.
The server uses Lichess's official PGN export endpoint, enforces an HTTPS
`lichess.org` allow-list, a timeout and the same 5 MB limit, then shows a
chapter-selection preview before anything is stored. Text-only chapters are
skipped. Private studies are not accessed because V1 does not request or store
Lichess credentials.

The My games workspace can also remember a Lichess username and pull new
finished games into the same duplicate-safe import and local-analysis pipeline.
Public game sync works without a token. Lichess now requires authentication for
Opening Explorer, so set `LICHESS_API_TOKEN` to use practical move frequencies
and coverage analysis. The token stays in the server environment and is never
returned to the browser.

Imported games are matched to both built-in and private repertoires by board
position, so transpositions and authored alternative moves remain valid. Game
review identifies whether the player deviated, the opponent left the prepared
line, or the repertoire content simply ended. A deviation is never called a
blunder merely for being different. When the player leaves the repertoire, one
button opens that exact position in the existing learn-and-review schedule.

Opening imports are stored only in this installation. The importer does not
scrape Chessable or grant rights to third-party material: only import lines and
notes you own or have permission to use. For books, enter the moves you want to
learn and write the explanations in your own words.

## Run with Docker Compose

The published image supports both `linux/amd64` and `linux/arm64`. Create an
empty folder, download the deployment files, and start the app:

```sh
curl -O https://raw.githubusercontent.com/Rinsing4852/thinking-board/main/compose.yml
curl -O https://raw.githubusercontent.com/Rinsing4852/thinking-board/main/.env.example
cp .env.example .env
mkdir -p data
docker compose up -d
```

Open <http://localhost:8000>. All persistent state is stored in `./data`, which
is mounted at `/app/data` in the container. The container runs as UID/GID 1000
by default. Set `PUID` and `PGID` to the owner of the host data directory when
needed—for example, values configured by your Unraid or Dockge installation.

V1 has no authentication. Docker Compose publishes the port on the host, so the
app may be reachable by other devices on your LAN. Keep it behind a trusted
network, firewall, or authenticated reverse proxy; “local” means analysis and
data stay on your hardware, not that the HTTP service is automatically private.

If port 8000 is occupied, choose a different host port with
`APP_PORT=8184 docker compose up -d`.

To build the image from a cloned source checkout instead of pulling the
published image:

```sh
docker compose -f compose.yml -f compose.build.yml up --build -d
```

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

Before upgrading, create a backup inside the persistent data directory, then
pull and restart the published image:

```sh
docker exec thinking-board npm run backup -- /app/data/pre-upgrade.sqlite3
docker compose pull
docker compose up -d
curl --fail http://127.0.0.1:8000/api/v1/health
```

Database migrations run automatically and are tested from every released schema
version. For reproducible installs, set `APP_VERSION` in `.env` to a numbered
image tag such as `1.1.1`; `latest` follows the current release. To roll back,
stop the app, restore `pre-upgrade.sqlite3` with the restore command above, set
`APP_VERSION` to the previous release, and start Compose again. Never run two
application versions against the same live database.

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
| `PUID` | `1000` | Container process user ID (Compose) |
| `PGID` | `1000` | Container process group ID (Compose) |
| `STOCKFISH_DEPTH` | `14` | Fixed analysis depth |
| `STOCKFISH_MULTIPV` | `3` | Candidate lines retained per position |
| `STOCKFISH_THREADS` | `1` | Threads used by the single engine worker |
| `STOCKFISH_HASH_MB` | `128` | Stockfish hash allocation |
| `ACCEPTABLE_TOLERANCE_CP` | `40` | Reply distance from the best line |
| `MEANINGFUL_LOSS_CP` | `150` | Minimum centipawn loss for consideration |
| `LICHESS_API_TOKEN` | empty | Server-side token required for Lichess Explorer; optional for public game sync |

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
- Position-based opening connections in game review, with neutral deviation
  language and direct practice of the prepared move that was missed.
- A two-board desktop opening studio with a saved repertoire workspace,
  independent Stockfish/Lichess analysis sandbox, deliberate line transfer,
  editable private branches, full line browser and move-by-move explanations.
- Direct public Lichess Study or chapter import with safe URL validation,
  chapter selection, variation preservation and an ownership confirmation.
- Optional username-based Lichess game sync through the official API, feeding
  the existing duplicate-safe import, analysis and repertoire-deviation review.
- Separate Today, Openings, My games and Progress workspaces, so a learner sees
  one clear job at a time while every active lesson or review remains resumable.

Explicitly post-V1: automatic/background platform syncing, authentication,
generated position variants, child mode, native/mobile clients, social features,
and advanced longitudinal statistics.

## Licence boundary

Thinking Board's original application code is licensed under the MIT License.
The project is an independent implementation. The AGPL-3.0 reference project
informed product requirements and generic architectural choices only; its
source, schema, tests, styles, copy, and assets were not copied. See
`docs/decisions/0001-independent-implementation.md` and
`THIRD_PARTY_LICENSES.md` for the maintained boundary and distributed runtime
licences.
