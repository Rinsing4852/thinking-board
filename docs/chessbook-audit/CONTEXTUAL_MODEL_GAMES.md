# Contextual model-game study: proposed next increment

Status: specification only. CB40 remains absent in the feature tracker. This
builds on the observed workflow in RECONSTRUCTION.md; it does not claim recovery
of Chessbook's ranking, explanations or private implementation.

## Purpose and example

Answer: “I know these opening moves; what am I trying to do next?”

From a saved Modern Defence position, choose **Study a game from here**. The tool
finds a complete game that reached that actual position, explains the match, and
starts just before the transition beyond the saved preparation. The student can
watch, step back, or try the next move on the same board. The game illustrates a
plan; its next move is not automatically an engine-best answer.

An opening name alone is insufficient: two games labelled Modern Defence can
have different pawn structures and plans. Prefer exact position matches,
including valid move-order transpositions. Similar structures would be a later,
explicitly labelled matching mode, not silently passed off as exact matches.

## First version

1. Add **Study a game from here** as a secondary action on a saved position,
   outside active recall. Start with complete games imported by the user into a
   separate study library. Existing PGN/replay and opening-matching code are
   building blocks; model-game selection and study progress do not yet exist.
2. Offer up to three matching games. Show players, date, result, ratings where
   supplied, source, and an explanation such as “Reaches your position after
   8...a6 via a different move order.” Missing metadata stays unknown.
3. Rank by actual matched position/route, useful continuation beyond the match,
   available instructional annotations, and study history. Keep the rule visible;
   avoid ranking every win above a draw or loss. Prefer variety after studying
   one game rather than repeatedly surfacing the same game.
4. Reuse one board. Show the matching position, highlight where saved preparation
   ends, then allow Previous, Next, Jump to match and Resume. Show a brief plan
   note when there is a supported annotation, with its source. Do not invent a
   strategic explanation from a move sequence alone.
5. Offer optional **Try the next move**. Compare with the played move and show
   “Different from the game” for another legal move. A later, bounded engine
   check may explain alternatives, with depth/source/uncertainty shown. A hint or
   reveal is recorded as help, not unaided success.
6. Save game ID, match position, current ply, replay/guess mode and help state.
   Return to the same repertoire position. Study never adds repertoire moves,
   changes spaced-repetition due dates, increases preparation coverage or counts
   as correct scheduled recall.

Avoid a new dashboard section or a second analysis board. Keep explanation and
game context alongside the existing board, with deeper details behind one action.

## Later increments

- Add a separate, opt-in source adapter for externally sourced games after
  verifying provider access, licensing, attribution and rate limits. Existing
  Lichess reply-frequency counts alone are not complete model games or expert
  annotations. Saved imported study must remain usable when a provider is down.
- Add reviewed plan notes: pawn breaks, piece placement, exchanges and an
  important counter-plan. Label generated analysis and allow corrections.
- Add carefully labelled similar-structure matches only after exact matching
  works well. Never mix similarity with an exact repertoire match.
- Revisit a selected plan after seven or fourteen days with a separate
  understanding task. Do not describe study completion as proven retention.

## Quality gates and measurements

| Gate | How to verify |
|---|---|
| Relevant game | Fixtures cover exact matches, transpositions, either repertoire colour, custom roots and a same-opening-name non-match. Show the matched board and ply. |
| Useful continuation | Legal complete mainline, moves after the match and explicit empty state when none qualify. Deduplicate imported games. |
| Clear selection | Show why each of the top three games was selected and identify its source. First-use users can explain the match without help. |
| Honest guessing | Played move, assisted move and alternative legal move have distinct outcomes; no unsupported chess-blunder label. |
| Recovery | Reload at a middlegame position restores game, ply, mode and help. Back returns to the original repertoire position. |
| No score inflation | Compare recall events, memory cards, due dates, daily practice credit and coverage before and after study; all remain unchanged. |
| Failure recovery | Empty library, malformed PGN, unavailable source and deleted game show an actionable state without losing repertoire or study data. |
| Learning value | Use the same opening/task on each tool; record time to relevant game, actions, match accuracy, plan explanation and delayed unaided results. These human outcomes are currently unmeasured. |

The first reviewable milestone should be **exact-position matching + transparent
game selection + replay and resume**. Optional guessing and richer plan notes
follow that milestone. Automated correctness can be verified before release;
instructional quality still requires review of real examples and human tasks.
