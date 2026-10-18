# Automatic stronger-player examples

## User flow

At a saved opening position, choose **Study a game from here** in Browse or
Build. Enter **Your Lichess rating**, then **Find games**. Search checks rapid and
classical examples; the player on the repertoire's side must have a known game
rating strictly above the entered rating. The chosen scale is explicit: a
Chess.com/FIDE coverage band is never silently converted to a Lichess rating.

Results show both players and ratings, the stronger player's rating difference,
the result/date when supplied, a link to the original Lichess game and whether
the game follows the saved moves or reaches the same position by another route.
Choose **Replay from this position** to save the example and start at the match.
Previous/Next, reload and Back reuse the established replay flow on one board.
No PGN download/paste is required. Imported examples remain available separately.
On a phone, a new study opens with search before the board; a resumed replay
keeps the board first. Selecting a result moves focus to the replay controls.

The rating is stored per profile after a successful search, including a valid
empty sample. Later visits search automatically with this rating unless a saved
replay is already being resumed. Search does not silently replace that replay.

## Source and matching

The server uses Lichess's official
[opening explorer](https://github.com/lichess-org/api/blob/master/doc/specs/tags/openingexplorer/lichess.yaml)
and [game export](https://github.com/lichess-org/api/blob/master/doc/specs/tags/games/game-export-gameId.yaml)
endpoints. Lichess currently requires authentication for explorer requests;
configure the existing server-side `LICHESS_API_TOKEN`, also used for coverage.
It is sent only to fixed HTTPS Lichess hosts, never returned to the browser.
An unauthenticated live request returned HTTP 401 during development; an
authenticated live discovery journey was not measured in this environment.

Each query requests at most four top games and four recent games at the exact
position, with rapid/classical speeds. It includes all rating bands to avoid
excluding games with unequal player ratings. Provider aggregate bands and
reference ratings are not proof of a stronger learner-side player: the server
downloads each full PGN and verifies its actual player rating, legal mainline,
finished result, exact position and continuation beyond that position.
Board identity includes side, castling and legal en-passant rights, ignoring
move counters. An opening name alone is never a match. Unknown/equal/lower
learner-side ratings, other positions and games ending at the match are omitted.

Up to three examples are offered, ranking the saved move order first, then the
closest higher learner-side rating **within this sample**, then a stable source
URL. Initial-board searches say that the match is broad. This is neither an
exhaustive game search nor a claim that every played move is the strongest.
There is no master-source adapter, rating-scale conversion, source switching,
move guessing, generated strategic explanation or measured learning benefit.
CB40 and CB41 therefore remain partial.

## Recovery and data boundaries

Search downloads run sequentially, with one active search per profile, a
22-second search deadline, six-second request deadlines and a 2 MB response cap.
HTTP 429 starts a one-minute provider cooldown. Missing/invalid connections,
timeouts, malformed responses and partial game downloads produce explicit retry
or partial-result messages. Empty samples never substitute unrelated games.
Existing local replays remain available when the provider is offline.

Offered games are held in a bounded server cache for ten minutes, tied to the
profile and saved position. Selecting an expired result asks for another search.
The current profile and saved position are checked again after asynchronous
search and before saving. No game enters the study library until selected.
Selection imports and starts replay in one transaction, retains the original
URL, and does not write into played games, repertoire moves, review schedules,
practice credit or coverage. Online identity uses the source plus legal mainline:
a manually imported game with identical moves but different players cannot
replace the online game's verified ratings or attribution. Repeated selection
of the same online game reuses the stored example.

Browser replay failures keep the established write lock and Reload recovery.
A provider failure leaves the current replay and manual-import controls intact.
Migration 038 adds only the per-profile study rating preference.

## Verification

Service tests cover both repertoire colours, transpositions, higher ratings on
the correct side, unknown and equal/lower ratings, malformed/unfinished games,
finished matches with no continuation, provider errors and cooldown, partial
samples, profile changes during search, stale/expired selections, hostile source
references, online identity, shortlist pinning, and unchanged recall/played data.
Route injection verifies schema validation and asynchronous error responses.

Browser journeys use the actual search/import/progress endpoints with a test-only
Lichess fixture in `tests/e2e-server.mjs`; production has no fake-provider mode.
They cover provider retry, direct and transposed search results, exclusion of a
weaker player, source links, direct replay, saved rating, automatic subsequent
search, reload, single board and unchanged repertoire content. The live provider
is not a dependency of deterministic tests. Final suite results are recorded in
the generated quality report after verification.

Final verification on unchanged source passed **308 unit/integration tests, 152
browser journeys, six tracker checks, typechecking and the production build**,
with no failures, skipped checks or flaky retries. The eight focused study
journeys also passed in isolated Linux Chromium and WebKit. The refreshed tracker
records 89 verified requirements, 44 unknown and 36 unmet; these are evidence
counts, not a Chessbook parity or learning-effectiveness percentage.
