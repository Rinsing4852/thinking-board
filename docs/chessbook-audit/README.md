# Opening feature audit

Open `tracker.html` for the filterable feature tracker or `AUDIT.md` for all
feature descriptions, acceptance criteria, sources and implementation gaps.
`catalog.json` is the editable specification; `quality-report.json` is the
generated evidence snapshot.

Each feature has three acceptance criteria. A check earns credit only when its
exact mapped test passes. Browser criteria must pass on both Chromium and WebKit.
Failures, skipped checks, flaky retries, unmeasured human tasks and missing
features remain distinct. Priority weights are P0=5, P1=3 and P2=1. Commercial
billing is documented but excluded from the personal self-hosted target.

Run `npm run audit:features:verify` to typecheck, run unit and tracker tests,
build the app, run the full browser suite and regenerate the report. Run
`npm run audit:features` to regenerate from the current local results. Any
code, migration, test, scoring-script or catalogue change invalidates the
recorded source fingerprint; old results cannot earn current credit.

Raw reports are local diagnostics and ignored by Git. A fresh checkout must
run verification before regenerating a current report. The checked baseline
unit results were recorded before this audit's implementation; the checked
current report also includes browser evidence. Compare the unit-only metrics
for a like-for-like before/after result, not current browser evidence against
an unmeasured browser baseline.

Human comparison protocol: same fixture and settings, one warm-up, five timed
attempts per tool, then record median and worst task time, actions, correctness,
recovery and accessibility. For learning, use delayed unaided retests. No
competitor runtime, trained-model quality or user-study results are fabricated.

The audit covers publicly visible guest features and official documentation.
Connected accounts, paid workflows, native app runtime, destructive controls
and autofill execution have explicit access limits in the source ledger.

The [17 October behaviour reconstruction](./RECONSTRUCTION.md) applies REA's
observation/evidence method to the build, practice, coverage, autofill and
model-game workflows. It separates observed UI, documented algorithms and
independent implementation proposals, and provides nine task-quality gates.
REA itself was not installed or run. The first implementation increment is
[whole-repertoire encounter coverage](./WHOLE_REPERTOIRE.md), including its
explicit limits and evidence. The next increment adds an opt-in
[learn-first, then recall flow](./FIRST_EXPOSURE.md). Contextual model-game
study and the remaining learning refinements remain plans. The
[review of both increments](./RECENT_FEATURE_REVIEW.md) records fresh competitor
observations, corrections to alternatives/retries and the next quality measurements.
The [continuation and home-learning increment](./CONTINUATION_AND_HOME_LEARNING.md)
removes the fixed total-policy checking ceiling and adds an explicit teaching
choice beside the recommended practice action, with unchanged urgency rules.
The [three-step polish pass](./POLISH_PASS.md) records the Linux Safari layout
diagnosis, clearer coverage/recall language and reset/recovery checks. The
[contextual model-game specification](./CONTEXTUAL_MODEL_GAMES.md) describes the
next feature. Its [first milestone](./MODEL_GAME_STUDY_DELIVERY.md) adds a separate
imported-game library, exact-position selection, supplied notes, replay and resume;
model-game learning is partial in the tracker, with guessing
still outstanding.

[Automatic stronger-player examples](./AUTOMATIC_MODEL_GAMES.md) add authenticated
Lichess position search, learner-side rating checks and direct replay. The
provider sample is bounded; master-source switching and guessing remain absent.
