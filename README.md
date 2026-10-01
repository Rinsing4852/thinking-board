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
wrong attempts reset immediately and remain marked in red without revealing the
answer. Request a piece-only hint or deliberately choose Show move, then play
the shown move yourself. Requested help survives page reloads and never counts
as independent recall. Prepared opponent replies and the
next exercise play automatically, so normal practice needs no Continue or
confirmation buttons. Every
repertoire move can also carry a private, editable learning comment in the
learner's own words. These comments remain separate from the source material
and appear wherever that move is studied or reviewed.

Same-session retries are separated by at least two other positions and capped
at two per move. If the set is too short, the scheduled review handles the retry
instead of trapping the learner in an immediate reveal-and-repeat loop.

Every repertoire also has a line explorer. It keeps transpositions as shared
positions internally while presenting complete named lines to the learner, with
move-by-move board navigation, explanations, and practice for the selected
branch. In **View all lines**, play an existing saved move directly on the board
or choose a **Saved continuation**. Imported variations show their branching
move and a short preview; **Find a line** searches names and move sequences.
Changing lines keeps a shared board position, or takes you to the point where
the two lines separate rather than restarting. **Go to branching point** and
**Back to previous line** help explore alternatives. Different move orders
reaching the same position are listed separately from ordinary shared moves.
Shared comments/explanations are marked; save or cancel an edit before navigating.
Viewing never adds moves: choose **Edit lines** to author a new continuation.
Personal repertoires can be renamed, reordered and exported as a
complete PGN, including archived lines;
the most recently added move can be undone. Individual lines or complete
repertoires—including built-in material—can be archived without losing notes or
review history, then restored later. The desktop opening studio provides
guided move choices: one repertoire board asks for the next decision and adds a
selected move immediately. An independent analysis board opens only when deeper
investigation is useful. Local Stockfish suggests candidate ideas and Lichess
Explorer shows common rated-game replies when a server token is configured,
including an intuitive “1 in N games” frequency and the learner's score from
the chosen colour. The opening home checks practical coverage for the recommended
repertoire and surfaces the weakest line from review and game evidence. Exploration is
never saved automatically: deliberately add the tested sequence to the left
board, write the reason in your own words, then save it to the same graph and
review schedule. On smaller screens the guided board and move evidence stack
vertically without horizontal scrolling.
The repertoire library stays compact: each title expands only when its
statistics, description or actions are needed, leaving more room for the
recommended session and the board.

Selected-line recall measures the exact branch move separately from position
recall, which accepts any active saved reply. Transpositions share the same
move evidence, while alternative replies do not borrow each other's progress.
“Secure for now” requires multiple reviews, at least a week of stability and a
review date still in the future; it is not a promise of permanent mastery.
Varied line practice selects a bounded saved line using average learning need,
fresh cached practical frequencies (or authored frequencies when unavailable)
and recent rehearsals. It avoids replaying the
previous line when another is available. It is a line rehearsal, not an engine
game or a live opponent simulation. Session depth and the amount of new material
are adjustable in opening settings.

Practice progresses automatically unless you pause, open an explanation or
edit a comment. A manual pause always has a Resume action. Failed requests stop
automatic progression and provide a retry; duplicate answer/next-position
requests from the current interface do not grade twice or skip positions.
Game/repertoire matches are cached until the graph or its visibility changes.

Opening settings remember the learner's rating source and closest playing band.
When practical data is enabled, the studio and line editor combine rated-game
frequency with local Stockfish evaluation in one move list, mark replies already
saved in the repertoire and apply the same level automatically to coverage.
Practical frequencies remain opt-in and only the current position is sent to
Lichess from the self-hosted server.

New installations start with an empty opening library: build your own moves or
import your opening PGN/Lichess Study. Earlier installations keep their existing
starter material until you choose to remove it; starter content is no longer
added or restored automatically on startup.

Use **Manage opening library** on the opening home to delete one repertoire or
the entire library, including archived and legacy built-in material. Clearing
the library requires typing `DELETE` and confirming the current list. In **View
all lines → Manage lines**, you can delete an individual line; deleting the final
line removes its repertoire too. Shared moves in remaining lines are retained.
Deletion is permanent and affects opening notes and review results for all player
profiles. Imported games, game analysis and settings are kept. Export PGN first
to retain moves and comments; back up `/app/data` to retain review history too.
Deleted built-ins do not return after a restart.

Paste a PGN or choose a `.pgn` file, select White, Black, or both, and preview
its chapters and variations before importing. PGN comments are shown as
source notes; unexplained moves are labelled honestly instead of receiving
invented strategic claims.

Public and private Lichess Studies can be imported directly from a study or chapter URL.
The server uses Lichess's official PGN export endpoint, enforces an HTTPS
`lichess.org` allow-list, a timeout and the same 5 MB limit, then shows a
chapter-selection preview before anything is stored. Text-only chapters are
skipped. Public studies need no credentials. Private and unlisted studies use
the optional server-side `LICHESS_API_TOKEN`; create it with only Lichess's
`study:read` permission. The token is sent only to the validated Lichess export
endpoint and is never returned to the browser.

To refresh an existing imported repertoire, expand its card and choose **Update
from source**. Use its Lichess Study link or paste the updated opening PGN, then
preview and confirm. This merges new variations, extends recognised source lines
and refreshes source comments in place, without resetting your learning progress,
personal notes, custom line names or archived lines. Missing source lines and
locally added branches are retained; archive unwanted lines yourself. A Lichess
refresh checks only chapters already imported, not every chapter in the study.
Updates are manual, not automatic background syncing. Confirmation uses the exact
previewed source snapshot and expires after 30 minutes. Any practice session for
changed content ends safely; recorded results remain. Nothing is published externally.

The My games workspace can also remember a Lichess username and pull new
finished games into the same duplicate-safe import and local-analysis pipeline.
When that workspace is opened, a connected account is checked automatically if
it has not synced in the previous six hours; manual Sync now remains available.
Public game sync works without a token. Lichess now requires authentication for
Opening Explorer, so set `LICHESS_API_TOKEN` to use practical move frequencies
and coverage analysis. The token stays in the server environment and is never
returned to the browser.

Imported games are matched to both built-in and private repertoires by board
position, so transpositions and authored alternative moves remain valid. Game
imports from pasted PGN, uploaded PGN files and Lichess sync all use this same
matching path; platform syncing is not required for repertoire analysis. Game
review identifies whether the player deviated, the opponent left the prepared
line, or the repertoire content simply ended. A deviation is never called a
blunder merely for being different. The review board switches between the
decision position, the move played and the prepared move so the difference is
visible without relying on notation. When the player leaves the repertoire,
one button opens that exact position in the existing learn-and-review schedule.
The opening inbox groups the same departure across recent games, puts repeated
unreviewed patterns first and keeps an explicit reviewed state without deleting
the underlying game evidence. An opponent surprise can be prepared from the
same card: choose your reply on the board, compare local Stockfish candidates
and optionally record the ideas behind both moves. Private repertoires are
extended directly; built-in material is copied to an editable personal
repertoire before the branch is saved.

**Worth preparing?** separates an uncovered reply from a mistake. The game
inbox, review and editing boards use the same assessment: how often the reply
is played from that position, encounters in your last 100 imported games of
that colour, mistakes in your immediate response, and available Stockfish reply
evidence. Pasted and synced games count alike. Click **Check frequency and
replies** for a local engine check and, if enabled in Opening settings, a
Lichess frequency refresh. A weak move can still be common or tricky; rarity
alone never proves that a reply is safe.

In the game inbox, choose **Keep an idea instead** to save/edit a short note,
or **Leave unprepared for now**. Neither adds a memorisation line or review card.
Current encounters are marked reviewed, but a future encounter can prompt
reconsideration while retaining your choice. Deliberately preparing a reply
preserves the note for the post-answer explanation in practice. These choices
and their notes are included in database backups, not opening PGN exports.

Popularity is conditional on reaching the displayed position, using the selected
Lichess rating band and blitz/rapid/classical sample. At least 200 position games
and five occurrences of the reply are needed for a reliable frequency label;
missing, small or older-than-seven-day samples are uncertain. Under 1% is rare,
5% or more is common. Three personal encounters or repeated immediate-response
mistakes increase priority. These are transparent preparation heuristics, not
guarantees of safety or a prediction of your next opponent. Due reviews and
exact-branch practice are never skipped based on popularity.

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

Publishing the Docker image now depends on passing typechecks, tests, Chromium
journeys, focused mobile WebKit practice tests and a real-container Stockfish
and persistent-volume restart smoke test against the same commit. Automated
mobile testing supplements, rather than replaces, testing on a physical phone.

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
image tag such as `1.5.6`; `latest` follows the current published release. To roll back,
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
| `LICHESS_API_TOKEN` | empty | Server-side token for Lichess Explorer and private/unlisted Study imports; use `study:read` for Study access |

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
- An opening cockpit that recommends the next memory session, exposes repeated
  game misses, highlights the weakest line and checks practical reply coverage.
- Safe archive/restore for built-in and personal repertoires and individual
  lines, plus personal names, line ordering, PGN export and immediate move undo.
- Direct public, unlisted or private Lichess Study and chapter import with safe
  URL validation, optional `study:read` authentication, chapter selection,
  variation preservation and an ownership confirmation.
- Optional username-based Lichess game sync through the official API, with a
  six-hour foreground check when My games is opened, feeding the existing
  duplicate-safe import, analysis and repertoire-deviation review.
- Separate Today, Openings, My games and Progress workspaces, so a learner sees
  one clear job at a time while every active lesson or review remains resumable.

Explicitly post-V1: always-on scheduled platform syncing, authentication,
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
