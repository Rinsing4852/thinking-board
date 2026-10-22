import { Chess } from "chess.js";
import type { OpeningGeneratedDraft } from "../../../../packages/contracts/src/api.js";
import type { SqliteDatabase } from "../db/database.js";
import type { OpeningAnalysisService } from "./opening-analysis-service.js";
import { OpeningWorkspaceService } from "./opening-workspace-service.js";
import { openingPositionKey } from "./opening-content.js";
import { ensureActiveProfile } from "../training/profile.js";
import { id,now } from "../lib/ids.js";

type Target={repertoireId:string;lineId:string;afterPly:number;expectedFen:string;opponentMoveUci?:string};
type Row={id:string;profile_id:string;repertoire_id:string;line_id:string;after_ply:number;moves_json:string;before_json:string;evidence_json:string;after_json:string|null;result_line_id:string|null;state:"preview"|"applied"|"undone";created_at:string};
export class OpeningGapDraftService {
  private workspace:OpeningWorkspaceService;
  constructor(private db:SqliteDatabase,private engine:Pick<OpeningAnalysisService,"analyze">) {this.workspace=new OpeningWorkspaceService(db);}
  private snapshot(repertoireId:string) {
    // Content is shared by player profiles. A second player's notes or recall
    // must also prevent undo from deleting a move they have begun using.
    const comments=this.db.prepare(`SELECT note.* FROM opening_learning_comments note JOIN opening_moves move ON move.id=note.move_id
      WHERE move.repertoire_id=? ORDER BY note.profile_id,note.move_id`).all(repertoireId);
    const cards=this.db.prepare(`SELECT card.* FROM opening_move_review_cards card JOIN opening_moves move ON move.id=card.move_id
      WHERE move.repertoire_id=? ORDER BY card.profile_id,card.move_id`).all(repertoireId);
    const reviews=this.db.prepare("SELECT * FROM opening_review_items WHERE repertoire_id=? ORDER BY id").all(repertoireId);
    return JSON.stringify({detail:this.workspace.repertoire(repertoireId),comments,cards,reviews});
  }
  private row(draftId:string) {
    const row=this.db.prepare("SELECT * FROM opening_generated_drafts WHERE id=? AND profile_id=?").get(draftId,ensureActiveProfile(this.db)) as Row|undefined;
    if(!row)throw new Error("Draft is not available for this player.");return row;
  }
  private response(row:Row,message:string):OpeningGeneratedDraft {return {id:row.id,state:row.state,moves:JSON.parse(row.moves_json),source:`${JSON.parse(row.evidence_json).engine} · depth ${JSON.parse(row.evidence_json).depth} · one missing response`,message};}
  list(repertoireId:string) {
    return {drafts:(this.db.prepare("SELECT * FROM opening_generated_drafts WHERE repertoire_id=? AND profile_id=? AND state='applied' ORDER BY created_at DESC LIMIT 10").all(repertoireId,ensureActiveProfile(this.db)) as Row[]).map(row=>this.response(row,"Saved generated response. Undo is available while its content is unchanged."))};
  }
  async preview(target:Target):Promise<OpeningGeneratedDraft> {
    const profile=ensureActiveProfile(this.db),before=this.snapshot(target.repertoireId),detail=JSON.parse(before).detail as ReturnType<OpeningWorkspaceService["repertoire"]>;
    if(!detail.repertoire.editable)throw new Error("Import a private copy before generating preparation.");
    const line=detail.chapters.flatMap(c=>c.lines).find(l=>l.id===target.lineId);
    if(!line||line.archived||!Number.isInteger(target.afterPly)||target.afterPly<0||target.afterPly>line.moves.length)throw new Error("Choose a saved position.");
    const fen=target.afterPly===0?line.moves[0]?.fenBefore:line.moves[target.afterPly-1]?.fenAfter;
    if(!fen||new Chess(fen).fen()!==new Chess(target.expectedFen).fen())throw new Error("Position changed. Reopen the gap.");
    const board=new Chess(fen),moves:Array<{uci:string;san:string}>=[];
    const own=detail.repertoire.learnerColor==="white"?"w":"b";
    if(board.turn()!==own) {
      if(!target.opponentMoveUci)throw new Error("Choose an opponent reply before requesting a response.");
      const move=board.move(target.opponentMoveUci);moves.push({uci:target.opponentMoveUci,san:move.san});
    } else if(target.opponentMoveUci)throw new Error("This position already asks for your response.");
    const key=openingPositionKey(board.fen());
    if(detail.chapters.some(c=>c.lines.some(l=>l.moves.some(m=>openingPositionKey(m.fenBefore)===key&&m.role==="learner"))))throw new Error("You already have a saved response here. Existing choices will not be replaced.");
    if(board.isGameOver())throw new Error("This position has no playable continuation.");
    const analysis=await this.engine.analyze(board.fen());
    const best=analysis.lines.find(l=>l.rank===1);
    if(analysis.fen!==board.fen()||!best||(best.depth??analysis.depth)<10||!Number.isFinite(best.score.value))throw new Error("Reliable engine evidence is unavailable. No draft was saved.");
    const reply=board.move(best.moveUci);moves.push({uci:best.moveUci,san:reply.san});
    if(ensureActiveProfile(this.db)!==profile||this.snapshot(target.repertoireId)!==before)throw new Error("Preparation changed while checking. Request a new preview.");
    const draftId=id();this.db.prepare("INSERT INTO opening_generated_drafts(id,profile_id,repertoire_id,line_id,after_ply,moves_json,before_json,evidence_json,state,created_at) VALUES(?,?,?,?,?,?,?,?,'preview',?)").run(draftId,profile,target.repertoireId,target.lineId,target.afterPly,JSON.stringify(moves),before,JSON.stringify({engine:analysis.engineName??"Local Stockfish",depth:best.depth??analysis.depth,nodes:analysis.nodes,score:best.score,fen:analysis.fen}),now());
    return this.response(this.row(draftId),`Preview only: ${moves.map(m=>m.san).join(" ")} · engine depth ${best.depth??analysis.depth}. Nothing has been added yet.`);
  }
  apply(draftId:string):OpeningGeneratedDraft {
    return this.db.transaction(()=>{
      const row=this.row(draftId);
      if(row.state==="undone")throw new Error("This draft was undone. Request a new preview.");
      if(row.state==="applied")return {...this.response(row,"This batch was already saved."),detail:this.workspace.repertoire(row.repertoire_id),lineId:row.result_line_id!};
      if(Date.now()-Date.parse(row.created_at)>30*60_000||this.snapshot(row.repertoire_id)!==row.before_json)throw new Error("Preview is out of date. Request a new one; your preparation is unchanged.");
      const result=this.workspace.addSequence(row.repertoire_id,row.line_id,row.after_ply,(JSON.parse(row.moves_json) as Array<{uci:string}>).map(m=>m.uci),`gap-${row.id}`);
      this.db.prepare("UPDATE opening_generated_drafts SET state='applied',after_json=?,result_line_id=? WHERE id=?").run(this.snapshot(row.repertoire_id),result.lineId,row.id);
      return {...this.response(this.row(row.id),"One response saved. Your existing choices and notes are kept."),detail:result.detail,lineId:result.lineId};
    })();
  }
  undo(draftId:string):OpeningGeneratedDraft {
    return this.db.transaction(()=>{
      const row=this.row(draftId);
      if(row.state==="undone")return {...this.response(row,"This batch was already undone."),detail:this.workspace.repertoire(row.repertoire_id),lineId:row.line_id};
      if(row.state!=="applied"||this.snapshot(row.repertoire_id)!==row.after_json)throw new Error("Preparation has changed since this batch was saved. Automatic undo is blocked to protect your edits. Review the line manually.");
      if(row.result_line_id!==row.line_id)this.workspace.deleteLine(row.repertoire_id,row.result_line_id!);
      else {
        const line=this.workspace.repertoire(row.repertoire_id).chapters.flatMap(c=>c.lines).find(l=>l.id===row.line_id)!;
        const original=JSON.parse(row.before_json).detail as ReturnType<OpeningWorkspaceService["repertoire"]>;
        const originalLine=original.chapters.flatMap(c=>c.lines).find(l=>l.id===row.line_id)!;
        // A preview can follow an already saved opponent reply. Remove only
        // appended membership, never that authored part of the route.
        for(const move of line.moves.slice(originalLine.moves.length).reverse())this.workspace.undoLastMove(row.repertoire_id,row.line_id,move.id);
      }
      this.db.prepare("UPDATE opening_generated_drafts SET state='undone' WHERE id=?").run(row.id);
      return {...this.response(this.row(row.id),"Generated response removed. Authored preparation is kept."),detail:this.workspace.repertoire(row.repertoire_id),lineId:row.line_id};
    })();
  }
}
