import { Chess } from "chess.js";
import { useEffect, useRef, useState } from "react";
import type { OpeningStudyDiscoveryResponse, OpeningStudyGame, OpeningStudyResponse, OpeningStudyQuizAction, OpeningMoveQuality } from "../../../../packages/contracts/src/api";
import { get, post, remove } from "../api";
import { ChessBoard } from "./ChessBoard";

type LibraryGame=Pick<OpeningStudyGame,"id"|"white"|"black"|"source">;
export function OpeningModelGameStudy({repertoireId,lineId,savedPly,onBack}:{repertoireId:string;lineId:string;savedPly:number;onBack:()=>void}) {
  const [quality,setQuality]=useState<OpeningMoveQuality|null>(null);
  const [data,setData]=useState<OpeningStudyResponse|null>(null);
  const [library,setLibrary]=useState<LibraryGame[]>([]);
  const [busy,setBusy]=useState(false),[error,setError]=useState(""),[notice,setNotice]=useState("");
  const [pgn,setPgn]=useState(""),[source,setSource]=useState("");
  const [removeId,setRemoveId]=useState("");
  const [needsReload,setNeedsReload]=useState(false);
  const [rating,setRating]=useState("");
  const [gameSource,setGameSource]=useState<"online"|"masters"|"both">("online");
  const [found,setFound]=useState<OpeningStudyDiscoveryResponse|null>(null);
  const [searchError,setSearchError]=useState("");
  const [searching,setSearching]=useState(false);
  const autoSearched=useRef(false),ratingLoaded=useRef(false);

  const request=useRef<AbortController|null>(null),lock=useRef(false);
  const boardRef=useRef<HTMLDivElement|null>(null);
  const choicesRef=useRef<HTMLDivElement|null>(null);
  const showChoices=()=>requestAnimationFrame(()=>{
    choicesRef.current?.focus({preventScroll:true});choicesRef.current?.scrollIntoView({block:"start"});
  });
  const endpoint=`/api/v1/openings/repertoires/${encodeURIComponent(repertoireId)}/lines/${encodeURIComponent(lineId)}/study`;
  const run=async(action:(signal:AbortSignal)=>Promise<void>,saveAttempt=false)=>{
    if(lock.current) return;
    lock.current=true;setBusy(true);setError("");
    const controller=new AbortController();request.current=controller;
    try {await action(controller.signal);} catch(problem) {
      if(!controller.signal.aborted) {
        setError(problem instanceof Error?problem.message:"Study could not be loaded. Try again.");
        if(saveAttempt) setNeedsReload(true);
      }
    } finally {lock.current=false;if(!controller.signal.aborted) setBusy(false);}
  };
  const load=async(signal:AbortSignal)=>{
    const [state,books]=await Promise.all([get<OpeningStudyResponse>(`${endpoint}?ply=${savedPly}`,signal),get<{games:LibraryGame[]}>("/api/v1/openings/study-games",signal)]);
    if(!signal.aborted) {
      setData(state);setLibrary(books.games);setNeedsReload(false);
      if(!ratingLoaded.current) {setRating(state.searchRating===null?"":String(state.searchRating));ratingLoaded.current=true;}
    }
  };
  useEffect(()=>{
    void run(load);
    return ()=>request.current?.abort();
  },[endpoint,savedPly]);
  const choose=(gameId:string,currentPly?:number,focusBoard=false)=>{
    if(!data||needsReload) return;
    void run(async signal=>{
    const state=await post<OpeningStudyResponse>(endpoint,{savedPly,gameId,expectedFen:data.fen,...(currentPly===undefined?{}:{currentPly})},signal);
    if(!signal.aborted) {
      setData(state);setNotice("");
      if(focusBoard) requestAnimationFrame(()=>{
        boardRef.current?.focus({preventScroll:true});boardRef.current?.scrollIntoView({block:"start"});
      });
    }
  },true);
  };
  const findGames=()=>{
    if(!data||needsReload) return;
    setFound(null);setSearchError("");
    void run(async signal=>{
      setSearching(true);
      try {
        const result=await post<OpeningStudyDiscoveryResponse>(`${endpoint}/discover`,{savedPly,expectedFen:data.fen,rating:Number(rating),source:gameSource},signal);
        if(!signal.aborted) {setFound(result);showChoices();}
      } catch(problem) {
        if(!signal.aborted)setSearchError(problem instanceof Error?problem.message:"Game search failed. Try again.");
      } finally {if(!signal.aborted)setSearching(false);}
    });
  };
  useEffect(()=>{
    if(data&&!busy&&!autoSearched.current&&ratingLoaded.current) {
      autoSearched.current=true;
      if(data.searchRating!==null&&!data.replay) findGames();
    }
  },[data,busy]);
  const startExample=(exampleId:string)=>{
    if(!data||needsReload)return;
    void run(async signal=>{
      const state=await post<OpeningStudyResponse>(`${endpoint}/discover/start`,{savedPly,expectedFen:data.fen,exampleId},signal);
      if(signal.aborted)return;
      setData(state);setFound(null);setNotice("Example saved for replay. Your opening recall and coverage are unchanged.");
      await load(signal);
      if(!signal.aborted)requestAnimationFrame(()=>{boardRef.current?.focus({preventScroll:true});boardRef.current?.scrollIntoView({block:"start"});});
    },true);
  };
  const guess=(action:OpeningStudyQuizAction["action"],moveUci?:string)=>{
    if(!data||needsReload)return;
    const selected=data.quiz??data.replay;
    if(!selected)return;
    void run(async signal=>{
      const state=await post<OpeningStudyResponse>(`${endpoint}/guess`,{
        savedPly,gameId:selected.game.id,expectedFen:data.fen,version:selected.version,action,...(moveUci?{moveUci}:{}),
      },signal);
      if(!signal.aborted){setData(state);setNotice("");}
    },true);
  };
  const quiz=data?.quiz;
  useEffect(()=>{setQuality(null);},[quiz?.version]);
  const checkQuality=()=>{
    if(!quiz?.feedback)return;
    void run(async signal=>{const result=await post<OpeningMoveQuality>(`${endpoint}/quality`,{savedPly,version:quiz.version},signal);if(!signal.aborted)setQuality(result);});
  };
  const replay=data?.replay;
  const current=replay&&replay.currentPly>0?replay.moves[replay.currentPly-1]:null;
  const fen=replay?(current?.fenAfter??replay.initialFen):data?.fen;
  return <section className={`opening-model-study${quiz?" opening-study-guessing":""}${replay||quiz?" opening-study-replaying":""}`} aria-label="Model-game study">
    <div className="panel opening-workspace-heading">
      <div><span className="eyebrow">Understand the continuation</span><h2>Study a game from here</h2>
        <p>Find a stronger player’s game that follows your moves or reaches the same position, then replay the continuation or guess their moves on your side.</p></div>
      <button className="secondary" disabled={busy} onClick={()=>{
        if(!pgn.trim()||window.confirm("Leave the pasted study PGN without importing it?")) onBack();
      }}>Back to saved position</button>
    </div>
    {error&&<div className="panel" role="alert"><p>{error}</p>{needsReload&&<p>The save could not be confirmed. Reload study to recover the saved position before making another move.</p>}<button disabled={busy} onClick={()=>void run(load)}>Reload study</button></div>}
    {notice&&<p role="status">{notice}</p>}
    {!data&&busy&&<p role="status">Finding matching games…</p>}
    {data&&<>
      <div className="opening-study-layout">
        <div className="panel opening-study-board" ref={boardRef} tabIndex={-1} role="region" aria-label="Study board and replay">
          <h3>{quiz?`${quiz.game.white} – ${quiz.game.black}`:replay?`${replay.game.white} – ${replay.game.black}`:"Your saved position"}</h3>
          {quiz&&<section aria-label="Guess the player's move">
            <span className="eyebrow">GUESS THE MOVE · {data.learnerColor.toUpperCase()}</span>
            <h4>{quiz.complete?"Study complete":quiz.feedback?"Compare with the game":"What did the player play here?"}</h4>
            <ChessBoard fen={quiz.feedback?applyStudyMove(quiz.fen,quiz.feedback.historicalUci):quiz.fen}
              orientation={data.learnerColor} interactive={!quiz.complete&&!quiz.feedback&&!busy&&!needsReload}
              onMove={uci=>guess("answer",uci)} lastMove={quiz.feedback?.historicalUci??null} ariaLabel="Guess-the-move board" />
            <p>Position after replay step {quiz.currentPly} of {quiz.totalPlies}. Opponent moves play automatically between questions.</p>
            {quiz.hint&&!quiz.feedback&&<p role="status">{quiz.hint}</p>}
            {quiz.feedback&&<div role="status" className="opening-study-note">
              <strong>{quiz.feedback.revealed?"Played move shown":quiz.feedback.matches?"You matched the played move":"A different legal move"}</strong>
              <p>{quiz.feedback.playedSan?`You chose ${quiz.feedback.playedSan}. `:""}The player played {quiz.feedback.historicalSan}.</p>
              <p>{quality?"The played move is a historical example. The separate engine assessment below does not change your study result.":"The played move is a historical example. A different legal move may also be good; it has not been engine-graded here."}</p>
              {quiz.feedback.playedSan&&!quiz.feedback.revealed&&<button className="secondary" disabled={busy||needsReload} onClick={checkQuality}>Check my move with Stockfish</button>}
              {quality&&<p><strong>{quality.verdict==="playable"?"Chess quality: playable":quality.verdict==="weaker"?"Chess quality: weaker move":"Chess quality: unverified"}</strong> · {quality.message} {quality.depth?`Engine depth ${quality.depth}.`:""}</p>}
              {quiz.feedback.comment&&<><strong>Supplied game annotation</strong><p>{quiz.feedback.comment}</p></>}
            </div>}
            <p role="status">{quiz.progress.attempted} first attempts · {quiz.progress.matchedUnaided} matched without help · {quiz.progress.helped} helped. Retries do not add first-attempt credit.</p>
            <div className="answer-actions">
              {!quiz.complete&&!quiz.feedback&&<>
                <button className="secondary" disabled={busy||needsReload||!!quiz.hint} onClick={()=>guess("hint")}>Hint: show the piece</button>
                <button className="secondary" disabled={busy||needsReload} onClick={()=>guess("reveal")}>Show played move</button>
              </>}
              {quiz.feedback&&<>
                <button disabled={busy||needsReload} onClick={()=>guess("continue")}>Continue guessing</button>
                <button className="secondary" disabled={busy||needsReload} onClick={()=>guess("retry")}>Try this position again</button>
              </>}
              <button className="secondary" disabled={busy||needsReload} onClick={()=>guess("exit")}>Return to replay</button>
              {quiz.complete&&<button disabled={busy||needsReload} onClick={()=>guess("restart")}>Study this game again</button>}
            </div>
            <p className="opening-coverage-note">Study and hints are saved. Your repertoire recall, due dates and daily practice credit are unchanged.</p>
          </section>}
          {fen&&!quiz&&<ChessBoard fen={fen} orientation={data.learnerColor} interactive={false} lastMove={current?.uci??null} ariaLabel="Model-game board" />}
          {replay&&<>
            <p role="status">{replay.currentPly===replay.game.matchPly?"Matching position from your repertoire":replay.currentPly<replay.game.matchPly?"Before your matching position":"Game continuation beyond your selected position"} · Replay step {replay.currentPly} of {replay.moves.length}</p>
            <div className="answer-actions" role="group" aria-label="Study replay controls">
              <button className="secondary" disabled={busy||needsReload||replay.currentPly===0} onClick={()=>choose(replay.game.id,replay.currentPly-1)}>Previous move</button>
              <button className="secondary" disabled={busy||needsReload||replay.currentPly===replay.game.matchPly} onClick={()=>choose(replay.game.id,replay.game.matchPly)}>Jump to match</button>
              <button disabled={busy||needsReload||replay.currentPly===replay.moves.length} onClick={()=>choose(replay.game.id,replay.currentPly+1)}>Next move</button>
            </div>
            <p>{current?`Last played: ${current.moveNumber}${current.moverColor==="white"?".":"..."}${current.san}`:"Initial game position"}</p>
            {current?.comment?<div className="opening-study-note"><strong>Imported annotation · {replay.game.source}</strong><p>{current.comment}</p></div>
              :<p className="opening-coverage-note">No annotation was supplied for this position. Replay shows the played moves.</p>}
            {replay.currentPly===replay.moves.length&&<p role="status">End of game · {replay.game.result}. You can step back or choose another example.</p>}
            <button disabled={busy||needsReload||replay.currentPly===replay.moves.length} onClick={()=>guess("start")}>Guess the player’s moves</button>
            <p className="opening-coverage-note">Replay is saved as you move. The played move is an example, not a claim that it is the strongest move.</p>
          </>}
        </div>
        {!quiz&&<div className="panel opening-study-choices" ref={choicesRef} tabIndex={-1} role="region" aria-label="Matching study games">
          <h3>Find a stronger player’s game</h3>
          <p>Search the selected databases for this saved position. Online examples require a higher-rated player on your {data.learnerColor} side. Master examples come from the over-the-board database; its ratings are not compared with your Lichess rating.</p>
          <label>Game source<select aria-label="Game source" value={gameSource} disabled={busy||needsReload} onChange={e=>{setGameSource(e.target.value as "online"|"masters"|"both");setFound(null);setSearchError("");}}><option value="online">Stronger Lichess players</option><option value="masters">Over-the-board masters</option><option value="both">Both sources</option></select></label>
          <label className="opening-study-rating">Your Lichess rating<input type="number" min={100} max={4000} step={1} inputMode="numeric" value={rating} disabled={busy||needsReload} onChange={event=>{setRating(event.target.value);setFound(null);setSearchError("");}} /></label>
          <p className="opening-coverage-note">Use your Lichess rapid or classical rating. Ratings from other sites are not directly comparable.</p>
          <button disabled={busy||needsReload||!Number.isInteger(Number(rating))||Number(rating)<100||Number(rating)>4000} onClick={findGames}>{busy?"Working…":"Find games"}</button>
          {searching&&<p role="status">Finding stronger-player games and checking their continuations…</p>}
          {searchError&&<div role="alert"><p>{searchError}</p><p>Use Find games to retry. Saved examples below remain available.</p></div>}
          {found&&<div aria-label="Stronger-player search results" role="region">
            <p role="status">{found.message}</p>
            {found.games.map(game=><article className="opening-study-discovered" key={game.id}>
              <strong>{game.white} – {game.black}</strong>
              <p>White {game.whiteRating??"unknown"} · Black {game.blackRating??"unknown"} · {game.result}</p>
              <p>{game.source==="masters"?`Master-database example · player rating ${game.learnerRating}. Over-the-board ratings are not compared with your Lichess rating.`:`${found.learnerColor==="white"?game.white:game.black} played your side at ${game.learnerRating} · ${game.learnerRating-found.rating} above your ${found.rating} rating.`}</p>
              <p>{game.reason}</p><p>{game.date??"Date unknown"} · <a href={game.sourceUrl} target="_blank" rel="noreferrer">{game.source==="masters"?"View master-game PGN":"View original on Lichess"}</a></p>
              <button disabled={busy||needsReload||!!quiz} onClick={()=>startExample(game.id)}>Replay from this position</button>
            </article>)}
            <p className="opening-coverage-note">Up to three verified examples from the selected sources, preferring your move order. Online examples use a higher learner-side Lichess rating; master examples use the master database. A higher rating does not make every played move the best move.</p>
          </div>}
          <h3>Saved examples</h3>
          <p>{data.totalMatches} matching {data.totalMatches===1?"game":"games"} in your {data.libraryGames}-game study library. Up to three are shown.</p>
          {!data.matches.length&&<p>{data.libraryGames?"No saved game reaches this position with a continuation. Find games above or choose an earlier saved position.":"Your study library is empty. Find games above to save an example, or import your own below."}</p>}
          {data.matches.map(game=><article className="opening-study-candidate" key={game.id}>
            <strong>{game.white} – {game.black}</strong>
            <p>{game.result} · {game.date??"Date unknown"} · {game.event??"Event unknown"}</p>
            <p>Ratings: White {game.whiteRating??"unknown"} · Black {game.blackRating??"unknown"}</p>
            <p>Source: {/^https:\/\/lichess\.org\/[A-Za-z0-9]{8}$/.test(game.source)?<a href={game.source} target="_blank" rel="noreferrer">Original game on Lichess</a>:game.source}</p><p>{game.reason}</p>
            <small>{game.continuationMoves} further moves · {game.annotationCount} supplied {game.annotationCount===1?"note":"notes"} in the next 20 moves.</small>
            <button className="secondary" disabled={busy||needsReload||!!quiz} onClick={()=>choose(game.id,game.id===replay?.game.id?replay.currentPly:undefined,true)}>
              {game.id===replay?.game.id?"Resume this game":"Study this game"}</button>
          </article>)}
          {data.matches.length>0&&<details><summary>Why these games?</summary><p>Each replay step is one move by either player. Exact board positions are matched, including side to move, castling and legal en-passant rights. Games with your move order come first, then supplied annotations and available continuation. An opening name or a win alone does not determine selection.</p></details>}
        </div>}
      </div>
      {!quiz&&<details className="panel opening-study-import" >
        <summary>Import study games</summary>
        <p>Paste the PGN text exported from a complete game, including its result. These go into your separate study library and do not count as games you played. Add games you have permission to use; label the source so you can recognise it later.</p>
        <label>Study-game source<input value={source} placeholder="Collection, website or your own notes" maxLength={200} disabled={busy} onChange={event=>setSource(event.target.value)}/></label>
        <label>Complete game PGN<textarea rows={6} value={pgn} disabled={busy} onChange={event=>setPgn(event.target.value)}/></label>
        <button disabled={busy||needsReload||!pgn.trim()||!source.trim()} onClick={()=>void run(async signal=>{
          const result=await post<{message:string}>("/api/v1/openings/study-games/import",{pgn,source},signal);
          if(!signal.aborted) {setPgn("");setNotice(result.message);}
          await load(signal);
          if(!signal.aborted) showChoices();
        })}>{busy?"Working…":"Import study PGN"}</button>
      </details>}
      {!quiz&&library.length>0&&<details className="panel opening-study-import"><summary>Manage study library · {library.length} games</summary>
        <label>Study game to remove<select value={removeId} disabled={busy} onChange={event=>setRemoveId(event.target.value)}><option value="">Choose a game</option>
          {library.map(game=><option key={game.id} value={game.id}>{game.white} – {game.black} · {game.source}</option>)}</select></label>
        <button className="secondary" disabled={busy||needsReload||!removeId} onClick={()=>{
          if(!window.confirm("Remove this study game and its replay progress? Your repertoire and opening recall are kept.")) return;
          void run(async signal=>{await remove(`/api/v1/openings/study-games/${encodeURIComponent(removeId)}`);if(!signal.aborted){setRemoveId("");await load(signal);showChoices();}});
        }}>Remove study game</button>
      </details>}
    </>}
  </section>;
}

function applyStudyMove(fen:string,uci:string):string {
  const board=new Chess(fen);
  board.move({from:uci.slice(0,2),to:uci.slice(2,4),...(uci.length===5?{promotion:uci.slice(4)}:{})});
  return board.fen();
}
