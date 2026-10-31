# Learning quality gates

**PASS** · source evidence current.

Engineering acceptance only. Human usability and learning benefit are not established.

Validation: grader=passed, types=passed, unit suite=passed, build=passed, browser gates=passed, real Stockfish: smoke-tactical-training.mjs=passed, real Stockfish: smoke-thinking-exercises.mjs=passed.

## 1. Focused game page: PASS

3/3 checks verified.

- **passed** G1_NAV: Game routes preserve detail, position and return destinations without inventing games.
- **passed** G1_UI: Library and focused review are separate; Back restores search, one board, no analysis on navigation.
- **passed** G1_PATTERNS: Opening patterns are bounded and expandable; all remain reachable outside game detail.

## 2. Evidence-based tactical practice: PASS

4/4 checks verified.

- **passed** G2_PROOF: Attack/defence tags require legal stored engine evidence; neutral moves and incomplete proof stay unlabelled.
- **passed** G2_MATE: Mate distances use learner moves, both colours, selectable limits 1–4, exclude mate 17 and keep valid alternatives.
- **passed** G2_UI: Tactical filters and mate limit persist, retain hidden answers and distinguish missing evidence from no errors.
- **passed** G2_ENGINE: Real Stockfish labelled sound-move and tactical cases retain correct filters; fake engines cannot satisfy this gate.

## 3. Cross-game learning focus: PASS

3/3 checks verified.

- **passed** G3_PLAN: Recurring objective patterns use distinct game evidence, bounded selection and transparent ranking; sparse evidence stays provisional.
- **passed** G3_HISTORY: Profiles, time-control/analysis cohorts, recency and repetitions remain separate; selecting a focus creates no analysis or credit.
- **passed** G3_UI: The learner sees a supported focus, reason, source games and a direct practice action with no extra board or forced cloud service.

## Human and learning evidence

- **unmeasured** Physical Safari and assistive-technology usability
- **unmeasured** Learner understands the recommendation without explanation from the developer
- **unmeasured** Delayed recall, unfamiliar-position transfer and fewer serious errors in later games
