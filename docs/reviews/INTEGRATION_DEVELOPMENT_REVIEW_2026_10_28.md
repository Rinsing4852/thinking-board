# Thinking Board — integration and development review

Reviewed 28 October 2026. Application baseline: `f5f4a02`, v1.5.25.

## Decision

**Improve the existing training selector and evidence quality before adding another training mode or inference service.** Adopt focused accessibility testing; treat Playwright MCP as optional developer tooling. Consider a small Lichess puzzle pack for transfer assessment after the selector baseline is established. Defer Maia-3 production integration.

| Rank | Proposal | Decision | Priority | Reason |
|---|---|---|---|---|
| 1 | Adaptive training | Accept with modification | High | Extend the selector already present; make its diagnoses and priorities trustworthy and measurable. |
| 2 | Development quality | Modify | High for accessibility and journey gaps; medium for MCP itself | The test infrastructure exists. Add missing evidence rather than a second regression system. |
| 3 | Lichess puzzles | Modify; conditional pilot | Medium | Unfamiliar examples can test transfer. A large content library is not itself a learning improvement. |
| 4 | Maia-3 | Defer production; conditional offline benchmark only | Low | Useful prediction capability, but unproven learning value, extra runtime, calibration questions and weight-licensing uncertainty. |

No integration is implemented by this review. No application code, schema, dependency, MCP settings or deployment configuration has been changed. Proposed migrations and configuration below require subsequent approval.

## 1. Scope and strength of evidence

This is a source and architecture review, supplemented by upstream documentation and code inspection. It is not a penetration test, physical-device assessment, model benchmark or learning-outcome study. No model weights or puzzle dump were downloaded, and no new service or package was installed.

The previous application commit is already pushed, and its [Linux verification and publication succeeded](https://github.com/Rinsing4852/thinking-board/actions/runs/40654320956). Its recorded local acceptance results are 413 unit/integration tests, 208 browser journeys and 51 real Stockfish regression cases. These were **not rerun for this documentation-only review** and are not estimates of learning effectiveness. See [saved verification](</Users/ryanolley/Documents/Chess check list trainer/docs/chessbook-audit/evidence/traceable-progress-2026-10-28/verified-run.json>).

Upstream revisions recorded during inspection:

| Project | Inspected revision |
|---|---|
| Playwright MCP | `0c4107acbecb75472b23c05c0e42471a0011874f` |
| Playwright CLI | `b1a5903c5b633b8c9f843ad7b629c2a78437040c` |
| Maia-3 | `1e13597c42d4858b7cfd7cfdae01e297263364b2` |

The online sources establish published capabilities, not successful installation on this particular Unraid host. Hardware model, available RAM, GPU and concurrent workloads were not measured.

## 2. Current architecture, verified against the repository

| Responsibility | Existing implementation and integration points | Assessment |
|---|---|---|
| Runtime and API | [Dependencies](</Users/ryanolley/Documents/Chess check list trainer/package.json>); [Fastify routes](</Users/ryanolley/Documents/Chess check list trainer/apps/server/src/app.ts>); [shared TypeScript contracts](</Users/ryanolley/Documents/Chess check list trainer/packages/contracts/src/api.ts>) | React/TypeScript frontend; Fastify/Node server; SQLite through better-sqlite3. Node requirement is 24+. |
| Board and move legality | [ChessBoard](</Users/ryanolley/Documents/Chess check list trainer/apps/web/src/components/ChessBoard.tsx:44>); chess.js and Chessground dependencies | Native board interaction, legal destinations, keyboard square selection, promotion dialogue, underpromotion, orientation, annotations and animation preferences already exist. |
| Import and ownership | [PGN import](</Users/ryanolley/Documents/Chess check list trainer/apps/server/src/imports/import-service.ts:58>); [Lichess sync](</Users/ryanolley/Documents/Chess check list trainer/apps/server/src/imports/lichess-sync-service.ts>) | Games belong to player profiles. PGN headers and starting FEN are retained; imports do not automatically request analysis. |
| Engine analysis | [UciEngine](</Users/ryanolley/Documents/Chess check list trainer/apps/server/src/analysis/uci-engine.ts:118>); [AnalysisService](</Users/ryanolley/Documents/Chess check list trainer/apps/server/src/analysis/analysis-service.ts>); [verification](</Users/ryanolley/Documents/Chess check list trainer/apps/server/src/analysis/verify-move.ts>) | Local Stockfish, bounded searches, game-history support, saved MultiPV and verification of consequential evaluations. |
| Analysis jobs | [JobWorker](</Users/ryanolley/Documents/Chess check list trainer/apps/server/src/jobs/job-worker.ts:40>); [analysis selection](</Users/ryanolley/Documents/Chess check list trainer/apps/server/src/analysis/game-quality-service.ts:65>) | Explicit game/all/selected analysis requests; persisted job progress and deduplication. The worker checks that analysis was requested by the user. |
| Exercises | [V1Generator](</Users/ryanolley/Documents/Chess check list trainer/apps/server/src/analysis/v1-generator.ts>); [CandidateGenerator](</Users/ryanolley/Documents/Chess check list trainer/apps/server/src/analysis/candidate-generator.ts>); [What Changed](</Users/ryanolley/Documents/Chess check list trainer/apps/server/src/analysis/what-changed-generator.ts>); [tactical proof](</Users/ryanolley/Documents/Chess check list trainer/apps/server/src/analysis/tactical-punishment.ts>) | Five thinking modes already use game-derived positions, including missed winning opportunities, actual opponent punishment, candidates and quiet improvements. Legal saved continuations support feedback. |
| Selection and diversity | [createSession](</Users/ryanolley/Documents/Chess check list trainer/apps/server/src/training/v1-training-service.ts:330>); [tactical grouping](</Users/ryanolley/Documents/Chess check list trainer/apps/server/src/training/practice-diversity.ts>) | Due-item selection already prioritises failures, recurring concepts, lapses and slower responses. Persistent same-answer opportunities within one game are grouped for a session; history is retained. |
| Game-exercise scheduling | [review-scheduler](</Users/ryanolley/Documents/Chess check list trainer/apps/server/src/training/review-scheduler.ts:11>) | **Not FSRS.** Level-based interval table `[1, 3, 7, 16, 35]` days; the level is incremented before scheduling, so a normal first success from level zero returns after three days. Failure returns after ten minutes. Mastery and attempts are persisted. |
| Opening memory scheduling | [opening-review-scheduler](</Users/ryanolley/Documents/Chess check list trainer/apps/server/src/openings/opening-review-scheduler.ts:1>); [opening review](</Users/ryanolley/Documents/Chess check list trainer/apps/server/src/openings/opening-review-service.ts>) | FSRS via ts-fsrs, with stored stability/difficulty, learning and relearning steps. Opening and game schedules are separate. |
| Openings and observed human play | [explorer cache](</Users/ryanolley/Documents/Chess check list trainer/apps/server/src/openings/opening-explorer-service.ts:48>); [coverage](</Users/ryanolley/Documents/Chess check list trainer/apps/server/src/openings/opening-coverage-service.ts>); [model-game discovery](</Users/ryanolley/Documents/Chess check list trainer/apps/server/src/openings/opening-study-discovery.ts>) | Repertoire graphs, rating/speed-filtered Lichess move frequencies, sample counts, personal game observations, recommendations and stronger-player model-game study already cover part of the proposed human-response use case. |
| Daily workflow and saved review | [daily plan](</Users/ryanolley/Documents/Chess check list trainer/apps/server/src/training/daily-practice-service.ts>); [saved replay](</Users/ryanolley/Documents/Chess check list trainer/apps/server/src/games/game-replay-service.ts>) | Resumable opening/game routine; key decisions; legal engine examples; explicit next-day follow-up. Reviewing is kept distinct from scheduled recall. |
| Progress | [quality comparisons](</Users/ryanolley/Documents/Chess check list trainer/apps/server/src/analysis/game-quality-service.ts:87>); [opening learning measures](</Users/ryanolley/Documents/Chess check list trainer/apps/server/src/openings/opening-quality-metrics.ts:4>); [progress UI](</Users/ryanolley/Documents/Chess check list trainer/apps/web/src/components/GameQualityProgress.tsx>) | Recent 20 versus preceding 20 eligible games, engine/method cohorts, time-control separation, error rates and first-blunder observations. Exact source games are now inspectable. Opening delayed recall excludes intervening assisted exposures. Rating adjustment and unseen tactical transfer are absent. |
| Storage and deployment | [base schema](</Users/ryanolley/Documents/Chess check list trainer/migrations/001_initial.sql>); [daily/follow-up schema](</Users/ryanolley/Documents/Chess check list trainer/migrations/047_daily_practice_and_game_followup.sql>); [transactional migrations](</Users/ryanolley/Documents/Chess check list trainer/apps/server/src/db/database.ts>); [Compose](</Users/ryanolley/Documents/Chess check list trainer/compose.yml>); [image](</Users/ryanolley/Documents/Chess check list trainer/Dockerfile>) | One application service plus local Stockfish; persistent `/app/data`; non-root runtime; no required GPU or Python model service. SQLite backup/restore tooling exists. |
| Quality gates | [browser matrix](</Users/ryanolley/Documents/Chess check list trainer/playwright.config.ts>); [CI](</Users/ryanolley/Documents/Chess check list trainer/.github/workflows/ci.yml>); [feature evidence](</Users/ryanolley/Documents/Chess check list trainer/scripts/feature-audit.mjs>); [labelled engine cases](</Users/ryanolley/Documents/Chess check list trainer/scripts/smoke-tactical-training.mjs>) | Vitest, desktop Chromium, selected mobile-WebKit journeys, failure traces/screenshots, rejection of flaky CI results, real-engine checks, restart/persistence checks and source-fingerprinted feature evidence. |

The clean architecture boundary to preserve is:

```text
PGN / optional external content → validated positions and provenance
                               ↓
Stockfish analysis → evidence and move-quality judgements
                               ↓
exercise adapters → eligible tasks → selector → existing practice UI
                                         ↑              ↓
                              scheduling state ← recorded attempts

optional Maia → human-move predictions only, outside the grading path
developer browser tools → disposable test application, outside deployment
```

## 3. Gap analysis and findings that change the recommendations

1. **An adaptive foundation already exists.** `createSession` ranks recurring concepts and failures across the profile. `recommendedMix` still uses fixed mode allocations. Severity, novelty, calibrated label confidence and a deliberate exploration policy are not integrated into a unified priority model. Frequency is largely historical; filtering candidate games by age does not turn the concept-frequency subquery into a recency model.
2. **Some existing “causes” are assumptions.** [Diagnosis generation](</Users/ryanolley/Documents/Chess check list trainer/apps/server/src/analysis/v1-generator.ts:101>) assigns `process.calculation_failure` automatically at confidence 0.4. [Tactical generation](</Users/ryanolley/Documents/Chess check list trainer/apps/server/src/analysis/analysis-service.ts:445>) also attaches process labels from exercise type. Neither establishes what the player noticed or calculated. [Manual classification](</Users/ryanolley/Documents/Chess check list trainer/apps/server/src/training/v1-training-service.ts:480>) exists, but the underlying distinction between observed event, learner explanation and inferred cause needs to be explicit.
3. **Diversity is narrower than generalisation.** Current grouping prevents repeated consecutive versions of the same tactic in one game. It does not provide cross-game semantic motif families or a held-out, unseen assessment pool. A correct repeat can still reflect memory of the answer.
4. **FSRS is not a universal training engine here.** It determines opening review dates. Changing game-exercise scheduling to FSRS would be a separate migration and experiment, not a prerequisite for better selection.
5. **External puzzles cannot simply be inserted as existing game exercises.** [training_items](</Users/ryanolley/Documents/Chess check list trainer/migrations/001_initial.sql:155>) requires real `game_id` and `source_move_id` foreign keys. Inventing imported user games to satisfy those constraints would contaminate game counts, weakness statistics and ownership semantics.
6. **Browser coverage is substantial but not an accessibility certification.** Keyboard promotion and underpromotion are tested. There is a touchscreen smoke journey in [stable-v1](</Users/ryanolley/Documents/Chess check list trainer/tests/e2e/stable-v1.spec.ts:83>), while the configured WebKit project excludes that file. The explicit drag check in [chessboard tests](</Users/ryanolley/Documents/Chess check list trainer/tests/e2e/chessboard.spec.ts:118>) uses mouse input. These do not establish physical iPhone touch-drag or VoiceOver usability. Some other WebKit tests do use taps.
7. **No axe-core, external puzzle catalogue or Maia runtime was found** in the application/dependency paths inspected. Existing Lichess repertoire data is observed opening-frequency data, not a general human move-prediction model.
8. **Learning evidence remains the largest strategic gap.** Acceptance tests establish software behaviour. They do not show that the selector reduces mistakes in subsequent games, or that the learner recognises a pattern in an unfamiliar position.

## 4. Recommendation assessments

### 4.1 Playwright MCP and development quality — modify

| Criterion | Assessment |
|---|---|
| Existing functionality | Playwright runner, fixture servers, screenshots, traces, browser/device projects and broad user journeys. Codex already has shell-driven testing and browser/computer-use tools in this environment. |
| Learning benefit | Indirect: fewer broken practice sessions, clearer controls and more reliable feedback. MCP itself does not improve chess instruction. |
| Evidence | Strong evidence of existing test coverage; plausible exploratory debugging benefit. No measured incremental benefit from MCP in this repository yet. |
| Technical feasibility | Low-to-medium developer setup cost. No application integration is needed. |
| Dependencies | Optional pinned developer-only MCP process and browser installation. Add `@axe-core/playwright` only after approval. |
| Resource impact | Browser CPU/RAM and trace storage on a developer/test machine; no extra Unraid runtime service. |
| Maintenance | Another browser/tool version to pin and periodically update. Keep one canonical Playwright regression suite. |
| Risk | Browser tools can submit forms and expose game data in captures. Use fixture data and a disposable database, not a personal browser profile or live library. |
| Alternatives | Existing Playwright CLI/runner, Trace Viewer and current browser tools; optional Playwright CLI skill workflow. |
| Priority | High for accessibility and genuine journey gaps; medium/optional for MCP. |

Microsoft describes MCP as an interactive interface for browser exploration and also points coding agents toward CLI workflows. This supports **an optional debugging tool**, not replacing assertions with agent judgements. [Playwright MCP](https://github.com/microsoft/playwright-mcp), [Playwright CLI](https://github.com/microsoft/playwright-cli).

Codex can navigate a disposable app, inspect page structure, interact with the board and examine failures with its available tools. MCP could provide a persistent browser context and convenient inspection. Neither MCP nor an accessibility snapshot proves that a piece moved correctly; assertions should check legal FEN/SAN, native piece placement and persisted results.

#### Proposed configuration — illustrative, not installed

Use a reviewed published release, pinned independently from the application lockfile. The inspected upstream main manifest is 0.0.83 and references an alpha Playwright build; that is not proof it is the appropriate published release for this project. Do not silently upgrade the application's locked browser runner. [Upstream package manifest](https://github.com/microsoft/playwright-mcp/blob/0c4107acbecb75472b23c05c0e42471a0011874f/package.json).

After approval and version verification, a developer-only Codex configuration could be:

```toml
# Proposal only. Replace REVIEWED_VERSION before enabling.
[mcp_servers.thinking_board_review]
command = "npx"
args = ["-y", "@playwright/mcp@REVIEWED_VERSION", "--browser", "chromium", "--isolated", "--headless"]
enabled = false
startup_timeout_sec = 30
tool_timeout_sec = 60
```

The configuration format is documented in [official OpenAI MCP guidance](https://learn.chatgpt.com/docs/extend/mcp). Keep this on the development machine. Use the existing fixture servers on ports 8191/8192; do not add MCP to Compose. For a separate mobile exploration session, select WebKit and the same iPhone device profile as the suite. Use an isolated context; collect bounded, redacted diagnostics. The server supports browser/context and output controls, but origin allow-lists are not a security sandbox. Use process/network isolation for actual containment. [Configuration contract](https://github.com/microsoft/playwright-mcp/blob/0c4107acbecb75472b23c05c0e42471a0011874f/config.d.ts).

#### Avoid duplicate testing

| Activity | Automation approach | Remaining human/device check |
|---|---|---|
| Import → explicit analysis → exercise → feedback → reload/resume | Extend existing journey files only where a missing outcome is identified. Promote a reproduced defect to one deterministic regression. | Whether users understand the steps and explanations. |
| Movement, board flip, castling, en passant, promotion | Reuse existing board fixtures. Add touch-driven movement/promotion on the existing WebKit matrix rather than copying the complete suite. | Finger occlusion, drag sensitivity, accidental scroll and physical iOS/Safari behaviour. |
| Accessibility | Scan stable states and error/loading/promotion states with axe; test keyboard flow alongside the existing keyboard cases. | VoiceOver/TalkBack reading order, meaningful chess descriptions, focus recovery, zoom and usability for disabled players. |
| Regression reporting | Keep CI assertions, source fingerprints and retained failure artifacts. Add a small, stable screenshot baseline only for critical layouts. | Review intentional visual changes; evaluate cognitive load. |

Playwright documents axe integration and its limits; automated checks must be combined with manual accessibility assessment. Do not equate “no axe violations” with WCAG compliance. [Accessibility testing](https://playwright.dev/docs/accessibility-testing). Device emulation is useful but remains emulation. [Emulation](https://playwright.dev/docs/emulation).

### 4.2 Lichess puzzle database — a filtered transfer pilot, not a bulk library

| Criterion | Assessment |
|---|---|
| Existing functionality | Personal mistake exercises, legal board UI, grading, stored answers, concepts, schedules and sessions. No external puzzle catalogue or unseen-transfer protocol. |
| Learning benefit | Supply different examples of a weak motif; distinguish recognition from memorising one's own game. Useful for players with few analysed games. |
| Evidence | Strong evidence that the data supports ratings/themes and solutions; learning transfer in this app is unmeasured. |
| Technical feasibility | Medium for a small read-only catalogue and first-exposure assessment; higher for reliable multi-move training and unified provenance. |
| Dependencies | Optional offline zstd/CSV import tooling, catalogue storage, origin/exposure metadata and an exercise adapter. No mandatory external API or Python service. |
| Resource impact | Download/decompression and import IO can dominate. Store a bounded subset; do not scan millions of rows during a practice request. |
| Maintenance | Versioned snapshots, validation, update/retirement rules and theme mapping. Preserve exposure history across catalogue updates. |
| Risk | Wrong side to move, answer leakage, duplicate positions, overfitting to “there is always a tactic,” and polluting own-game statistics. |
| Alternatives | First improve cross-game selection of existing mistakes; then use a curated set of unseen positions instead of a full database importer. |
| Priority | Medium, conditional on an evaluation design and demonstrated content shortage/transfer need. Opening-specific puzzles remain deferred. |

The inspected Lichess page lists approximately 6.16 million puzzles. Its CSV includes rating, rating deviation, popularity, play count, themes and opening tags. The stored FEN precedes the opponent's first move: apply that move before presenting the solver's position. Mate-in-one solutions can admit multiple mating moves. Opening tags apply only to an early-game subset. Exports are CC0; attribution is not a CC0 requirement, but retain origin, puzzle ID, snapshot date and source URL for traceability and voluntary credit. [Lichess database format and licence](https://database.lichess.org/#puzzles).

#### Proposed pilot design

- Start with an **optional 10,000-puzzle pack**, balanced across a few relevant motifs and difficulty bands. This is a proposed cap, not a requirement to import more content. Use rating deviation, play count and quality signals as filters; test whether they exclude too many beginner puzzles.
- Keep an immutable catalogue snapshot separate from the writable user database. Stream decompression/CSV parsing in an offline preparation job, validate legal setup and full solution, then atomically activate a manifest/checksummed pack. Do not run a multi-million-row import in Fastify's request loop or synchronously block SQLite writes during practice.
- Proposed indexes: unique `(source, puzzle_id)`, a rating range index, and normalised theme membership indexed by `(theme, puzzle_id)`. Select a small indexed candidate set before novelty and difficulty ranking; avoid full-table `ORDER BY RANDOM()`.
- Measure actual file/index size. A provisional **200 MB catalogue budget** for the pilot is an acceptance ceiling, not a measured requirement. Full archive download size, unpacked size and import peak memory were not measured. Streaming reduces peak RAM, not total bytes downloaded.
- Treat the catalogue rating as puzzle difficulty, not the player's chess rating. Adapt from first-attempt, unaided performance with uncertainty and bounded difficulty changes. Start with an appropriate success band, proposed 60–80%, rather than endlessly increasing difficulty or awarding confidence after one answer.
- Map verified board motifs to puzzle themes. Keep learner-reported process difficulty as a separate axis. A fork label cannot establish that the player failed to look, calculate or check. Lichess theme definitions are available in the [official theme source](https://github.com/lichess-org/lila/blob/master/translation/source/puzzleTheme.xml).
- Do not reveal the theme or “winning tactic” before a neutral SEE prompt. Use ordinary/safe control positions as well: an all-positive puzzle diet rewards assuming every position contains a combination.

Use the existing board for SEE → CANDIDATES → CHECK. Capture the initial threat judgement and candidates before revealing feedback; use legal solution replies and a cursor for multi-move play. Reuse Stockfish to validate justified alternatives where needed, rather than declaring every off-script legal move wrong. A root-move-only checker is insufficient for a multi-move puzzle.

**Preserve provenance.** Initially use external puzzles as a distinct first-exposure assessment, with catalogue and exposure records proposed additively. Do not fabricate `games` rows. If practice value is demonstrated, design a source-aware task adapter with identities such as `game:itemId` and `lichess:puzzleId`; keep existing game foreign keys and historical attempts intact. The existing UI/session coordinator can consume adapters without a new top-level training tab. Any origin/schema extension requires approval; it is not a zero-cost reuse of current tables.

**Novelty and updates.** Track exposure even when the answer was shown elsewhere. Deduplicate by source ID and a legal position key, while retaining full FEN/history for correctness. Split holdouts by originating game and position family, not just puzzle ID. A repeated or relabelled puzzle is not unseen. Retired puzzles retain historical attempts and source metadata; updated solutions receive a content version. New attempts use that version, and past grading is not silently rewritten.

### 4.3 Maia-3 — defer production, permit only a gated benchmark proposal

| Criterion | Assessment |
|---|---|
| Existing functionality | Stockfish judges move quality. Opening explorer samples and model games already provide real human responses where data exists. There is no general skill-conditioned human policy model. |
| Learning benefit | Potentially useful for likely replies in uncommon positions and realistic defensive practice; less direct benefit than trustworthy exercise selection. |
| Evidence | Published human-move matching, not a controlled teaching result or proof of playing strength at a selected rating. |
| Technical feasibility | Medium for inference; higher for calibrated predictions, safe isolation and useful teaching. UCI transport exists, but scoring semantics differ. |
| Dependencies | Python 3.10+, PyTorch, python-chess, numpy, Hugging Face tooling and checkpoint storage. |
| Resource impact | CPU-first 5M benchmark is plausible. Actual RAM, cold/warm latency and concurrent Stockfish slowdown are unmeasured. GPU is optional, not a new baseline requirement. |
| Maintenance | Additional language/runtime, model/version pinning, checkpoint provenance and architecture-specific container testing. |
| Risk | Confusing probability with objective strength; weak rating calibration outside training conditions; checkpoint trust, supply chain and redistribution terms. |
| Alternatives | Existing observed explorer frequencies, personal opponent responses and contextual model games; display insufficient sample data honestly. |
| Priority | Low. No default service or production dependency recommended now. |

The released family includes 5M, 23M and 79M variants, and a UCI entry point. Weights can be pre-cached for local use. **A separate Python HTTP service is not required:** an optional Python UCI subprocess is possible. [Maia-3 README](https://github.com/CSSLab/maia3). The package explicitly introduces the Python/PyTorch dependencies above. [Dependency manifest](https://github.com/CSSLab/maia3/blob/1e13597c42d4858b7cfd7cfdae01e297263364b2/pyproject.toml).

The study reports move matching of 55.4% for 5M and 57.1% for 79M; do not attach the larger model's result to the small model. Training/evaluation concerns Lichess blitz, with special treatment of opening and time-pressure positions. Configurable ratings do not demonstrate calibrated play at that rating on Chess.com, in rapid games, or for a very low-rated learner. [Chessformer paper](https://arxiv.org/html/2605.19091v1).

The wrapper accepts separate self/opponent ratings, sampling controls and MultiPV. Its compatibility centipawn/WDL values are predictions, not Stockfish evaluations. Inspected code computes policy probabilities but does not emit them in its ordinary UCI `info` lines; a small adapter would be needed to return actual probabilities. History reconstruction is opt-in through `--use-uci-history`. Never infer probability from its centipawn field or replace `STOCKFISH_BINARY` with Maia. [UCI implementation](https://github.com/CSSLab/maia3/blob/1e13597c42d4858b7cfd7cfdae01e297263364b2/maia3/uci.py).

A future contract should separate `HumanPrediction {modelVersion, ratingContext, moves, probabilities}` from `EngineEvaluation`. Predictions may suggest training scenarios; Stockfish still verifies threats and grades answers. Always retain dangerous engine replies even if the human model assigns them little probability. Label outputs as model estimates, not guaranteed opponent behaviour. If exposed later, reuse the existing suggestion area with a clear source label; do not add another analysis board.

For a benchmark, start with one CPU worker and the 5M checkpoint. The inspected model repository is approximately 21 MB, but that is **not process RAM or container size**. [Model files](https://huggingface.co/UofTCSSLab/Maia3-5M/tree/main). A provisional 2 GB process limit and warm p95 under one second are proposed stop/go budgets, not achieved results. Test cold start, peak memory, timeout/termination and Stockfish throughput on the actual Unraid CPU before deployment. Use versioned, preverified local checkpoints and no runtime network requirement; do not enable unsafe legacy checkpoint loading.

Cache raw predictions by model/checkpoint, full relevant state/history and both ratings; include inference settings where they affect output. Sample from the cached distribution separately with a recorded seed. FEN alone is not an adequate history-aware cache key. For one host, begin with a subprocess; use a separate optional sidecar only if resource/process isolation justifies the operational cost. Do not add an HTTP service merely to bridge languages.

The code is [AGPL-3.0](https://github.com/CSSLab/maia3/blob/1e13597c42d4858b7cfd7cfdae01e297263364b2/LICENSE). The inspected [model card](https://huggingface.co/UofTCSSLab/Maia3-5M/raw/main/README.md) distinguishes the paper licence and refers elsewhere for code/weight terms; it is not an unambiguous standalone weight-redistribution grant. Confirm checkpoint terms before bundling. A process boundary should not be assumed to settle licence obligations. Keep existing GPL/Chessground source and notice handling intact.

### 4.4 Adaptive training — improve selection, not the number of modes

| Criterion | Assessment |
|---|---|
| Existing functionality | Profile-wide concepts, manual classification, failure/mastery state, due dates, persisted sessions, game-age filters and within-game tactical diversity. |
| Learning benefit | Spend limited practice time on recurring, consequential weaknesses while checking generalisation. |
| Evidence | Strong architectural fit and a testable rationale. The existing selector's effect on later games has not been demonstrated. |
| Technical feasibility | Medium incremental change; no new service, chess engine or top-level page required. |
| Dependencies | Initially existing SQL/TypeScript and evidence tables. Additive provenance/selection-event metadata may be needed after approval. |
| Resource impact | Bounded indexed selection on SQLite; no engine search per “next exercise.” Benchmark with realistic library sizes. |
| Maintenance | Versioned, explainable policy; diagnostic fixtures and small controlled evaluations. Avoid an opaque model until simpler scoring has a measured shortfall. |
| Risk | Noisy automatic labels, duplicated opportunities, feedback loops, over-practising familiar answers and mistaking practice success for game improvement. |
| Alternatives | Tune and explain the current selector, including a small novelty quota. Do not introduce reinforcement learning or a second scheduling system first. |
| Priority | Highest learning-feature priority, starting with evidence/label correctness. |

#### Proposed policy

1. **Eligibility before ranking:** correct player, active and valid task, selected game-age scope, schedule eligibility and supported exercise type. Preserve active queues; policy changes apply to new sessions unless the user explicitly restarts.
2. **Separate facts from causes:** store observed event/motif, source and confidence separately from the learner's explanation. “Missed a winning capture” can be evidenced; “failed to look” cannot be inferred from evaluation alone. Unknown must be a usable state, not an invitation to assign a default cause. Offer an optional explanation during game review, not a mandatory reflection dialogue after every exercise. Manual reports are reports, not clinically or cognitively established ground truth.
3. **Bounded priority components:** recurring opportunities across distinct games, recent play dates, bounded chance loss/severity, due/mastery/lapse state and novelty. Cap repeated versions of one opportunity. Generic `response.capture` tags should not overwhelm more specific, well-supported motifs. Do not pool raw engine scores across grading methods.
4. **Diversity and exploration:** retain current grouping; add a labelled, conservative cross-game motif/position-family layer. Allocate a proposed small share to first-exposure own-game items and broader due material, rather than always reinforcing the largest historical count. External puzzles are optional later, not a prerequisite.
5. **Scheduling stays responsible for dates:** selection chooses among eligible tasks; it does not grant recall or move due dates forward. Keep opening FSRS unchanged. Test any future game-FSRS migration separately, preserving previous due dates and replayable attempts instead of resetting mastery. Memory-scheduling difficulty is distinct from tactical puzzle difficulty or player strength.
6. **Explain selection briefly:** for example, “Repeated in three recent games; last recalled incorrectly.” Include the denominator/window and allow a simpler due-first choice. Do not expose weights or another dashboard by default.

Candidate weights and novelty quotas must be versioned experimental policy parameters, not presented as scientifically optimal. Slower responses should not automatically mean weaker thinking: mobile input, accessibility needs, interruptions and task difficulty can explain latency. Existing fixed mode weights and latency ranking should be evaluated rather than blindly retained.

Use existing `training_attempts`, concepts, schedules and session storage first. Refactor selector concerns behind a tested boundary; do not build an independent adaptive service. Add a compact selection-reason record only if needed for reproducibility and evaluation. Never rewrite historical process labels, scores or attempts in place to make a new policy look better.

## 5. Proposed implementation roadmap — subsequent approval required

| Phase | Work and dependency | Acceptance criteria | Rollback and stop rule |
|---|---|---|---|
| 0 — Baseline and specification | Inventory label provenance, eligible queues, exposure information and current query timings. Define a small reviewed motif/negative-position set. | Baseline selector outputs reproducible on a frozen fixture; unknowns and missing observations explicit; current score meanings documented. No learner-benefit claim. | Documentation/fixtures only; no historical data edits. Stop if the target outcome or source of labels cannot be defined. |
| 1 — Quality gaps | Add targeted axe scans and WebKit touch/promotion cases to existing journeys. Trial optional MCP or CLI exploration on fixture data. | No new critical/serious automated accessibility issues on agreed states; no blanket rule exclusions. Actual board state and save/reload outcomes asserted. Record physical-device/assistive-tech results separately. | Remove optional tool/config; retain useful deterministic tests. MCP failure cannot prevent app startup or normal CI tests. |
| 2 — Conservative adaptive selector | After phase 0, separate observed motifs and reported/unknown causes; implement bounded ranking and diversity in shadow mode, then an opt-in policy. | No cross-player leakage, due-date mutation, lost sessions or duplicate credit. Same-game tactic chains do not dominate. Reasons match stored evidence. Proposed p95 selection under 200 ms at 10,000 own-game tasks on agreed reference hardware, measured rather than assumed. | Switch new sessions to the existing selector; preserve old queues and attempts. Additive metadata remains readable/ignorable. Stop if novelty, completion or validation outcomes worsen materially. |
| 3 — External transfer pilot | Only after a held-out evaluation protocol and demonstrated need. Optional filtered pack and source-aware assessment adapter; no fabricated user games. | All accepted setup/solution moves legal; side-to-move tests for both colours; multi-move and alternative-mate handling; zero held-out exposure leakage in fixtures; bounded indexed query/import costs; interrupted import leaves active pack intact. | Disable external source and revert pack pointer. Keep exposure/attempt history; do not delete game-derived items. Stop if new-position gains do not exceed a simpler own-game/curated-position baseline. |
| 4 — Maia feasibility gate | Only after phases 0–2 and unresolved need for human-like replies beyond explorer/model games. Licence clarification plus offline CPU benchmark. | Held-out move-prediction/calibration comparison against observed-frequency baselines where available; resource budgets met; Stockfish throughput regression proposed under 10%; no grading path consumes prediction scores. | Kill optional process/sidecar and disable provider. Existing board, analysis and training work without it. Reject production if complexity is not justified by measured benefit. |

Effort is lowest for targeted QA, moderate for selector and provenance work, and substantially higher for a trustworthy external multi-move adapter or Maia operations. No delivery dates or hardware guarantees are implied by this ordering.

All future data changes must be additive, transactional and profile-scoped. Take a tested SQLite backup before migration; restoration must use a compatible application version. Do not assume rolling back an image automatically reverses a schema change. Do not purge histories when removing optional content. Existing opening, analysis, import and restore journeys remain release gates.

## 6. Measurement plan

### Distinguish software acceptance, retention and transfer

| Outcome | Proposed measurement | Guard against a misleading result |
|---|---|---|
| Reliability | Journey failure/flake rates; failed-save recovery; UI defects reproduced and fixed; physical-device outcomes. | Passing more tests is not evidence of better chess decisions. Keep no-retry-clean and flaky results separate. |
| Threat detection | First unaided judgement on held-out tactical **and safe** positions: sensitivity, false-alarm rate and response-time distribution. Record a threat square/line where the task permits objective checking. | Do not announce the motif; report both misses and false alarms. A higher “threat found” rate alone can mean guessing that every position is tactical. |
| Candidate generation | Proportion of unseen tasks with at least one viable candidate before feedback; legal candidate diversity and response to the critical reply. | Distinguish finding one remembered move from checking a line; account for multiple acceptable answers. |
| Unseen-position transfer | First-attempt, unaided success on held-out position/game families, stratified by source, motif and difficulty. | Exclude hints, reveals, prior board examples and transposed duplicates; never use the held-out assessment pool for teaching during the comparison. |
| Delayed recall | Correct unaided scheduled answers after 7–13 and 14+ days, with intervening exposures accounted for. | Reuse the careful opening-exposure principle; current game-exercise data needs an exposure audit before making equivalent claims. Immediate retries are not delayed recall. |
| Real-game transfer | Mistakes plus blunders per 100 learner moves; report blunders alone too. Use completed eligible games and fixed comparable analysis cohorts. | Do not pool opponent moves, silently select easy games or treat unanalysed games as perfect. Report analysis coverage and selection method. |
| First serious error | Existing move-10/20/30 observation checkpoints and time-to-first-error summaries, with explicit ended-early/blunder-free handling. | Short games without an error are not artificial move-40 successes. First-error medians among error games alone can conceal changing sample composition. |
| Usability and burden | Routine completion, abandonment, voluntary use, task-understanding interviews and session duration. | More clicks or time in app is not the goal. Capture reduced practice adherence if a policy becomes frustrating. |
| Maia-specific prediction | Top-k matching, log loss/Brier-style calibration where policy probabilities are available, stratified by rating/source/time control; later scenario-learning outcomes separately. | Paper move matching and the UCI rating setting do not prove calibrated opponent strength or user benefit. |

### Comparison design

1. Record a baseline period with the current selector. Predefine primary outcomes and a meaningful effect before viewing intervention results. A proposed starting objective is a **15% relative reduction in serious errors per 100 moves**, with uncertainty intervals; this is a decision target, not a promise or established minimum effect.
2. Compare the experimental selector with the current weakness-weighted selector, not only random exercises. Use randomized allocation by learner where a suitable user group exists. For one self-hosted learner, use a prospective repeated-block comparison with disjoint assessment sets; acknowledge learning carryover, time trends and weak causal identification.
3. Prefer prospective sequential/all-game sampling in each eligible playing pool. Keep analysis user-requested: offer selection of the predefined sample and report completion/coverage. Do not silently analyse new games to obtain cleaner statistics.
4. Separate platforms and time controls. Stratify or adjust for learner rating **at game time**, opponent rating, colour and rating difference; exclude or separately report missing/provisional values. Preserve raw ratings/source. Do not convert Chess.com, Lichess and FIDE numbers as though they were interchangeable. These fields can initially be read from retained PGN headers; robust rating-adjusted trends do not already exist.
5. Hold engine version, depth/search limits, MultiPV and grading method comparable. Reuse existing analysis cohorts. When settings change, compare separate cohorts or explicitly reanalyse a selected comparison sample; preserve earlier reports/versions. No automatic reanalysis.
6. Report unique games, learner moves, unique position families, dates and uncertainty. Cluster errors/intervals by game or learner; positions within one game are not independent samples. Missing data is unknown, not zero. First-exposure practice accuracy is distinct from repeat success.
7. Twenty games is a useful descriptive window, not proof. As a planning example, collect at least 50 eligible games per comparison period and 100 unique held-out tasks before an initial estimate, then use observed baseline variance to determine the required sample/power. Rare blunders may require far more. If intervals are wide, conclude “insufficient evidence,” not “no effect” or “improving.”
8. Version selection policies and content packs. Where collection is approved, retain selected-task identity, reason, outcome, assistance/exposure state and policy version locally. Do not transmit private PGNs or require cloud analytics. Respect deletion and backup boundaries.

Promote a change only if acceptance gates hold and the learning/usability comparison supports it. Do not ship all four recommendations because each has a plausible story.

## 7. Alternatives and final recommendation

- **Use existing Playwright and Trace Viewer first.** Optional Microsoft Playwright CLI exploration may be simpler than another persistent MCP server. Add MCP only if reproducing real defects is materially faster or better.
- **Use axe through the existing runner.** Do not install an accessibility service in the app. Follow up automated results with physical Safari, keyboard-only and assistive-technology checks.
- **Use the current explorer and model-game system first for human responses.** Their counts and source games are inspectable. Maia becomes interesting when those sources have no sample and a useful prediction would change a training decision.
- **Use chess.js and Stockfish for a small content adapter.** Avoid replacing the board, adding another chess rules library to the Node app, running the historical Lichess puzzle-generation stack, or maintaining a full local Lichess game archive simply to offer a handful of exercises.
- **Reuse the existing selector/schedulers rather than adding a machine-learning recommender.** Correct provenance, unknown causes, diversity and measurement offer more immediate value than a new model or training tab.

The recommended next implementation, if approved, is **phase 0 plus focused phase 1 work**, followed by an explainable revision of existing selection. External puzzles should earn their place through unseen-position assessment. Maia should earn its operational cost through an isolated benchmark and a demonstrated user-facing need.
