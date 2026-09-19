import type {
  AuthoredOpeningMove,
  MoveExplanation,
  OpeningConcept,
  OpeningCurriculum,
} from "./opening-content.js";

type ExplanationExtras = Pick<
  MoveExplanation,
  "opponentIdea" | "resultingPlan" | "tacticalWarning" | "commonMistake"
>;

function taught(
  moveUci: string,
  summary: string,
  changes: string[],
  concepts: OpeningConcept[],
  extras: Partial<ExplanationExtras> = {},
): AuthoredOpeningMove {
  return { moveUci, explanation: { summary, changes, concepts, ...extras } };
}

function opponent(
  moveUci: string,
  summary: string,
  changes: string[],
  opponentIdea: string,
  concepts: OpeningConcept[] = ["central_control"],
): AuthoredOpeningMove {
  return { moveUci, explanation: { summary, changes, concepts, opponentIdea } };
}

// White 1.e4: one coherent, principled answer to the replies most often met in
// practical play. The explanations are independently authored for Thinking Board.
const e4 = taught(
  "e2e4",
  "Claims central space and opens lines for the queen and king's bishop.",
  ["White controls d5 and f5.", "The bishop on f1 and queen can now leave the back rank."],
  ["central_control", "development"],
  { resultingPlan: "Develop the kingside quickly and prepare to castle." },
);

const e5 = opponent("e7e5", "Black takes an equal share of the centre.", ["Black contests d4 and opens the f8 bishop."], "Black wants active development and will usually defend e5 with ...Nc6.");
const nf3 = taught("g1f3", "Develops a knight, attacks e5 and prepares kingside castling.", ["The e5 pawn is attacked.", "The king is one step closer to castling."], ["development", "king_safety", "tempo"], { resultingPlan: "Bring the bishop to c4 and castle before starting central operations.", commonMistake: "Do not move the same piece repeatedly while the king remains in the centre." });
const nc6 = opponent("b8c6", "Black develops while defending e5.", ["The e5 pawn gains a defender.", "Black adds control over d4."], "Black answers the attack without losing time and prepares ...Nf6.", ["development", "central_control"]);
const bc4 = taught("f1c4", "Develops the bishop toward Black's sensitive f7 square.", ["The bishop attacks f7.", "White can now castle kingside."], ["development", "king_safety", "piece_activity"], { resultingPlan: "Castle, support the centre with d3, then prepare c3 and d4.", tacticalWarning: "Pressure on f7 is useful, but do not sacrifice unless enough pieces can join." });
const bc5 = opponent("f8c5", "Black develops actively and points at f2.", ["The bishop attacks f2.", "Black is closer to castling."], "Black mirrors White's development and may use the diagonal against f2.", ["development", "piece_activity"]);
const blackNf6 = opponent("g8f6", "Black develops with tempo against e4.", ["The e4 pawn is attacked.", "Black is ready to castle."], "Black wants quick castling and pressure on White's centre.", ["development", "tempo"]);
const d3 = taught("d2d3", "Supports e4 and opens the c1 bishop while keeping the centre stable.", ["The e4 pawn gains another defender.", "The c1 bishop can develop."], ["pawn_structure", "development"], { resultingPlan: "Build with c3, Re1 and Nbd2, then play d4 when prepared.", commonMistake: "Playing d4 immediately can allow the centre to be exchanged before development is ready." });
const whiteCastle = taught("e1g1", "Moves the king to safety and activates the rook toward the centre.", ["The king leaves the central files.", "The rook on f1 can support central play."], ["king_safety", "development"], { resultingPlan: "Finish development and prepare the d4 break." });
const blackD6 = opponent("d7d6", "Black reinforces e5 and opens the c8 bishop.", ["The e5 pawn gains support.", "The c8 bishop can develop."], "Black is completing development while keeping a solid centre.", ["pawn_structure", "development"]);
const c3 = taught("c2c3", "Prepares the central d4 break and gives the bishop a retreat square on c2.", ["White can support d4 with the c-pawn.", "The c2 square becomes available to the bishop."], ["pawn_break", "pawn_structure"], { resultingPlan: "Develop the queenside, place a rook on e1, and play d4 when it is adequately supported." });
const blackCastle = opponent("e8g8", "Black secures the king and activates the rook.", ["Black's king leaves the central files.", "The rook on f8 becomes active."], "Black can now challenge the centre without leaving the king exposed.", ["king_safety", "development"]);

const sicilianC5 = opponent("c7c5", "Black attacks d4 from the side instead of copying 1...e5.", ["The position becomes asymmetrical.", "Black prepares pressure on the d-file and queenside."], "Black wants counterplay rather than a symmetrical centre.");
const alapinC3 = taught("c2c3", "Builds a broad centre by preparing d4 immediately.", ["White supports the d4 advance.", "The b1 knight temporarily loses its natural c3 square."], ["central_control", "pawn_break"], { resultingPlan: "Play d4 and recapture toward the centre when Black exchanges.", commonMistake: "Because c3 blocks the knight, develop it through d2 later." });
const sicilianD5 = opponent("d7d5", "Black strikes at White's planned centre before it is fully built.", ["The e4 pawn is challenged.", "The centre may open quickly."], "Black uses immediate activity to prevent White from obtaining e4 and d4 for free.", ["pawn_break", "tempo"]);
const exd5 = taught("e4d5", "Accepts the central challenge and removes Black's d-pawn.", ["The e-file pawn leaves e4.", "Black's queen may recapture on d5."], ["central_control", "tactical_safety"], { resultingPlan: "Develop with d4 and Nf3 while gaining time against an exposed queen." });
const queenD5 = opponent("d8d5", "Black restores material with the queen.", ["The queen occupies the centre.", "White may develop with tempo later."], "Black accepts that the queen may be attacked in return for immediate equality of material.", ["central_control", "tempo"]);
const alapinD4 = taught("d2d4", "Rebuilds the two-pawn centre and attacks c5.", ["White occupies d4.", "The c5 pawn is challenged."], ["central_control", "pawn_break"], { resultingPlan: "Develop Nf3 and use the space advantage without chasing the queen prematurely." });
const sicilianNf6 = opponent("g8f6", "Black attacks e4 before White plays d4.", ["The e4 pawn is attacked.", "Black develops a kingside piece."], "Black tries to force e5 and obtain a target on the advanced pawn.", ["development", "tempo"]);
const e5Advance = taught("e4e5", "Gains space while attacking the developed knight.", ["The knight on f6 must move.", "White claims d6 and f6."], ["space", "tempo"], { resultingPlan: "Build the centre with d4, then develop naturally behind it." });
const knightD5 = opponent("f6d5", "The knight occupies a central square and pressures c3.", ["The knight blocks the d-pawn less directly.", "White's c3 pawn becomes a target."], "Black wants to exchange White's centre or provoke weaknesses.", ["piece_activity", "central_control"]);

const frenchE6 = opponent("e7e6", "Black prepares ...d5 and keeps a solid pawn chain.", ["The c8 bishop is temporarily blocked.", "Black challenges e4 next."], "Black accepts less space at first in return for a resilient centre.", ["pawn_structure", "central_control"]);
const d4 = taught("d2d4", "Builds the ideal centre and supports e5 possibilities.", ["White controls e5 and c5.", "The c1 bishop gains more options."], ["central_control", "space"], { resultingPlan: "Meet ...d5 with e5 and use the extra space to develop comfortably." });
const frenchD5 = opponent("d7d5", "Black attacks e4 and completes the French pawn chain.", ["White must decide whether to advance, exchange or defend e4."], "Black wants to undermine White's centre later with ...c5 and ...f6.", ["pawn_break", "central_control"]);
const frenchAdvance = taught("e4e5", "Closes the centre and takes space on the kingside.", ["The e5 pawn restricts Black's f6 knight.", "The d4 pawn becomes the base of White's chain."], ["space", "pawn_structure"], { resultingPlan: "Support d4 with c3, then develop Nf3 and Be2.", commonMistake: "Guard the d4 pawn: Black's main counterplay is ...c5 and ...Nc6." });
const frenchC5 = opponent("c7c5", "Black immediately attacks the base of White's pawn chain.", ["The d4 pawn is challenged.", "The c-file may open."], "Black's standard plan is pressure against d4, not a direct kingside attack.", ["pawn_break", "pawn_structure"]);
const frenchC3 = taught("c2c3", "Reinforces d4 and keeps the centre intact.", ["The d4 pawn gains support.", "The b1 knight will develop through d2."], ["pawn_structure", "prophylaxis"], { resultingPlan: "Develop Nf3, Be2 and castle; answer further pressure on d4 calmly." });
const frenchNc6 = opponent("b8c6", "Black adds another attacker to d4.", ["The pressure on d4 increases.", "Black develops a queenside piece."], "Black is building enough pressure to exchange or undermine White's centre.", ["development", "central_control"]);

const caroC6 = opponent("c7c6", "Black prepares ...d5 while keeping the light-squared bishop free.", ["The d5 advance is supported.", "Black spends a tempo on a solid structure."], "Black aims for a sound centre and comfortable development.", ["pawn_structure", "central_control"]);
const caroD4 = taught("d2d4", "Occupies the centre before Black completes ...d5.", ["White controls e5 and c5.", "A broad pawn centre is established."], ["central_control", "space"], { resultingPlan: "Advance e5 after ...d5 and develop behind the space advantage." });
const caroD5 = opponent("d7d5", "Black directly challenges e4.", ["White must choose the central structure.", "The c8 bishop still has a route outside the pawn chain."], "Black wants a French-like structure with an active light-squared bishop.", ["pawn_break", "development"]);
const caroAdvance = taught("e4e5", "Takes space and limits Black's kingside development.", ["The f6 square is controlled.", "White fixes a space advantage."], ["space", "pawn_structure"], { resultingPlan: "Develop Nf3 and Be2, then challenge Black's bishop without weakening the centre." });
const caroBf5 = opponent("c8f5", "Black develops the bishop before playing ...e6.", ["The bishop becomes active outside the pawn chain.", "d3 and c2 are watched."], "Black solves the traditional bad-bishop problem before completing development.", ["development", "piece_activity"]);
const caroNf3 = taught("g1f3", "Develops, supports d4 and prepares castling.", ["White adds control over e5 and d4.", "The king is closer to safety."], ["development", "king_safety"], { resultingPlan: "Develop Be2, castle and use the extra space rather than chasing the bishop at any cost." });

const scandiD5 = opponent("d7d5", "Black attacks e4 immediately.", ["The centre is challenged on move one.", "Black is willing to expose the queen after an exchange."], "Black wants a clear, forcing structure and rapid development after recapturing.", ["tempo", "central_control"]);
const scandiExd5 = taught("e4d5", "Removes the attacking pawn and forces Black to decide how to recapture.", ["The centre opens.", "Black may expose the queen early."], ["central_control", "tempo"], { resultingPlan: "Develop Nc3 with tempo if the queen recaptures." });
const scandiQxd5 = opponent("d8d5", "Black restores the pawn with the queen.", ["The queen can be attacked by Nc3.", "Black's development may lose time."], "Black accepts an early queen move for a straightforward structure.", ["tempo", "tactical_safety"]);
const scandiNc3 = taught("b1c3", "Develops a knight while attacking the exposed queen.", ["The queen must move again.", "White controls d5 and e4."], ["development", "tempo"], { resultingPlan: "Continue d4, Nf3 and Bc4; use the lead in development rather than hunting the queen." });

const modernG6 = opponent("g7g6", "Black prepares to fianchetto the bishop.", ["The dark-squared bishop will control the long diagonal.", "Black allows White to occupy the centre."], "Black plans to attack White's centre later rather than occupy it immediately.", ["development", "prophylaxis"]);
const modernD4 = taught("d2d4", "Takes the central space Black has offered.", ["White builds pawns on e4 and d4.", "The c1 bishop gains room."], ["central_control", "space"], { resultingPlan: "Develop Nc3 and Nf3, then castle before expanding." });
const modernBg7 = opponent("f8g7", "The bishop enters the long diagonal toward b2.", ["Black pressures the centre from a distance.", "Kingside castling becomes possible."], "Black wants White to overextend before striking with ...d6, ...c5 or ...e5.", ["development", "piece_activity"]);
const modernNc3 = taught("b1c3", "Develops while reinforcing e4 and d5.", ["The e4 pawn gains support.", "White increases central control."], ["development", "central_control"], { resultingPlan: "Develop Nf3 and Be2, then castle before deciding whether to expand." });
const modernD6 = opponent("d7d6", "Black supports a later central break and frees the queen's knight.", ["The e5 and c5 breaks become possible.", "Black keeps the centre flexible."], "Black is preparing to challenge White's pawn centre at the right moment.", ["pawn_break", "prophylaxis"]);
const modernNf3 = taught("g1f3", "Develops and protects the central e5 and d4 squares.", ["White is ready to castle.", "The e5 advance becomes easier to support."], ["development", "king_safety"], { resultingPlan: "Develop Be2, castle and avoid advancing more pawns before the king is safe." });

const alekhineNf6 = opponent("g8f6", "Black attacks e4 and invites the pawn to advance.", ["White can gain space with e5.", "The knight expects to be chased."], "Black hopes White's advanced pawns become targets later.", ["tempo", "prophylaxis"]);
const alekhineE5 = taught("e4e5", "Gains space and makes the knight move again.", ["White controls d6 and f6.", "Black's knight loses a tempo."], ["space", "tempo"], { resultingPlan: "Build with d4 but keep the pawn centre supported." });
const alekhineNd5 = opponent("f6d5", "The knight retreats to a central square.", ["The knight eyes c3 and b4.", "White can reinforce the centre with d4."], "Black will later attack the advanced e5 pawn with ...d6.", ["piece_activity", "prophylaxis"]);
const alekhineD4 = taught("d2d4", "Supports e5 and claims more central space.", ["White creates a strong pawn duo.", "The c1 bishop is released."], ["central_control", "pawn_structure"], { resultingPlan: "Develop Nf3 and Be2 without pushing the centre beyond what can be defended." });
const owensB6 = opponent("b7b6", "Black prepares ...Bb7 against e4.", ["The queenside bishop gains a long diagonal.", "Black delays direct occupation of the centre."], "Black wants pressure on e4 and flexible central pawn breaks.", ["development", "prophylaxis"]);
const owensD4 = taught("d2d4", "Occupies the centre before Black challenges it.", ["White builds the e4–d4 pawn duo.", "The c1 bishop gains space."], ["central_control", "space"], { resultingPlan: "Develop Bd3 and Nf3, then castle while maintaining the centre." });
const owensBb7 = opponent("c8b7", "The bishop attacks e4 along the long diagonal.", ["The e4 pawn now needs attention.", "Black develops a queenside piece."], "Black hopes to undermine the centre with ...e6 or ...f5.", ["development", "tempo"]);
const owensBd3 = taught("f1d3", "Develops while adding direct protection to e4.", ["The e4 pawn gains a defender.", "White prepares kingside castling."], ["development", "king_safety"], { resultingPlan: "Continue Nf3 and castle; the central space is the long-term advantage." });

const whiteE4: OpeningCurriculum = {
  id: "repertoire.white-e4-principled",
  slug: "white-e4-principled",
  version: 2,
  status: "published",
  name: "Practical 1.e4 Repertoire",
  learnerColor: "white",
  firstMoveUci: "e2e4",
  summary: "A principled White repertoire built around central space, rapid development and clear middlegame plans.",
  audienceLabel: "Beginner to intermediate",
  style: ["principled", "active", "manageable"],
  memoryBurden: "medium",
  chapters: [
    {
      id: "open-games",
      title: "1...e5: Italian development",
      introduction: "Develop toward the centre, make the king safe, then prepare d4 instead of rushing an attack.",
      lines: [
        { id: "italian-bc5", title: "Black develops the bishop first", priority: 1, moves: [e4, e5, nf3, nc6, bc4, bc5, d3, blackNf6, whiteCastle, blackD6, c3, blackCastle] },
        { id: "italian-nf6", title: "Black develops the knight first", priority: 2, moves: [e4, e5, nf3, nc6, bc4, blackNf6, d3, bc5, whiteCastle, blackD6, c3, blackCastle] },
      ],
    },
    {
      id: "sicilian-alapin",
      title: "Sicilian: build with the Alapin",
      introduction: "Use 2.c3 to prepare d4 and obtain a recognisable central structure without memorising many unrelated systems.",
      lines: [
        { id: "alapin-d5", title: "Black strikes with ...d5", priority: 1, moves: [e4, sicilianC5, alapinC3, sicilianD5, exd5, queenD5, alapinD4, blackNf6, nf3] },
        { id: "alapin-nf6", title: "Black attacks e4 with ...Nf6", priority: 2, moves: [e4, sicilianC5, alapinC3, sicilianNf6, e5Advance, knightD5, alapinD4] },
      ],
    },
    {
      id: "french-advance",
      title: "French: protect the advanced centre",
      introduction: "Take space with e5, recognise that d4 is the base of the pawn chain, and answer Black's ...c5 pressure calmly.",
      lines: [
        { id: "french-main", title: "The standard ...c5 break", priority: 1, moves: [e4, frenchE6, d4, frenchD5, frenchAdvance, frenchC5, frenchC3, frenchNc6, nf3] },
      ],
    },
    {
      id: "caro-advance",
      title: "Caro-Kann: space without overextending",
      introduction: "Use the Advance Variation to gain space, then develop naturally while Black solves the light-squared bishop.",
      lines: [
        { id: "caro-bf5", title: "Black develops the bishop", priority: 1, moves: [e4, caroC6, caroD4, caroD5, caroAdvance, caroBf5, caroNf3] },
      ],
    },
    {
      id: "scandinavian",
      title: "Scandinavian: develop with tempo",
      introduction: "Accept the central exchange and use Nc3 to gain development rather than spending extra moves chasing the queen.",
      lines: [
        { id: "scandi-queen", title: "Early queen recapture", priority: 1, moves: [e4, scandiD5, scandiExd5, scandiQxd5, scandiNc3] },
      ],
    },
    {
      id: "modern-pirc",
      title: "Modern and Pirc: occupy the centre",
      introduction: "Take the offered centre, develop behind it and castle before deciding whether to expand.",
      lines: [
        { id: "modern-classical", title: "Classical development", priority: 1, moves: [e4, modernG6, modernD4, modernBg7, modernNc3, modernD6, modernNf3] },
      ],
    },
    {
      id: "other-defences",
      title: "Alekhine and Owen: keep the centre supported",
      introduction: "Against less common defences, claim useful space but keep development ahead of further pawn moves.",
      lines: [
        { id: "alekhine", title: "Alekhine Defence", priority: 1, moves: [e4, alekhineNf6, alekhineE5, alekhineNd5, alekhineD4] },
        { id: "owen", title: "Owen's Defence", priority: 2, moves: [e4, owensB6, owensD4, owensBb7, owensBd3] },
      ],
    },
  ],
  sources: [
    { id: "thinking-board-authored-v2", kind: "authored", title: "Thinking Board independently authored practical 1.e4 curriculum" },
    { id: "lichess-opening-names", kind: "dataset", title: "Lichess chess opening names", url: "https://github.com/lichess-org/chess-openings", license: "CC0-1.0" },
  ],
};

// Black Modern against 1.e4. The repertoire deliberately keeps ...Nf6 flexible
// and uses the recurring ...d6, ...Bg7, ...Nd7 and ...e5 structure.
const whiteE4Opponent = opponent("e2e4", "White occupies the centre and opens two pieces.", ["White controls d5 and f5.", "The queen and f1 bishop gain lines."], "White wants rapid development and may build a second central pawn on d4.", ["central_control", "development"]);
const g6Black = taught("g7g6", "Prepares a kingside fianchetto and invites White to show the centre first.", ["The f8 bishop gains the g7 square.", "Black keeps the central pawns flexible."], ["development", "prophylaxis"], { resultingPlan: "Play ...Bg7 and ...d6, then attack White's centre with ...e5 or ...c5.", commonMistake: "A flexible centre is not permission to ignore development; complete the kingside setup promptly." });
const whiteD4 = opponent("d2d4", "White builds the full e4–d4 centre.", ["White gains space and controls key central squares."], "White may use the space to develop actively or launch a kingside expansion.", ["central_control", "space"]);
const bg7Black = taught("f8g7", "Develops the bishop onto the long diagonal against b2 and the centre.", ["The bishop pressures d4 through the diagonal.", "Black can castle after developing the knight."], ["development", "piece_activity"], { resultingPlan: "Support the centre challenge with ...d6 and choose ...e5 or ...c5 according to White's setup." });
const whiteNc3 = opponent("b1c3", "White reinforces e4 and develops naturally.", ["White increases control of d5 and e4."], "White is supporting the broad centre and may follow with f4 or Nf3.", ["development", "central_control"]);
const d6Black = taught("d7d6", "Supports an ...e5 break and keeps the centre flexible.", ["The e5 square gains pawn support.", "The c8 bishop remains flexible."], ["pawn_break", "prophylaxis"], { resultingPlan: "Watch White's next development choice before committing to ...e5 or ...c5." });
const whiteNf3 = opponent("g1f3", "White develops and supports the centre without weakening the king.", ["White prepares castling.", "The e5 and d4 squares gain support."], "White is choosing a classical setup and may develop Be3 or Be2 next.", ["development", "king_safety"]);
const c6Black = taught("c7c6", "Prepares ...e5 while controlling d5 and giving the queen a useful route.", ["The d5 square is controlled.", "Black can challenge the centre with ...e5."], ["prophylaxis", "pawn_break"], { resultingPlan: "Develop ...Nd7, then play ...e5 once the centre is adequately supported." });
const whiteA4 = opponent("a2a4", "White slows ...b5 and gains queenside space.", ["The b5 square is controlled.", "White spends a tempo away from development."], "White wants to prevent Black's common queenside expansion.", ["prophylaxis", "space"]);
const nd7Black = taught("b8d7", "Develops behind the c-pawn and supports the central ...e5 break.", ["The e5 square gains another defender.", "The c-pawn remains free to support the centre."], ["development", "pawn_break"], { resultingPlan: "Play ...e5, then develop the kingside knight and castle." });
const whiteBe2 = opponent("f1e2", "White prepares to castle and keeps the position compact.", ["The king can castle.", "The bishop supports the kingside."], "White wants a safe king before starting central or kingside action.", ["development", "king_safety"]);
const e5Black = taught("e7e5", "Challenges White's broad centre and claims dark squares.", ["The d4 pawn is challenged.", "Black gains space on the dark squares."], ["pawn_break", "central_control"], { resultingPlan: "Develop ...Ngf6 and castle; if White closes with d5, seek queenside counterplay." });

const whiteF4 = opponent("f2f4", "White builds the Austrian Attack and supports e5.", ["White gains kingside space.", "The e3–g1 diagonal and king can become more sensitive."], "White plans e5 or a direct kingside expansion before Black completes development.", ["space", "pawn_break"]);
const nd7VsF4 = taught("b8d7", "Develops while adding control to e5 and c5.", ["Black makes an immediate e5 advance harder for White.", "The knight supports ...e5."], ["development", "prophylaxis"], { resultingPlan: "Use ...c6 and ...e5 to challenge the pawn centre before White attacks." });
const whiteNf3Austrian = opponent("g1f3", "White reinforces e5 and prepares development.", ["White can castle quickly.", "The centre has strong support."], "White wants to advance e5 while keeping tactical pressure on the kingside.", ["development", "pawn_break"]);
const c6VsF4 = taught("c7c6", "Builds a firm base for ...e5 and controls d5.", ["The e5 break is prepared.", "Black limits a white knight jump to d5."], ["pawn_break", "prophylaxis"], { resultingPlan: "Strike with ...e5 before White completes a kingside attack." });
const whiteBd3 = opponent("f1d3", "White points the bishop toward h7 and prepares castling.", ["The h7 square comes under attention.", "White completes another developing move."], "White is preparing a direct attack, so Black should challenge the centre now.", ["development", "tempo"]);
const e5VsF4 = taught("e7e5", "Hits the centre before White can organise a kingside attack.", ["The d4 pawn is attacked.", "The f4 pawn may become exposed after exchanges."], ["pawn_break", "tactical_safety"], { resultingPlan: "After exchanges, develop ...Ngf6 and castle; central activity is Black's defence against the flank attack.", tacticalWarning: "Check e5 tactics carefully because White's f-pawn supports a possible fxe5." });

const whiteC3 = opponent("c2c3", "White builds a restrained centre and supports d4.", ["The d4 pawn gains support.", "The b1 knight loses c3."], "White wants a stable centre and easy development rather than immediate confrontation.", ["pawn_structure", "prophylaxis"]);
const nd7Quiet = taught("b8d7", "Develops toward e5 and keeps the c-pawn flexible.", ["Black supports a central break.", "The knight avoids blocking the c-pawn."], ["development", "pawn_break"], { resultingPlan: "Play ...e5 and develop ...Ngf6 without allowing White an uncontested centre." });
const whiteBc4 = opponent("f1c4", "White develops actively toward f7.", ["The f7 pawn is attacked.", "White is ready to castle."], "White may try quick pressure before Black finishes development.", ["development", "tempo"]);
const e6Black = taught("e7e6", "Blunts the bishop's diagonal and prepares central control without tactical risk on f7.", ["The f7 diagonal is reinforced indirectly.", "Black prepares ...Ne7 and ...d5 ideas."], ["prophylaxis", "pawn_structure"], { resultingPlan: "Develop ...Ne7, castle and choose ...d5 or ...e5 according to White's setup." });

const modernBlack: OpeningCurriculum = {
  id: "repertoire.black-modern-e4",
  slug: "black-modern-e4",
  version: 1,
  status: "published",
  name: "Modern Defence with 1...g6",
  learnerColor: "black",
  firstMoveUci: "e2e4",
  summary: "A consistent Black repertoire against 1.e4 built around ...g6, ...Bg7, flexible development and timely central counterplay.",
  audienceLabel: "Beginner to intermediate",
  style: ["modern", "flexible", "counterattacking"],
  memoryBurden: "medium",
  chapters: [
    {
      id: "modern-classical",
      title: "Classical centre: prepare ...e5",
      introduction: "Let White occupy the centre, then challenge it with a prepared ...e5 rather than attacking on the flank too early.",
      lines: [
        { id: "classical-a4", title: "White restrains ...b5", priority: 1, moves: [whiteE4Opponent, g6Black, whiteD4, bg7Black, whiteNc3, d6Black, whiteNf3, c6Black, whiteA4, nd7Black, whiteBe2, e5Black] },
      ],
    },
    {
      id: "modern-austrian",
      title: "Austrian Attack: counter in the centre",
      introduction: "When White advances the f-pawn, respond with development and a central break before the kingside attack becomes organised.",
      lines: [
        { id: "austrian-e5", title: "Challenge the broad pawn centre", priority: 1, moves: [whiteE4Opponent, g6Black, whiteD4, bg7Black, whiteNc3, d6Black, whiteF4, nd7VsF4, whiteNf3Austrian, c6VsF4, whiteBd3, e5VsF4] },
      ],
    },
    {
      id: "modern-quiet",
      title: "Quiet setups: do not remain passive",
      introduction: "Against c3 and calm development, complete the fianchetto and claim central counterplay before White improves every piece.",
      lines: [
        { id: "quiet-c3", title: "White builds with c3", priority: 1, moves: [whiteE4Opponent, g6Black, whiteD4, bg7Black, whiteC3, d6Black, whiteNf3, nd7Quiet, whiteBc4, e6Black] },
      ],
    },
  ],
  sources: [
    { id: "thinking-board-modern-v1", kind: "authored", title: "Thinking Board independently authored Modern Defence starter curriculum" },
    { id: "lichess-opening-names", kind: "dataset", title: "Lichess chess opening names", url: "https://github.com/lichess-org/chess-openings", license: "CC0-1.0" },
  ],
};

export const STARTER_OPENING_CURRICULA: OpeningCurriculum[] = [whiteE4, modernBlack];
