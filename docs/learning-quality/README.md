# Learning quality gates

Purpose: deliver the three agreed improvements against the project charter, rather
than count features. Reuse saved review, Stockfish, current schedules and history.

1. Focused game page (LR07/10/11): separate choosing a game, studying one game and
   reviewing cross-game patterns. Keep one board and preserve navigation/state.
2. Tactical practice (LR04–07): distinguish missed attacks from allowed threats using
   legal saved engine evidence; practical, adjustable mate limits, no mate-in-17 drill.
3. Cross-game focus (LR01–03/08/09/11): explain a recurring observable weakness, link
   supporting games and offer bounded practice. Never infer a psychological cause.

The smallest approach is to extend the current UI, replay snapshot and selector.
No extra engine, scheduler, AI provider or cloud subscription is justified here.
Benefits are hypotheses until measured: task success/time for navigation, correct
chess feedback, delayed/unfamiliar recognition, then recurrence per 100 own moves.
Preserve profiles, source metadata, snapshots, attempts, preparation and schedules.

`npm run quality:learning -- --verify --stage 1` verifies the first stage. Use 2 or
3 to verify all prerequisites up to that stage. Without --verify it only reassesses
saved evidence. Do not advance after a failed or missing automated gate. Each
critical check must pass; an average cannot hide a critical failure. Both Chromium
and mobile WebKit must pass browser checks with no retries, skips or flaky passes.

The tool records a source fingerprint. Changed code, criteria or tests invalidate
older results. It produces QUALITY.md and grade.json. Raw reports are diagnostics,
not tracked data. A fresh checkout must verify again.

An engineering PASS is not a human-usability or learning-effectiveness grade.
Manual usability and actual improvement remain explicitly unmeasured. Unknown
checks never earn credit. Rollback uses the existing services/data; route changes
must retain old game/position links. Migrations, if needed, must be additive.

## Running the complete gate

Run `npm run quality:learning -- --verify --stage 3` with a genuine local
Stockfish binary configured through the normal app environment. Alternatively,
set `LEARNING_ENGINE_IMAGE` to a trusted, already-built Thinking Board Docker image
containing Stockfish and compatible runtime dependencies. The checker runs that
image without networking, mounts the current build/scripts/migrations read-only,
and uses an in-memory database. It does not mount the live library. This image is
a test runtime, not the application version being assessed.

Stages 1 and 2 run the new focused browser journeys. Stage 3 runs the full existing
browser suite as well as those journeys. Every stage runs type checks, unit tests
and a production build. Stages 2 and 3 also require the real-engine corpus: six
sound-move cases, five tactical cases, four independently verified mate lengths
and the saved-analysis idempotency check. A second full-game corpus checks nine
learning/review behaviours, including the supplied missed-queen example: it must
be tagged as both a missed attack and an allowed threat. Fake-engine browser fixtures test UI
behaviour and cannot satisfy the real-engine gate.

The result is a checklist grade, not an average or a chess-strength rating. A
critical failure blocks the overall result even when the other checks pass.
Missing/stale evidence is unknown. Saved JSON and Markdown results describe the
working tree at measurement time; they are not a promise about a later checkout.

## Delivered scope and limits

- My games starts in the library. Selecting a game opens one replay board, with
  accuracy/report details collapsed. Opening patterns have their own view, three
  initial rows and one expanded pattern. Search and unsaved pattern notes survive
  moving between views during the mounted session. Old game/position links work.
- Saved practice adds Attacking, Defending and Missed mates. Categories require
  legal stored engine evidence; old snapshots need explicit feedback refresh.
  The profile's mate limit starts at two and can be changed from one to four.
  Exact bounded search verifies forced mates against legal defence. Exhausted
  verification budgets exclude a candidate rather than guess. Alternative saved
  engine roots are accepted when independently verified within the chosen limit;
  this does not enumerate every possible valid chess move.
- Missed-mate practice checks the **first move**, then permits the saved continuation
  on the board. It does not grade execution of the entire mating sequence or claim
  mastery. Longer mates remain available in analysis.
- The focus draws on existing verified tactical exercises from up to 100 recently
  analysed, dated, completed standard-start games. It groups observable material
  and mating opportunities/defences. This is a conservative first pass, not a full
  taxonomy of tactical motifs or an inference about the learner's thinking.
- Time controls and engine/grading settings remain separate. Recent recurrence
  ranks first, severity breaks ties. One supporting game is labelled provisional.
  The focus also respects the saved maximum mating length. Due practice is at
  most three positions, at most one per supporting game, using
  the current scheduler and session. The daily plan uses this selection too.
- No database migration, dependency, new engine, AI service or cloud subscription
  is introduced. Reads create no analysis jobs or practice credit. Existing active
  practice resumes before a new focus. Saved games and schedules remain intact.

## Human acceptance before expanding scope

Engineering acceptance is necessary. Keep the three manual criteria unmeasured
until they have been observed; do not convert test counts into learning claims.

1. On the learner's physical Safari device, complete five journeys: choose a game,
   return to the filtered library, choose a practice category/mate limit, review an
   opening pattern, and start the explained daily focus. Pass only with no lost
   state, inaccessible controls, accidental engine requests or blocked board
   interaction. Record device, browser, date, observed problems and fixes.
2. Without developer coaching, ask the learner to explain the focus, its evidence,
   the next action and the meaning of the mate limit. Pass when all four are
   understood and the five journeys can be completed unaided. Record actual
   observations, including confusion; screenshots alone do not establish this.
3. Pilot one focus before adding training modes. Record baseline and follow-up
   dates, analysed-game coverage and denominators. Aim for at least 20 comparable
   games and 500 own moves per period as an initial reporting minimum, not a
   statistical proof. Below that, label findings preliminary. Match time control,
   platform/rating context, colour and engine/grading settings; show remaining
   differences in opponent strength. Reanalysis must not masquerade as progress.
4. Compare serious errors and blunders separately per 100 own moves, plus recurrence
   of the chosen supported pattern. Also inspect unaided delayed recall after at
   least seven days and first attempts on genuinely unfamiliar positions, including
   no-tactic controls. Count false alarms and assistance separately. This release
   does not add an unseen-position library or claim this outcome is measured.
5. Continue the pilot if evidence is sparse or mixed. Investigate worse outcomes or
   frequent confusion before expanding. Establish meaningful change thresholds
   from baseline variability and sample uncertainty, rather than inventing a
   percentage improvement target from exercise completion.

## Purpose-check decision

Proceed with these bounded extensions of existing review, evidence and scheduling
(LR01–07/10/11). Their expected benefit is a clearer session and more trustworthy
practice selection; learning transfer remains a hypothesis. Acceptance is the
critical automated checklist plus the human pilot above. Costs are bounded local
verification and an additional explainable selector; no history is reset. Rollback
can remove the new views/selector while leaving stored games, practice history and
existing services intact. Do not start another training mode solely because the
engineering checklist passes.
