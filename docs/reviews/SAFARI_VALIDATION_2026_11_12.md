# Safari validation — 12 November 2026

## Scope and verdict

Native Safari access is restored. This follows the [7 November checkpoint](BUILD_VALIDATION_AND_NEXT_GATES_2026_11_07.md) and the charter's validation-first sequence.

**The checked desktop Safari board/review journey works, but the completion handoff needs a focused fix.** The installed application is the earlier published build; recent local changes remain uncommitted/unpublished. This pass makes no application or deployment changes.

## Installed application

- URL: `http://192.168.1.175:8185/`.
- Health endpoint and visible footer agree: version **1.5.27**, build **37668747bd860bb2303fbbd4c704dfbbb0b29b13**.
- Today displayed a recurring material-loss focus, supporting-game count and practice action.
- Following its supporting-decision link opened the intended source game at position 25, before Black's 13th move. The board rendered in Black orientation, the corresponding decision was selected, and the latest analysis displayed 50 of 50 own moves assessed with move-quality counts.
- Review status and analysis completion were presented separately. No answer was submitted/revealed, no review decision was deliberately marked complete, and no training session or analysis job was started on the personal installation. Opening a game can create its saved-feedback snapshot through the application's normal behaviour; this is not recall credit.
- The personal installation was returned to Today.

This confirms access and the observed navigation, not installation of the newer local tactical/text changes. Its visible wording still includes the earlier explanatory text.

## Current local source in native Safari

The fingerprint remains `d0378b33be79167f296e6b9422da2b6b18e14e15a32709838cd1e09c31c84782`. Reassessing the existing engineering evidence reported all three quality stages PASS. The comprehensive 7 November suite was not rerun for unchanged source.

Docker was unavailable in this session. Native Safari interaction checks therefore used the existing loopback UI fixture server on port 8191 with disposable synthetic games and its **deterministic test engine**. This tests the actual current UI and server workflow, not Stockfish's chess correctness. The earlier real-Stockfish evidence remains separate.

Two dated rapid test games used `1. f3 e5 2. g4 Qh4#`. The following were observed directly in native Safari:

1. Today showed the mating-threat focus with two supporting games and two due positions.
2. Starting the focus reused the ordinary trainer and showed **2 remaining, 0 completed**.
3. Playing the game move changed the board to Black's turn. Selecting Check and clicking the queen on d8, then h4, selected **Qh4#**. Submitting the answer produced the expected feedback and **1 remaining, 1 completed**.
4. Returning to My games immediately showed **Partially reviewed, 1/2 decisions** for the source game. The other game remained ready to review. Practice therefore updated its matching source decision, not every similar position.
5. Returning to Today and reloading Safari retained **1 remaining, 1 completed**. The remaining exercise belonged to the other synthetic source game, despite the identical position.
6. Revealing that remaining answer produced **MISSED** feedback and **0 remaining, 2 completed**, rather than a second correct answer. Continue displayed **Session complete**. The focus button was disabled and a next-review time was shown.

These are agent-operated synthetic tests, not the learner's unaided results, comprehension or improvement. They do not establish physical iPhone touch/drag/promotion or assistive-technology usability. The fixture browser tab was closed after inspection; personal practice history was not used for test answers.

## Finding: completed focus is replaced by a larger-looking daily workload

After the two focus exercises completed correctly, the surrounding daily-plan card changed from **Game decisions · 2 exercises** to **Game decisions · 4 exercises**. It offered Start daily practice alongside Session complete, while Practise this focus was disabled until the next review.

This is not evidence that the two completed attempts failed to save. The completed source review and session counters worked. The daily recommendation falls back to the broader due exercise queue once the focused items are no longer due, and a focus-only session does not create the saved daily plan.

Supporting code: `training/daily-practice-service.ts`, `get()` computes `learningFocus?.dueCount || Math.min(5, dashboard.practice?.available ?? 0)` when no active session remains. Focus start separately uses `LearningFocusService.start()` and the ordinary training service. The fallback's different scope is not apparent in the shared “Game decisions” label.

Fixture API evidence after completion:

- [Daily plan](evidence/2026-11-12-safari/daily-after-focus.json): `id: null`, `status: ready`, `thinkingCount: 4`.
- [Active session](evidence/2026-11-12-safari/active-after-focus.json): no active session.

### Charter purpose check for the proposed fix

- **Need:** LR02/10/11: know when the selected round is complete and avoid interpreting other available exercises as unfinished work.
- **Existing/simplest option:** preserve the current completed session, source-review credit and schedules; make completion explicit and distinguish optional further work from the finished focus. Reuse Today and the ordinary trainer. Do not add another queue or reset due dates to make counts look smaller.
- **Expected benefit:** clearer stopping point and less apparent repetition. This is a usability hypothesis, not measured learning gain.
- **Acceptance:** completing a focus produces one clear completion state; reload/navigation preserve it; other available exercise types are labelled as optional/new work; the completed items remain scheduled and are not silently repeated; active daily plans still resume correctly; new imports/profile/date boundaries are handled deliberately. Test both correct and revealed answers and exact source-review credit.
- **Costs/protections:** a bounded state/UI handoff change and targeted regression coverage. Preserve historical sessions, attempts, games, repertoires and schedules. Do not solve this by hiding genuine due work permanently or marking all similar tasks mastered.
- **Decision:** proceed as the next reliability/trust fix before layering persistent-plan behaviour over this handoff. No implementation is included in this validation report.

## Sufficiency and next order

| Area | Assessment | Next action |
|---|---|---|
| Native desktop Safari board and source-review integration | Passed the checked synthetic flow | Keep regression coverage; owner comprehension and mobile-device checks remain unmeasured |
| Session completion handoff | Needs improvement | Make completed focus and optional further practice distinct before adding persistence |
| Trustworthy explanations and trends | Still needs the previously identified fixes | Qualify inferred causes; separate general trends by platform; retain provenance/history |
| Persistent personal plan | Still planned, not implemented | Save chosen focus/evidence/baseline after the above fixes; explicit keep/change, stale-evidence handling and no duplicate credit |
| Release readiness | Local engineering evidence passes, publication/installation of current source outstanding | Fresh image build/publication and installed-update check remain separate from this Safari workflow evidence |
| Learning benefit | Unmeasured | Delayed unaided recall and later-game serious-error rates with comparable cohorts and denominators |

The Safari access blocker is closed. There is no reason to repeat the whole unchanged test suite merely because access was restored. The useful next work is the reproduced completion handoff and the small trust fixes, followed by the persistent plan, with renewed tests after implementation. Recheck the whole session before expanding training content.
