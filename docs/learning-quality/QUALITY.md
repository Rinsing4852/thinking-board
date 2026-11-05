# Learning quality gates

**PASS** · source evidence current.

Engineering acceptance only. Human usability and learning benefit are not established.

Validation: grader=passed, types=passed, unit suite=passed, build=passed, browser gates=passed, real Stockfish: smoke-tactical-training.mjs=passed, real Stockfish: smoke-thinking-exercises.mjs=passed.

## 1. Focused game page: PASS

5/5 checks verified.

- **passed** G1_NAV: Game routes preserve detail, position and return destinations without inventing games.
- **passed** G1_UI: Library and focused review are separate; Back restores search, one board, no analysis on navigation.
- **passed** G1_PATTERNS: Opening patterns are bounded and expandable; all remain reachable outside game detail.
- **passed** G1_BRANCH_TREE: Saved move sequences form stable nested branches, separate first moves/replies, ended lines and distinct starting boards without changing source data.
- **passed** G1_BRANCH_TREE_UI: Collapsed repertoire branches expose the selected route; search reveals nested and first-reply alternatives on desktop and mobile without changing saved lines.

## 2. Evidence-based tactical practice: PASS

4/4 checks verified.

- **passed** G2_PROOF: Attack/defence tags require legal stored engine evidence; neutral moves and incomplete proof stay unlabelled.
- **passed** G2_MATE: Mate distances use learner moves, both colours, selectable limits 1–4, exclude mate 17 and keep valid alternatives.
- **passed** G2_UI: Tactical filters and mate limit persist, retain hidden answers and distinguish missing evidence from no errors.
- **passed** G2_ENGINE: Real Stockfish labelled sound-move and tactical cases retain correct filters; fake engines cannot satisfy this gate.

## 3. Cross-game learning focus: PASS

8/8 checks verified.

- **passed** G3_PLAN: Recurring objective patterns use distinct game evidence, bounded selection and transparent ranking; sparse evidence stays provisional.
- **passed** G3_HISTORY: Profiles, time-control/analysis cohorts, recency and repetitions remain separate; selecting a focus creates no analysis or credit.
- **passed** G3_UI: The learner sees a supported focus, reason, source games and a direct practice action with no extra board or forced cloud service.
- **passed** G3_REVIEW_LINK: Today feedback reviews only its exact source engine decision and analysis snapshot; no extra scheduling or recall credit, cross-profile credit, stale-content credit or reset resurrection.
- **passed** G3_REVIEW_LINK_UI: Completing Today practice updates source-game review progress and shows reviewed-in-practice after navigation and reload, independently of recall.
- **passed** G3_COACH_UI: The current learning focus visibly connects a warning sign, checking habit, source decision and existing practice action without another training mode.
- **passed** G3_TRANSFER: Later-game observations anchor to recorded current-content study, separate cohorts/platform/colour and exclude incomplete or ambiguous data; no causal improvement credit.
- **passed** G3_TRANSFER_UI: Recorded focus study and a later analysed game expose comparable sample counts, ratings and explicit uncertainty with no false improvement claim.

## Human and learning evidence

- **unmeasured** Physical Safari and assistive-technology usability
- **unmeasured** Learner understands the recommendation without explanation from the developer
- **unmeasured** Delayed recall, unfamiliar-position transfer and fewer serious errors in later games
