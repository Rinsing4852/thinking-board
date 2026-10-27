import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Database } from "../db/database.js";
import { ImportService } from "../imports/import-service.js";
import { loadConfig } from "../config.js";
import { UciEngine, type EngineLine } from "../analysis/uci-engine.js";
import { AttemptLifecycle } from "./attempt-lifecycle.js";
import { V1TrainingService } from "./v1-training-service.js";
import { Chess } from "chess.js";
import { setActiveProfile } from "./profile.js";

const resources: Array<{database:Database;service:V1TrainingService}> = [];
afterEach(async()=>{vi.restoreAllMocks();vi.useRealTimers();for(const {database,service} of resources.splice(0)){await service.close();database.close();}});
function fixture(){
  const database=new Database(':memory:',path.resolve('migrations')),db=database.connection;
  new ImportService(db).import('[White "Quiet learner"]\n[Black "Opponent"]\n\n1. e4 e5 2. Nf3 *','Quiet learner');
  const game=db.prepare('SELECT id,profile_id,initial_fen FROM games').get() as {id:string;profile_id:string;initial_fen:string};
  const move=db.prepare("SELECT id,from_position_id FROM moves WHERE san='Nf3'").get() as {id:string;from_position_id:string};
  db.prepare("INSERT INTO training_items(id,profile_id,game_id,source_move_id,mode,prompt_version,created_at) VALUES ('quiet',?,?,?,'quiet_position',2,'2026-10-27')").run(game.profile_id,game.id,move.id);
  db.prepare(`INSERT INTO quiet_position_items(item_id,position_id,weakest_squares_json,acceptable_moves_json,explanation,evidence_json)
    VALUES ('quiet',?,'["g1"]','[{"moveUci":"g1f3","moveSan":"Nf3","centipawnLoss":0}]','Develop a piece.','{}')`).run(move.from_position_id);
  db.prepare("INSERT INTO review_states(item_id,due_at) VALUES ('quiet','2020-01-01')").run();
  const service=new V1TrainingService(db,loadConfig());resources.push({database,service});
  const attempt=new AttemptLifecycle(db).start('quiet').attemptId;
  const fen=db.prepare('SELECT fen FROM positions WHERE id=?').pluck().get(move.from_position_id) as string;
  function line(uci:string,cp:number):EngineLine{
    const san=new Chess(fen).move({from:uci.slice(0,2),to:uci.slice(2,4)}).san;
    return {moveUci:uci,moveSan:san,centipawnsWhite:cp,mateInWhite:null,rank:1,depth:14,pvUci:[uci],pvSan:[san]};
  }
  return {db,service,attempt,fen,line};
}
describe('on-request quiet alternatives',()=>{
  it('gives a checked alternative from another piece full credit and saves engine evidence once',async()=>{
    const f=fixture(),spy=vi.spyOn(UciEngine.prototype,'analyze').mockResolvedValueOnce({depth:14,lines:[f.line('g1f3',30)]}).mockResolvedValueOnce({depth:14,lines:[f.line('f1c4',20)]});
    expect(await f.service.answerQuietChecked(f.attempt,'f1','f1c4')).toMatchObject({outcome:'excellent',pieceCorrect:true,moveCorrect:true,moveVerified:true,engineCheck:{status:'useful',lossCp:10}});
    for(const call of spy.mock.calls){const history=call[6]!;expect(history.moves).toEqual(['e2e4','e7e5']);const board=new Chess(history.initialFen);history.moves.forEach(uci=>board.move({from:uci.slice(0,2),to:uci.slice(2)}));expect(board.fen()).toBe(f.fen);}
    const saved=JSON.parse(f.db.prepare("SELECT feedback_json FROM training_attempts WHERE id=?").pluck().get(f.attempt) as string);
    expect(saved.engineCheck.status).toBe('useful');
    await expect(f.service.answerQuietChecked(f.attempt,'f1','f1c4')).rejects.toThrow('already been answered');
    expect(f.db.prepare("SELECT attempts,successes FROM review_states WHERE item_id='quiet'").get()).toMatchObject({attempts:1,successes:1});
  });
  it('does not launch an engine for saved examples and rejects a different selected piece before searching',async()=>{
    const f=fixture(),spy=vi.spyOn(UciEngine.prototype,'analyze');
    await expect(f.service.answerQuietChecked(f.attempt,'g1','f1c4')).rejects.toThrow('piece you selected');
    expect((await f.service.answerQuietChecked(f.attempt,'g1','g1f3')).outcome).toBe('excellent');expect(spy).not.toHaveBeenCalled();
  });
  it('leaves failed checks ungraded and open for a successful retry',async()=>{
    const f=fixture();vi.spyOn(UciEngine.prototype,'analyze').mockRejectedValue(new Error('engine unavailable'));
    expect(await f.service.answerQuietChecked(f.attempt,'f1','f1c4')).toMatchObject({moveVerified:false,engineCheck:{status:'unavailable'},explanation:expect.stringContaining('remains unverified')});
    expect(f.db.prepare("SELECT attempts,successes FROM review_states WHERE item_id='quiet'").get()).toMatchObject({attempts:0,successes:0});
    expect(f.db.prepare('SELECT answered_at FROM training_attempts').pluck().get()).toBeNull();
    vi.mocked(UciEngine.prototype.analyze).mockResolvedValueOnce({depth:14,lines:[f.line('f1c4',0)]});
    expect(await f.service.answerQuietChecked(f.attempt,'f1','f1c4')).toMatchObject({outcome:'excellent'});
    expect(f.db.prepare("SELECT attempts,successes FROM review_states WHERE item_id='quiet'").get()).toMatchObject({attempts:1,successes:1});
  });
  it('ends a stalled engine check without inventing a move grade',async()=>{
    vi.useFakeTimers();const f=fixture();
    vi.spyOn(UciEngine.prototype,'analyze').mockImplementation(()=>new Promise(()=>{}));
    const result=f.service.answerQuietChecked(f.attempt,'f1','f1c4');
    await vi.advanceTimersByTimeAsync(20_000);
    expect(await result).toMatchObject({moveVerified:false,engineCheck:{status:'unavailable'}});
  });
  it.each(['deactivated','player switched','revealed'])('rejects stale results after the exercise is %s during the check',async(change)=>{
    const f=fixture();let release!:(value:{depth:number;lines:EngineLine[]})=>void;
    vi.spyOn(UciEngine.prototype,'analyze').mockImplementationOnce(()=>new Promise(resolve=>{release=resolve;}));
    const pending=f.service.answerQuietChecked(f.attempt,'f1','f1c4');
    if(change==='deactivated')f.db.prepare("UPDATE training_items SET active=0 WHERE id='quiet'").run();
    if(change==='player switched'){
      const imported=new ImportService(f.db).import('[White "Another learner"]\n[Black "Another opponent"]\n\n1. d4 *','Another learner');
      setActiveProfile(f.db,imported.profileId!);
    }
    if(change==='revealed')f.service.revealQuiet(f.attempt);
    release({depth:14,lines:[f.line('f1c4',0)]});
    await expect(pending).rejects.toThrow(change==='revealed'?'already been answered':'Attempt not found');
    expect(f.db.prepare('SELECT COUNT(*) FROM training_attempts WHERE answered_at IS NOT NULL').pluck().get()).toBe(change==='revealed'?1:0);
  });
});
