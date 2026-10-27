import { describe, expect, it, vi } from "vitest";
import { Chess } from "chess.js";
import type { EngineLine } from "../analysis/uci-engine.js";
import { checkQuietMove, QUIET_CHECK_NODES } from "./quiet-move-verifier.js";

const fen = '8/8/8/8/8/8/P3K3/1N4k1 w - - 0 10';
const history = {initialFen:fen,moves:[]};
function line(moveUci:string, cp:number, depth=12): EngineLine {
  const moveSan = new Chess(fen).move({from:moveUci.slice(0,2),to:moveUci.slice(2,4)}).san;
  return {moveUci,moveSan,centipawnsWhite:cp,mateInWhite:null,rank:1,depth,pvUci:[moveUci],pvSan:[moveSan]};
}
describe('bounded quiet-move verification',()=>{
  it('checks an unlisted quiet alternative with full history and explicit search limits',async()=>{
    const analyze=vi.fn().mockResolvedValueOnce({lines:[line('b1c3',30)]}).mockResolvedValueOnce({lines:[line('a2a3',20)]});
    expect(await checkQuietMove({analyze},fen,'a2a3',30,history)).toMatchObject({status:'useful',depth:12,lossCp:10});
    expect(analyze.mock.calls.map(call=>[call[1],call[5],call[6]])).toEqual([[16,QUIET_CHECK_NODES,history],[16,QUIET_CHECK_NODES,history]]);
    expect(analyze.mock.calls[1]![3]).toEqual(['a2a3']);
  });
  it('promotes a stronger restricted result and distinguishes a materially weaker move',async()=>{
    const strong={analyze:vi.fn().mockResolvedValueOnce({lines:[line('b1c3',20)]}).mockResolvedValueOnce({lines:[line('a2a3',150)]})};
    expect(await checkQuietMove(strong,fen,'a2a3',12,history)).toMatchObject({status:'useful',lossCp:0,bestMoveSan:'a3'});
    const weak={analyze:vi.fn().mockResolvedValueOnce({lines:[line('b1c3',100)]}).mockResolvedValueOnce({lines:[line('a2a3',-100)]})};
    expect(await checkQuietMove(weak,fen,'a2a3',12,history)).toMatchObject({status:'weaker',lossCp:200});
  });
  it('rejects shallow and missing scores rather than giving invented credit',async()=>{
    const analyze=vi.fn().mockResolvedValue({lines:[line('a2a3',0,9)]});
    await expect(checkQuietMove({analyze},fen,'a2a3',12,history)).rejects.toThrow('reliable comparison');
    analyze.mockResolvedValue({lines:[{...line('a2a3',0),centipawnsWhite:null}]});
    await expect(checkQuietMove({analyze},fen,'a2a3',12,history)).rejects.toThrow('reliable comparison');
  });
  it('describes a sound capture as forcing rather than a quiet plan',async()=>{
    const position='6k1/8/8/8/8/8/1q6/1R4K1 w - - 0 1';
    const capture={...line('a2a3',900),moveUci:'b1b2',moveSan:'Rxb2',pvUci:['b1b2'],pvSan:['Rxb2']};
    expect(await checkQuietMove({analyze:vi.fn().mockResolvedValue({lines:[capture]})},position,'b1b2',12,{initialFen:position,moves:[]})).toMatchObject({status:'forcing',lossCp:0});
  });
});
