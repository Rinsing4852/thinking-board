# Readiness to move on — 18 October 2026

The saved own-game review is ready to release and move beyond. Its six tracked
acceptance criteria pass. The complete unchanged-source run passed 316 unit and
integration tests, 156 browser tests, six tracker checks, typechecking and the
production build, with no failures, skips or flaky retries. Regenerating the
audit after the run confirmed current evidence. See the
[delivery record](./GAME_REPLAY_RECALL.md) for behaviour and limits.

The tracker now has 92 verified requirements, 44 unknown, 36 unmet and three
excluded. These are requirement counts, not a percentage of feature parity.
Unknown means unverified; it does not establish absence. Passing automated
checks does not establish ease of discovery or improved learning.

## Small usability gate

The user's repeated difficulty finding stronger-player games is direct evidence
that discoverability needs attention. Before a further major learning screen,
check that a user can find and distinguish these three routes without guidance:
practise my repertoire, review my played game, and study a stronger player's
game. Use the same fixture in each tool, record completion, actions and recovery,
and inspect phone layout. Make a focused entry-point/copy improvement if needed;
another broad redesign of the completed replay is not justified by current evidence.

## Next main feature: sound alternatives versus recall errors (CB33)

Normal opening practice should distinguish remembering the saved response from
playing a different, sound chess move. Own-game replay already accepts stored
alternatives, but does not analyse unlisted guesses. That boundary should remain
clear while normal practice gains optional quality feedback after a legal guess.

Acceptance gates for the implementation:

- A saved alternative is accepted as repertoire recall. An unsaved move never
  earns remembered-repertoire credit solely because the engine likes it.
- Feedback says clearly whether the move matches preparation and, separately,
  whether sufficiently reliable engine evidence regards it as playable.
- Assessment starts after the guess, revealing no answer beforehand. Cached
  evidence must match the exact position and assessment settings.
- Scores use the mover's perspective and handle mate and terminal positions.
  Timeouts, unavailable or insufficient analysis produce uncertainty, not an
  invented mistake label.
- The first scheduled result is recorded once. Reveals and local retries do not
  grant extra practice credit or erase the original recall result.
- Test both colours, saved and unsaved alternatives, failure/recovery, reload
  and duplicate submission; then inspect feedback clarity on phone and desktop.

CB33 currently has its recall-credit separation check verified; separate quality
feedback and unreliable-analysis handling remain unknown in the tracker. This
is a proposed acceptance specification, not a claim of delivered functionality
or knowledge of Chessbook's grading algorithm.

## Following priorities

1. Add guess-the-move to contextual model-game study (CB40). Distinguish the
   historical move from an engine recommendation; other legal moves cannot be
   called wrong without supporting evidence. Include hints, resume and separate
   study progress, without normal repertoire recall credit.
2. Improve source choice and master-game evidence (CB22/CB41), with sample counts,
   provenance and honest empty-pool behaviour.
3. Add assisted gap filling (CB27/CB29) with a reviewable preview, atomic save,
   undo and preservation of existing choices. Reliable grading and evidence
   should precede larger generated branches.

Chessbook's [official public homepage](https://chessbook.com/) currently describes
model-game guessing, game feedback and level-relevant move evidence. Its
[repertoire page](https://chessbook.com/repertoires) describes Autofill. These
public descriptions support the comparison areas; no fresh paid-account runtime
comparison, grading-algorithm verification or timed competitor study was performed
for this release review. The REA observation/specification/measurement approach
is adapted here; REA itself was not installed or run.
