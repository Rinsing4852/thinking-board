# Workflow review — implementation follow-through

The owner authorised implementation after the workflow audit. This pass connects
and simplifies existing workflows without replacing their queues, scores or history.
The original audit remains an assessment of its reviewed version; this document
records the subsequent changes and their acceptance evidence.

## Charter purpose checks and implementation

### One daily starting point — LR01/02/10/11

**Need:** Today displayed a daily plan, a separate focus card, a general-session
starter and manual modes as competing choices. **Existing capability:** the daily
service already selects due exercises from the recurring focus and resumes the
existing queues. **Decision:** reuse that selection, present its learning context
within the daily plan, and group manual session/player/date-filter/mode controls
under one optional disclosure. Keep the primary start above asynchronously loaded
focus evidence. Focus-only practice and time-control selection remain in the
supporting-evidence disclosure. A saved session retains its original positions
and filter; selecting a different optional focus does not rewrite a saved plan.
**Expected benefit:** easier choice of the next action; this is a usability
hypothesis until observed with the learner. **Acceptance:** delayed-focus response
does not move the main start; default manual actions are hidden but reachable;
existing opening/thinking queues resume and complete, including date filters and
profile changes. **Protection:** no new scheduler, queue, schema or training credit.

### Concrete warnings and checking habits — LR03/04/05/07/13

**Need:** Engine results can identify a mistake without explaining a transferable
checking habit. **Existing capability:** retained-material and mate evidence,
legal continuations and a conservative fork detector already exist. **Decision:**
reuse that evidence to distinguish non-capturing forks in the recurring focus
(the saved continuation must take one of the double-attacked targets),
and add direction-specific warnings/habits to game-review feedback and blunder
exercise answers/reveals. Keep answer-specific lessons hidden until feedback.
An immediate winning capture is explained as a capture, rather than relabelled a
fork because of incidental attacks after it. Unknown evidence gets no invented
lesson. Replace “Thinking-process failure” with “Habit to practise”.
**Expected benefit:** recognition beyond memorising the engine move; learning
benefit remains unmeasured. **Acceptance:** the supplied missed-queen game receives
capture advice; attacking/defensive habits differ; unknown patterns produce no
claim; material proof and real-engine negative controls remain intact.
**Protection:** this does not infer why the learner erred, change historical grades
or award full-mate execution credit for finding only the first move.

### Actionable opening preparation and study — LR02/07/10/11

**Need:** Large preparation totals and several simultaneous suggestions obscure
the next action; model-game study needs context. **Existing capability:** ranked
tasks, reversible postpone/skip/restore, detailed sample evidence, position-matched
study and one board. **Decision:** show one preparation task by default, retain
all tasks through Show all, move category totals into the existing details and
shorten the initial whole-repertoire explanation. Explain the contextual study
entry beside the saved board and the route for choosing an earlier position.
**Expected benefit:** one useful task before statistics, with evidence still
available. **Acceptance:** large lists expand fully, narrow layouts fit, existing
task actions and model-game journeys keep working. **Protection:** no task deletion,
changes to ranking, statistical assumptions, imported games or repertoire content.

### Clear import ownership and preserved settings drafts — LR10/11/12

Show the selected learner and explain the active-player change before a PGN save.
Explain Lichess's existing six-hour check versus Chess.com's explicit monthly
import. Preserve an active settings draft when the mounted form receives updated
preferences; Cancel restores current saved preferences. Leaving that page or
remounting the entire workspace is not promised to preserve an unsaved settings draft. Reuse existing services and avoid confirmation
dialogs or new account settings. These changes clarify existing behaviour and
protect work; they do not add automatic analysis.

## Verification

Completed against the final local application source on 31 October 2026:

- Type checks and production server/web builds passed.
- **450/450 unit tests** passed.
- **228/228 browser journeys** passed across Chromium and mobile WebKit, with
  no skipped, flaky or unexpected results.
- **25/25 genuine Stockfish 18 checks** passed (16 tactical and nine thinking/game
  cases). The three-stage engineering gate is **PASS**, with current unchanged
  source evidence: [quality report](../learning-quality/QUALITY.md).
- Additional Linux Docker checks passed **32/32** affected journeys; the revised
  Today-to-requested-analysis entry was also checked in both browsers (**2/2**).
- Desktop/mobile captures of the daily start, lesson feedback and one-task
  preparation view were inspected. The main Start button remains fixed while
  delayed focus evidence arrives, and the full preparation list remains reachable.
- The full suite exposed two old expectations for the removed duplicate Today
  entry and multiple default preparation tasks. Those journeys now follow the
  visible Review a game route and explicitly expand See all; the final full run passed.

All tests used isolated data. No live learner database or deployment was changed.
The earlier game-review status and Profile improvements are retained. Publication is separate from this verification record; check the GitHub workflow
for container availability. Passing engineering checks does not establish human
usability or improved play.

## Remaining research and deeper work

- Physical-device Safari/assistive-technology and unaided human task success remain
  unmeasured. Automated mobile WebKit is useful regression evidence, not a substitute.
- Full short-mate execution still needs a dedicated, bounded grading workflow that
  accepts alternative solutions against best defence. Existing root-move credit
  is not reinterpreted as full-sequence success. The new advice states that distinction.
- The current fork classifier is deliberately conservative and backed by retained
  material evidence; it is not a complete pin/skewer/discovered-attack taxonomy.
- First-seen unfamiliar recognition, delayed retention and transfer to later games
  require eligible positions and dated game/attempt evidence. Do not manufacture
  a trend or retrospective first-attempt records. Follow the audit's measurement plan.
- No external dataset, additional engine, cloud coach or subscription is required
  by this pass. Further content work must pass the charter check and preserve this
  simpler workflow.
