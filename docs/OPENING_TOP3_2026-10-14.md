# Opening preparation, board guidance and recommendations

## Coverage evidence

Coverage reports now show two independent sources:

- Observed opponent replies from up to 100 recent imported games for the active
  player and repertoire side. Each position counts once per game, so repeating
  a position does not inflate its frequency. The empirical prepared percentage
  counts observed replies with saved responses at saved opening positions within
  the chosen depth. It is not whole-game preparation or memory mastery.
- Lichess rated-game frequencies for the selected rating band and supported
  speeds. Path estimates retain their own sample denominators. Old, missing and
  small samples remain unknown; personal occurrences never become invented
  Lichess probabilities.

A reply seen in a game can now be an evidenced missing response even when no
global sample represents it. The population frequency can still be unknown.

## Board arrows

While building a repertoire:

- On the learner's turn, a green arrow shows the leading legal Stockfish
  candidate at the reported search depth.
- On the opponent's turn, blue arrows show up to three legal replies ranked by
  Lichess sample counts, with their percentages and sample sizes in a legend.
  Opponent engine rankings do not determine those arrows.
- The rule follows the repertoire side. It works for White and Black.
- No frequency arrows are drawn from stale or small samples, mismatched
  positions/rating bands, unavailable data or unsupported moves. Fewer than
  three supported replies produce fewer arrows rather than fabricated ones.
- Arrows can be hidden. They disappear outside build mode and are never passed
  to the recall board. Imported source annotations remain separate.

The same cancellable request pair feeds the board and move-comparison panel;
late responses cannot replace the current position's guidance.

## Recommendations

The home page explicitly presents recommended next steps and explains empty,
paused and daily-goal-complete states. Preparation recommendations work from
personal games even with Lichess frequencies off.

Preparation selection is independent of the recommended memory session. It
compares local game evidence across up to 12 active repertoires, favouring the
side present in the player's games. Only the selected repertoire may fetch the
next bounded Lichess sample batch when practical data is enabled.

## Lichess setup

The current official [rated-games explorer specification](https://github.com/lichess-org/api/blob/master/doc/specs/tags/openingexplorer/lichess.yaml)
requires OAuth authentication. An unauthenticated live request returned HTTP
401 during this implementation. Therefore the existing server-side
`LICHESS_API_TOKEN` requirement remains; the client never receives the token.
Personal-game coverage and local Stockfish suggestions remain available without
it. The home page makes the setup status visible and links to opening settings.

## Validation

Focused tests cover source denominators, profile/colour isolation, repeated
positions, selection across different practice/preparation repertoires, turn
roles, frequency ranking, invalid/stale data and arrow hiding. Full results are
recorded in the [feature tracker](chessbook-audit/README.md).

Safari's live user session could not be inspected because the Mac was locked.
Browser verification uses disposable local data on Chromium and mobile WebKit.
