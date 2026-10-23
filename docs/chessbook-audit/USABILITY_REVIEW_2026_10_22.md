# Human workflow review — 22 October 2026

## Finding

The navigation problem is information architecture, not a shortage of features.
The opening landing page presents several different jobs at once, then repeats
some of them in the recommendation panel and expanded repertoire cards. The
played-games screen puts importing ahead of choosing an existing game. Technical
labels, numerous totals and long explanations make the next action harder to see.

This review covers the Today, opening library, build/browse, practice/resume,
model-game entry, played-game import/review and progress workflows. It includes
rendered desktop and phone previews and automated journeys. It is an expert
review, not evidence from independent usability participants.

## Intended journeys

| Job | Entry | Next action | Additional controls |
| --- | --- | --- | --- |
| Remember opening moves | Openings → Practise my repertoire | Play the prompted move | Pause saves the place; one Resume action returns there |
| Change preparation | Openings → saved repertoire → View all lines | Edit lines, then choose a move | Other practice modes and repertoire details open on request |
| Build a repertoire | Openings → Build on the board | Name it, choose a colour, play moves | Import remains a separate explicit action |
| Follow a stronger player | Openings → Study a stronger player’s game | Choose repertoire → Find a study game | Position-specific study remains available from the saved board |
| Learn from a played game | My games → select a saved game | Replay and recall the prepared response | Add a game opens PGN import and optional Lichess sync |
| Check learning | Progress | Inspect recall or thinking results | Detailed opening practice plan remains optional in Openings |

## Implemented simplification

- Replace the Today slogan/checklist/onboarding stack with a plain task heading
  and direct opening/game routes. Move the five exercise-type buttons behind
  “Choose a thinking exercise”; retain the current drill and saved sessions.
- Give Openings one heading and one primary practice/resume action. Remove the
  separate resume panels and repeated practice-mode explanation panel.
- Keep building/importing and saved repertoires readily accessible. An expanded
  repertoire initially offers two actions: practice and view lines. Alternative
  practice modes, metadata and archive are in an explicit details section.
- Move settings/library management and the practice plan into separate optional
  sections below the library. Remove the second board from the recommendation
  panel. Keep late summaries below stable library actions.
- Put the model-game repertoire selector behind its named study entry. Preserve
  both replay and guessing and the distinction between historical moves and
  engine evaluations.
- Start My games with saved-game review. Close the import form by default; keep
  analysis progress, errors, retry and completion feedback outside that disclosure.
  Put the saved-game selector and selected replay before cross-game opening follow-ups.
  Import shortcuts open the form directly. Closing a form retains its draft.
- Show three move suggestions initially, with an explicit full-list action. Keep
  position/move evaluations and the distinction between engine strength and
  opponent frequency. Move engine-generated response previews behind a named
  disclosure; applying still requires an explicit action.
- Remove the inaccurate “no cloud” badge and database/server jargon in the footer.

## Quality measures

| Measure | Previous behaviour | Acceptance criterion |
| --- | --- | --- |
| Expanded repertoire action load | Up to eight competing actions | Two immediately visible actions; remaining tasks reachable with visible controls |
| Opening resume | Top practice button plus separate resume card | One labelled resume action; same saved queue entry after resume |
| Import vs saved-game review | Import form always before saved games | Form initially closed; game review and job feedback remain accessible |
| Move suggestion load | Up to seven or more rows | Three initially; full list available without losing the position |
| Optional data arrival | Could add dense content to the landing page | Library usable before summaries; late data does not move its targets |
| Phone layout | Long stack of mixed tasks | No horizontal overflow; touch controls and square boards preserved |
| Learning evidence | Practice activity can be mistaken for retention | Unaided delayed recall is labelled separately; no claimed improvement from activity alone |

Automated completion verifies reachability, saved-state behaviour and geometry.
It does not establish that the interface is understandable to every player.
The next human check should ask someone to practise a saved opening, edit a
response, find a study game and review a played game without coaching. Record
completion, wrong turns and any label they cannot explain. Prioritise those
observations before adding another feature. Opening puzzles remain deferred.

## Verification — 23 October 2026

Final frozen-source verification passed type checking, production build, 343
unit/integration tests, six tracker assessment tests and 184 desktop Chromium /
mobile WebKit browser journeys. There were no failed, flaky or skipped tests.
The source fingerprint is
`d4263223dfa61cd0aa63785d49655664cadab881b8120bedd705f0de8d33e93a`.
Desktop and phone renders were inspected. The browser journeys cover accessing
optional controls through their visible summaries, retaining import drafts,
showing analysis failure/retry outside the closed form, limiting initial move
choices, opening study games, saved-game replay and resuming practice.

This is local evidence. Container publication and Linux release verification
remain separate GitHub Actions results. No live user database was modified.
