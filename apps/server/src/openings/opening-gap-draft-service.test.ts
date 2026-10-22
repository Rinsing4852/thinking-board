import path from "node:path";
import { Chess } from "chess.js";
import { afterEach,describe,expect,it,vi } from "vitest";
import { Database } from "../db/database.js";
import { OpeningContentService } from "./opening-content-service.js";
import { OpeningPgnImportService } from "./opening-pgn-import.js";
import { OpeningWorkspaceService } from "./opening-workspace-service.js";
import { OpeningGapDraftService } from "./opening-gap-draft-service.js";
const databases:Database[]=[];afterEach(()=>{databases.splice(0).forEach(d=>d.close());vi.restoreAllMocks();});
function setup(pgn="1. e4 e5 *",color:"white"|"black"="white") {
 const database=new Database(":memory:",path.resolve("migrations"));databases.push(database);const db=database.connection;
 const imported=new OpeningPgnImportService(db,new OpeningContentService(db)).import({pgn,learnerColor:color,ownershipConfirmed:true});
 const repertoireId=imported.repertoireIds[0]!,workspace=new OpeningWorkspaceService(db),detail=workspace.repertoire(repertoireId),line=detail.chapters[0]!.lines[0]!;
 const engine={analyze:vi.fn(async(fen:string)=>{const move=new Chess(fen).moves({verbose:true})[0]!;return {fen,depth:16,engineName:"Stockfish fixture",nodes:200000,lines:[{rank:1,moveUci:move.from+move.to+(move.promotion??""),moveSan:move.san,pvSan:[move.san],score:{kind:"centipawns" as const,value:20,perspective:"side_to_move" as const}}]};})};
 const service=new OpeningGapDraftService(db,engine);const target={repertoireId,lineId:line.id,afterPly:line.moves.length,expectedFen:line.moves.at(-1)!.fenAfter};
 return {db,service,target,workspace,engine};
}
describe("bounded generated preparation",()=>{
 it("previews without writes to preparation, applies once and undoes only its new moves for either colour",async()=>{
  for(const color of ["white","black"] as const){
   const {service,target,workspace}=setup(color==="white"?"1. e4 e5 *":"1. e4 e5 2. Nf3 *",color);const before=workspace.repertoire(target.repertoireId);
   const draft=await service.preview(target);expect(draft.state).toBe("preview");expect(workspace.repertoire(target.repertoireId)).toEqual(before);
   const saved=service.apply(draft.id);expect(saved.state).toBe("applied");expect(saved.source).toContain("depth 16");expect(saved.detail!.chapters[0]!.lines[0]!.moves).toHaveLength(target.afterPly+1);
   expect(service.apply(draft.id).detail).toEqual(saved.detail);expect(service.list(target.repertoireId).drafts).toHaveLength(1);
   const undone=service.undo(draft.id);expect(undone.state).toBe("undone");expect(undone.detail).toEqual(before);expect(service.undo(draft.id).state).toBe("undone");
  }
 });
 it("undo keeps an authored opponent reply followed by the generated response",async()=>{
  const {service,target,workspace}=setup(),before=workspace.repertoire(target.repertoireId),line=before.chapters[0]!.lines[0]!;
  const draft=await service.preview({...target,afterPly:1,expectedFen:line.moves[0]!.fenAfter,opponentMoveUci:"e7e5"});
  const applied=service.apply(draft.id);expect(applied.lineId).toBe(target.lineId);expect(applied.detail!.chapters[0]!.lines[0]!.moves).toHaveLength(3);
  expect(service.undo(draft.id).detail).toEqual(before);
 });
 it("creates and removes a gap branch while preserving authored lines and notes",async()=>{
  const {service,target,workspace}=setup("1. e4 {Original idea.} e5 2. Nf3 *"),before=workspace.repertoire(target.repertoireId);
  const line=before.chapters[0]!.lines[0]!;
  const draft=await service.preview({...target,afterPly:1,expectedFen:line.moves[0]!.fenAfter,opponentMoveUci:"c7c5"});
  const result=service.apply(draft.id);expect(result.lineId).not.toBe(target.lineId);expect(result.detail!.chapters[0]!.lines).toHaveLength(2);
  expect(service.undo(draft.id).detail).toEqual(before);
 });
 it("rejects existing replies, weak evidence, changed previews and later edits without losing preparation",async()=>{
  const {service,target,workspace,engine}=setup();
  await expect(service.preview({...target,afterPly:0,expectedFen:new Chess().fen()})).rejects.toThrow(/already have/);
  const original=engine.analyze.getMockImplementation()!;engine.analyze.mockImplementationOnce(async fen=>({...await original(fen),depth:2}));
  await expect(service.preview(target)).rejects.toThrow(/Reliable engine/);
  const draft=await service.preview(target);workspace.renameRepertoire(target.repertoireId,"Changed title");const changed=workspace.repertoire(target.repertoireId);
  expect(()=>service.apply(draft.id)).toThrow(/out of date/);expect(workspace.repertoire(target.repertoireId)).toEqual(changed);
  const next=await service.preview(target),saved=service.apply(next.id);workspace.updateLineMetadata(target.repertoireId,saved.lineId!,{title:"My edited line"});
  const edited=workspace.repertoire(target.repertoireId);expect(()=>service.undo(next.id)).toThrow(/protect your edits/);expect(workspace.repertoire(target.repertoireId)).toEqual(edited);
 });
 it("protects another player's notes before undoing shared generated content",async()=>{
  const {service,target,db,workspace}=setup(),draft=await service.preview(target),applied=service.apply(draft.id);
  const move=applied.detail!.chapters[0]!.lines[0]!.moves.at(-1)!;
  db.prepare("INSERT INTO player_profiles(id,display_name,created_at) VALUES('other','Other','2026-01-01')").run();
  db.prepare("INSERT INTO opening_learning_comments(profile_id,move_id,comment,created_at,updated_at) VALUES('other',?,'Another player’s idea','2026-10-22','2026-10-22')").run(move.id);
  const before=workspace.repertoire(target.repertoireId);
  expect(()=>service.undo(draft.id)).toThrow(/protect your edits/);expect(workspace.repertoire(target.repertoireId)).toEqual(before);
  expect(db.prepare("SELECT comment FROM opening_learning_comments WHERE profile_id='other'").get()).toEqual({comment:'Another player’s idea'});
 });
 it("rejects a stale profile and keeps preparation intact when an atomic write fails",async()=>{
  const {service,target,db,workspace}=setup();const draft=await service.preview(target),before=workspace.repertoire(target.repertoireId);
  db.exec("CREATE TRIGGER fail_generated BEFORE INSERT ON opening_line_moves BEGIN SELECT RAISE(ABORT,'write failed'); END;");
  expect(()=>service.apply(draft.id)).toThrow(/write failed/);expect(workspace.repertoire(target.repertoireId)).toEqual(before);db.exec("DROP TRIGGER fail_generated");
  db.prepare("INSERT INTO player_profiles(id,display_name,created_at) VALUES('other','Other','2026-01-01')").run();
  const {setActiveProfile}=await import("../training/profile.js");setActiveProfile(db,"other");expect(()=>service.apply(draft.id)).toThrow(/this player/);
 });
});
