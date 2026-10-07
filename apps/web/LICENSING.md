# Frontend licensing and source

The frontend combines Thinking Board with Chessground 10.4.2, an unmodified
GPL-3.0-or-later dependency from Lichess. The combined frontend is distributed
under GPL-3.0-or-later. Original Thinking Board files retain their MIT notices;
the independently running backend remains MIT. Stockfish is a separate GPL
program communicating over UCI, not part of the browser bundle.

Copyright (c) 2026 Thinking Board contributors.
Chessground copyright belongs to the Lichess contributors.
There is no warranty. The full GPL text is in `public/legal/gpl-3.0.txt`.

Every production web build includes `/source/thinking-board-frontend.tar.gz`:
the exact frontend sources, shared contracts, build configuration, lockfile,
licences, and the installed Chessground package, including its TypeScript
sources. `dependency-sources.json` gives equivalent, version-specific source
locations for the unmodified React (including React DOM and Scheduler) and
chess.js dependencies. Their package code and notices are also included.
Do not replace these pointers with a moving `main` branch. When updating a
dependency, verify the matching upstream source remains available before
distributing the build.

To rebuild the frontend, extract the archive, use Node.js 24 or later, and run:

```sh
npm ci
npm run build:web
```

To edit Chessground itself, use the TypeScript sources in
`vendor/@lichess-org/chessground/src`; compile them with TypeScript targeting
ES2020 modules and DOM libraries, and replace the installed package's `dist`
modules before the web build. Normal builds use the unmodified, integrity-locked
npm package. Upstream build instructions: https://github.com/lichess-org/chessground.

For the pinned package, the equivalent compile command is:

```sh
./node_modules/.bin/tsc --target ES2020 --module ESNext --moduleResolution Bundler --lib ES2020,DOM --declaration --outDir node_modules/@lichess-org/chessground/dist vendor/@lichess-org/chessground/src/*.ts
```

The archive is assembled from explicit code/build paths, never from the running
installation or a workspace-wide tar command. Databases, PGNs from users, private
studies, backups, environment files and API tokens must never be added to it.

Personal use does not require publishing private modifications. Distribution of
the combined frontend must preserve notices and provide corresponding source
under the GPL. Imported games and study content are user data, not application
source, and remain private. Do not publish third-party study material without
permission.
