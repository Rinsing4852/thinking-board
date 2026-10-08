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
authored curriculum format and private PGN repertoire imports. Fresh installations
start empty; upgrades keep existing White 1.e4/Modern starter material until you
choose to remove it. New positions use a learn → understand →
unassisted recall sequence before entering the local FSRS schedule. Seeing the
answer never masquerades as remembering it: an assisted move returns later in
the same session. Correct independent recalls move further into the future;
missed moves enter a short relearning step.

Practice is designed to stay quick: moves are checked directly on the board,
wrong attempts stay visible briefly in red, then return smoothly to the practice
position without revealing the answer. Retry input pauses during the return;
that wait does not count towards recall time. Reduced-motion preferences disable
the return animation. Request a piece-only hint or deliberately choose Show move, then play
the shown move yourself. Requested help survives page reloads and never counts
as independent recall. Prepared opponent replies and the
next exercise play automatically, so normal practice needs no Continue or
confirmation buttons. **Practise this line** is continuous recall: explanations
and purpose cues stay hidden unless requested. **Explain last move** pauses the
run and shows that move's board, explanation and editable personal comment—even
after the next position has arrived, or at the end of the run. Close it to return
to practice; save or cancel comment edits first. **Learn the ideas (guided)** is
the separate, optional move-purpose lesson with deliberate explanation stops.
Completed line runs offer **Repeat this line**, **Next enabled line** (skipping
paused/archived paths) and **Back to this repertoire**. Chapter names distinguish
similarly named source lines. Reading explanations, watching opponent replies,
hidden tabs, pauses and network waits do not inflate active recall time. A
same-tab reload preserves elapsed active time; historical timings are unchanged.
Every
repertoire move can also carry a private, editable learning comment in the
learner's own words. These comments remain separate from the source material
and appear wherever that move is studied or reviewed.

An **Optional idea hint** can be authored separately from the full comment:
describe the purpose without naming the move, piece or destination. Recall only
shows it when requested; **Hint: show the piece** and **Show move** offer stronger
help. Imported explanations are not silently turned into answer-revealing hints.
Hint use survives reloads and never counts as unaided recall.

**Opening settings** includes normal/relaxed practice pace and pauses after
mistakes or hints, notes, or every correct move. By default correct moves continue
automatically and a wrong move lets you retry without showing the answer.
The final board remains visible beside your summary, which separates first-try
recall, hinted moves and mistakes. A later successful retry cannot rewrite the
first result. Automatic reviews ask for other enabled saved responses at a
shared position in any order; an exact-line drill follows only that chosen branch.

Same-session retries are separated by at least two other positions and capped
at two per move. If the set is too short, the scheduled review handles the retry
instead of trapping the learner in an immediate reveal-and-repeat loop.

Browsing and practising use a board-first layout. Starting a line drill keeps the
browser workspace in place; returning restores the line and position you were
inspecting. Coverage and management stay below the board; mobile notes open on
request. Use Alt + Left/Right to step through moves while browsing. Builder drafts
are kept in this browser until saved or explicitly discarded. Refreshing a branch
draft offers Restore; a changed source graph never silently receives an old draft.

Today keeps a compact practice summary; Progress contains the detailed thinking
profile. My games puts pasted PGNs before optional Lichess setup and lets you search
all imported games by player, opponent or date. Browser Back/Forward works between
main screens. Loading failures show Retry instead of an unexplained blank panel.
See the [screen review and next usability priorities](docs/UI_REVIEW_2026-10-06.md).

**Why this exercise?** is available after an answer. It pauses practice and links
real-game misses to the particular game's review, with your played and prepared
moves. A repertoire departure is not automatically a chess blunder. Both pasted
games and Lichess imports contribute to this evidence.

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
Open **Coverage and repertoire settings**, then **Practice selection and recall** to turn individual lines on/off for
automatic practice, or pause/include the currently filtered lines together.
Paused lines stay visible, retain notes and review history, and remain available
for pasted/synced game analysis. Shared moves remain in automatic practice when
another enabled line needs them. **Practise this line once** overrides the switch
for that drill only. Choices belong to the current player, survive restarts and
source updates, and are independent of archiving. New source lines default on.
PGN exports do not back up practice switches or recall history; keep a database
backup to preserve those settings and results.
Changing participation ends stale practice sessions, preserving recorded results
and due dates. If every line is paused, include a line or practise one manually.

**Preparation and recall** separates missing content from memory gaps. Choose an
intended line and "Prepare through my move" (1–30). The path estimate follows your
selected line's own moves; where it supplies no choice, it uses the first saved
primary response. It multiplies conditional Lichess opponent frequencies and stops
at the first gap, chosen depth or explicit **Prepared enough — stop here** boundary.
Boundaries are reversible, shared by transposed positions within the repertoire,
and do not delete moves, pause practice or prove recall. All saved opponent branches
are considered under that own-move policy; alternative own responses are not added
together. Estimates are conditional on the starting position, not forecasts.

Saved responses/stopping points, missing responses, idea-only preparation,
deliberate omissions and unknown evidence stay separate. Small (under 200 position
games or 5 observations of a reply), missing and stale samples remain uncertain.
**Continue scan** checks two positions per request, including deeper positions; the
display reports fresh, old, small and missing evidence. Refresh works in batches too.
Unknown data is never counted as 0% frequency or full coverage.

**Best next improvements** distinguishes adding a response from practising one you
already saved, using recent personal encounters, response mistakes, estimated
exposure and weak recall. **Practise response** starts at that decision; it is not
counted as a full-line run. **Explore branches and stopping points** shows each shared
position once, with reply frequency at that position, sampled date, response, recall
and practice participation. Three recent first-try encounters with at least 80%
unaided recall are labelled "recall tested", not guaranteed mastery. Recent-game
evidence includes pasted and synced games; departures are not automatically chess
mistakes. Preparation boundaries and review history require a database backup;
PGN exports do not contain them. Local response/recall evidence works offline.

Frequency filters show Common (at least 5%), Uncommon (1% to below 5%), Rare
(below 1%) or Unknown. This is the least-common opponent reply in the saved line,
at that reply's position in the chosen Lichess rating band—not the probability
of reaching the whole line. All opponent replies need fresh samples of at least
200 position games and five observations; incomplete/small/stale data stays
Unknown. Loading frequencies is explicit and cancellable; two positions are
loaded per bounded request, continuing while progress is made. Offline practice
does not fetch Lichess. Filtering/sorting the list never silently pauses lines.

Recall shows recent unaided move accuracy (up to 20 answers per move), how many
moves have actually been tested, secure/due moves and average response time.
Shared moves contribute to multiple lines. Separate full-line recall uses up to
20 completed exact-line runs matching the current path; short drills and guided
lessons do not prove complete-line recall. Hints, shown answers and corrected
mistakes are not unaided recall. A small sample is not proof of lasting mastery.

Personal repertoires can be renamed, reordered and exported as a
chapter-based PGN with nested variations, including archived lines, source
explanations, separate personal notes and imported square highlights/arrows.
Thinking Board's export directives preserve note editing identity on reimport;
other PGN tools may ignore those private directives. Use a database backup for
practice switches and history. Browsing links retain the
selected repertoire, line and move on refresh. Archive/export actions sit in
**Coverage and repertoire settings → Manage lines**;
the most recently added move can be undone. Individual lines or complete
repertoires—including built-in material—can be archived without losing notes or
review history, then restored later. The desktop opening studio provides
guided move choices: name the repertoire, choose your side and start building.
Your first learner move creates it; subsequent new moves save automatically.
**Edit lines** offers the same flow, with **Save each move automatically** switched
on, a manual preview option, retry on failure and **Undo last save**. Choosing an
already saved response follows it rather than duplicating it. An independent analysis board opens only when deeper
investigation is useful. Local Stockfish suggests candidate ideas and Lichess
Explorer shows common rated-game replies when a server token is configured,
including an intuitive “1 in N games” frequency and the chosen colour's sampled
results (wins plus half the draws—not your personal results). Engine numbers are
from the side-to-move perspective, identified beneath the move choices. The opening home checks practical coverage for the recommended
repertoire and surfaces the weakest line from review and game evidence. Exploration is
never saved automatically: deliberately add the tested sequence to your
repertoire. It is saved atomically to the same graph and review schedule; an
invalid later move leaves no partial sequence. Add or edit your reason afterwards.
On smaller screens the guided board and move evidence stack
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
source notes; Lichess `%csl`/`%cal` highlights and arrows are retained and shown only
in requested practice explanations or via **Show source arrows and highlights**
when browsing a line. Refresh previously imported material from its source to
recover marks omitted by older versions. Unexplained moves are labelled honestly instead of receiving
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

Thinking Board's original application code retains the MIT License. The browser
frontend now integrates Lichess Chessground 10.4.2 and the combined frontend is
distributed under GPL-3.0-or-later. The independent backend remains MIT. Private
use does not require publishing private modifications or user data. Every normal
web build packages its matching frontend source, build instructions, licence
notices and exact dependency-source pointers; the app's "Source & licences" link
provides access. See `apps/web/LICENSING.md` before distributing modified builds.
The project is an independent implementation. The AGPL-3.0 reference project
informed product requirements and generic architectural choices only; its
source, schema, tests, styles, copy, and assets were not copied. See
`docs/decisions/0001-independent-implementation.md` and
`THIRD_PARTY_LICENSES.md` for the maintained boundary and distributed runtime
licences.
