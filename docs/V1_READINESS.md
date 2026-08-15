# V1 readiness

V1 is defined by a reliable local loop:

> Paste PGN → analyse with Stockfish → diagnose meaningful mistakes → train
> SEE → CANDIDATES → CHECK → record and schedule the result.

## Acceptance checklist

| Area | V1 acceptance | Status |
|---|---|---|
| Import | Single/multiple manual PGNs, player colour, original text, metadata, duplicate protection | Complete |
| Analysis | Local UCI Stockfish, FENs, played/best/top-three moves, evaluations, mate scores, loss and PVs | Complete |
| Selection | Configurable meaningful-loss threshold and high-confidence immediate punishment detection | Complete |
| Diagnosis | Thinking-process and tactical concepts with manual correction for every meaningful reviewed mistake | Complete |
| What Changed | Before/after opponent move, category plus board-square response, explanatory feedback | Complete |
| Candidates | Up to three legal moves, CCT/weakest-piece label, five-level real-engine grading, tolerance | Complete |
| Blunder Check | Candidate animation, check/capture/threat choice, opponent reply, prevention feedback | Complete |
| Punish | Opponent-perspective board, immediate punishment, reverse-pattern feedback | Complete |
| Quiet position | Weakest-piece selection followed by a quiet improving candidate | Complete |
| Player model | Attempts, success, solve time, trend, real-game occurrences and recurring problems | Complete |
| Allocation | Persistent weakness-weighted 15-item session runner prioritising due, failed, repeated and slow items, with resume and exact progress | Complete |
| SRS | Mastery, last result/time, due date, early/mastered/random fallbacks | Complete |
| Review | Loss, played move, candidates, diagnosis, explanation and direct training link where reliable | Complete |
| Deployment | One Docker image, Compose, local Stockfish, SQLite, `/app/data`, health check | Complete |
| Licence | Independent implementation boundary plus Stockfish and npm runtime notices | Complete |
| Browser regression | Clean import, five modes, recovery UI, desktop/mobile board geometry | Complete |
| Data recovery | Every migration path plus integrity-checked backup/restore and rollback copy | Complete |

## Deliberate V1 limits

- Automatic tactical motif labels are conservative. Ambiguous positions are
  deliberately left for manual diagnosis rather than receiving a confident but
  misleading motif.
- What Changed automatically generates newly attacked-piece exercises first;
  the response model already supports the wider change categories.
- Quiet-position items use high-confidence engine-supported piece improvements.
  They are coaching prompts, not claims that chess has one objectively weakest
  piece.
- Training uses one focused board at a time. A persisted session resumes at the
  exact next item and completes only when every selected item has a recorded
  answer or reveal.

## Release verification

Run before tagging:

```sh
npm run typecheck
npm test
npm run build
npm run test:e2e
git diff --check
docker compose up --build -d
curl --fail http://127.0.0.1:8000/api/v1/health
```

Then verify in the browser that every mode loads, the board remains square at
desktop and mobile widths, feedback explains the failed checklist stage, a
15-item plan can be created, and a review diagnosis can be changed.
