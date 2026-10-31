# Thinking Board — project charter and learning requirements

Updated 31 October 2026 from the owner's project-purpose and coaching review.

## Purpose

Help the learner improve at chess by turning their own games into a focused,
understandable training plan, then checking whether learning carries into later
games. The thinking framework is **SEE → CANDIDATES → CHECK**.

The primary learner is the owner, aspiring to approximately **2000 Elo**. The rating
platform and time control remain to be specified. This is an ambition, not a
promised result or a rating shared across platforms. The immediate priorities are
reducing blunders and mistakes and recognising tactical opportunities.

The central question is: **What should I work on next, why, and is it helping my
play?** Reviewing every mistake or completing more exercises is insufficient.

Learning must follow the learner's games **regardless of where they play**.
Lichess, Chess.com and pasted PGNs feed the same review and training system.

## Scope

The owner considers the existing features useful. Game import, requested Stockfish
analysis, game review, thinking exercises, opening preparation, spaced review,
model-game study and progress reporting remain in scope. Their connection into a
coherent learning cycle needs improvement. This charter does not authorise feature
removal or loss of history.

Hosting ordinary chess games is outside the current purpose. Other approaches are
welcome when they advance learning and justify their complexity. An engine,
dataset or competitor feature is not a requirement merely because it exists.

## Intended normal session

1. Identify a recurring, important, observable weakness across analysed games.
2. Explain one useful lesson through a few representative decisions.
3. Practise recognition, candidate selection and verification, using familiar and
   unfamiliar positions where suitable material is available.
4. Revisit the lesson after a delay, distinguishing unaided recall from assisted work.
5. Check later games for recurrence and adapt the plan as evidence accumulates.

The session should be manageable and explain its recommendations. Full review and
manual practice remain available. Sparse evidence should produce a provisional
focus with clear uncertainty, rather than an invented recurring weakness.

## Learning requirements

These requirements govern future work. **They are not a claim that every capability
has shipped.** Inspect existing functionality before proposing additions.

| ID | Requirement | Acceptance evidence |
|---|---|---|
| LR01 | Learn across games rather than queue every error independently. | Recommended focuses link to supporting games and positions; repeated manifestations of one opportunity do not dominate a session. |
| LR02 | Provide a focused, understandable training plan. | The learner sees the focus, why it matters, the next action and what evidence would change the recommendation. |
| LR03 | Distinguish observed chess events from inferred thinking failures. | Threats and motifs have position evidence. Uncertain causes remain unknown or labelled as hypotheses; learner explanations are recorded separately. |
| LR04 | Include missed opportunities, allowed tactics and missed defences. | Verified examples distinguish a tactic the learner missed, one their move enabled and a threat they failed to prevent. Forks, pins, skewers, discovered attacks and mating opportunities are in scope. |
| LR05 | Verify tactical benefit using Stockfish and legal continuations. | An apparent fork or undefended piece is not automatically a winning tactic. Regression examples cover counterplay, pins, sound sacrifices and delayed recaptures; feedback demonstrates the relevant continuation. |
| LR06 | Make missed-mate training practical and adjustable. | Apply the mate policy below, with checks for inclusion/exclusion boundaries, side-to-move interpretation, alternative solutions and saved settings. |
| LR07 | Separate move quality, repertoire adherence and recall. | Missing mate while retaining a winning position is a missed mating opportunity, not automatically a losing blunder. A sound repertoire departure is not automatically a chess error. |
| LR08 | Teach transferable recognition. | Measure first unaided performance on unfamiliar positions as well as delayed recall. Include positions without a winning tactic so the learner must decide whether an opportunity exists. |
| LR09 | Measure improvement in real games. | Report serious errors per 100 own moves, blunders separately and recurrence of supported tactical patterns, with sample counts and analysis coverage. Exercise completion is not proof of improved play. |
| LR10 | Keep the workflow understandable. | The next action and purpose are clear; avoid duplicate recommendations and unnecessary controls. Check the complete mobile/Safari journey as well as individual components. |
| LR11 | Preserve control, history and self-hosting. | Analysis stays on explicit request for one game, selected games or all games. Preserve games, repertoires, attempts and schedules; prefer local processing without mandatory cloud subscriptions. |
| LR12 | Learn from games across playing platforms. | Chess.com, Lichess and PGN imports attach to the intended learner, preserve source identity and metadata, skip duplicate exports and reuse review, opening checks and requested analysis. Do not equate ratings from different platforms. |
| LR13 | Coach the learner using verified game evidence. | Explain what was missed, what could have been seen before the move, the relevant warning signs and a practical checking habit; link the explanation and next practice to supporting positions. Distinguish evidence, learner-reported thinking and uncertain inference. Optional AI must not replace engine verification or become required for ordinary training. |

The coach must cover attacking and defensive blunders/opportunities, move quality
and accuracy, departures from trained opening lines, missed tactics and practical
missed mating patterns. Accuracy is supporting feedback, not the sole learning
target. Opening departures and missed wins retain the distinctions in LR07.

### Practical missed-mate policy (LR06)

- Verified mate in 1 is always eligible. Eligibility does not require showing every
  occurrence in every session.
- Provide a learner-controlled **maximum mating length**, from mate in 1 through
  mate in 4. Start with mate in 2 as the proposed initial limit; allow lowering or
  raising it. A limit of 3 includes mates in 1, 2 and 3.
- Explain the unit as the number of moves **the learner makes** to deliver mate.
  Mate in 2 means their move, the opponent's reply, then their mating move. Do not
  confuse this with engine depth or half-moves.
- Use the shortest verified forced mate against best defence, not cooperative
  replies. Accept alternative valid mating solutions within the selected limit,
  rather than requiring one engine principal variation.
- Longer mates can remain visible in analysis but must not enter recommended
  missed-mate training above the selected limit. Mate in 17 is not a practical
  missed-mate lesson under this policy.
- Length is one difficulty factor. Consider forcing moves, branching and unaided
  results: a subtle mate in 2 may be harder than a forcing mate in 3.
- Suggest increasing the limit when sustained unaided results on varied positions
  support it. The learner retains control. Calibrate progression thresholds before
  treating them as established; one success or a rating is insufficient.
- Distinguish finding the first move from completing the mating sequence. Hints,
  reveals and retries do not count as first unaided success.

## Priority order

1. Correct analysis, reliable workflows and trustworthy learning records.
2. Recurring weaknesses across games, including missed tactics and practical mates.
3. An explainable training plan reusing existing exercises and scheduling where useful.
4. Delayed retention, unfamiliar-position performance and transfer into later games.
5. Supporting opening, model-game and other improvements justified by learner needs.

Reliability fixes take precedence when a broken workflow blocks learning. This
ordering is not implementation approval. The [integration review](reviews/INTEGRATION_DEVELOPMENT_REVIEW_2026_10_28.md)
remains supporting technical evidence; its recommendations must pass the purpose
check below. Opening-specific external puzzles remain deferred pending a justified
proposal.

## Required purpose check for every improvement

Apply this before implementation to features, integrations, UI changes, scoring,
selection and reliability work. Record it in the proposal, review, issue or change
description, then recheck the result before delivery. A small fix can use a short
paragraph; scale the detail to the change.

1. **Aim and need:** Identify the requirement ID and concrete learner problem or
   reliability failure being addressed.
2. **Existing capability and simplest option:** Inspect what already works. Could
   a fix, clearer explanation or better selection solve this without another mode?
3. **Expected benefit:** Explain the change to the learner's session or decisions.
   Distinguish a hypothesis from observed usability or measured learning gains.
4. **Acceptance and measurement:** State observable acceptance criteria and relevant
   regression checks. Learning interventions also need retention or transfer
   measures; infrastructure fixes need correctness/reliability evidence.
5. **Costs and protections:** Consider UI burden, resources, maintenance, relevant
   privacy/licensing issues, history preservation and rollback where necessary.
6. **Decision:** Proceed, simplify, investigate, defer or reject. Defer or reject
   work without a credible connection to the purpose. Feature count, technical
   feasibility and competitor parity alone are insufficient justification.

Use REA's observation → description → independent implementation → measurement
approach to gather evidence. Competitor comparisons inform quality; this charter
sets priorities. Older reviews are historical evidence, not automatic authority
to build their next feature. Correct software behaviour alone does not demonstrate
a learning benefit; review pilot outcomes before expanding.

## Measuring progress honestly

Establish a baseline before changing selection. Track serious errors per 100 own
moves and tactical recurrence in later games. Separately track delayed unaided
recall, unfamiliar-position success and threat detection, including false alarms.
Show denominators, date ranges, analysis coverage and uncertainty.

Keep rating/platform, time control, colour, opponent strength and analysis settings
comparable or explicitly separate. Do not blend different engine/grading settings
into one improvement trend. Small samples, missing analysis and short games remain
visible limitations. Games without errors must not receive a fake first-error move;
later first errors alone do not prove better decisions. Rating progress is a
long-term outcome influenced by factors beyond the app.

## Change control

Update the aims explicitly when the owner changes priorities; do not redefine them
to fit a feature. Updating requirements does not implement them. The review-only
restriction on application code, schemas, dependencies and deployment remains until
subsequent implementation approval.

The 31 October request authorises adding Chess.com game import. Coaching requirements
are now explicit; a hosted AI provider, credentials, data sharing and spending have
not been selected or enabled by this requirements update.
